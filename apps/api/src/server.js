import { randomUUID } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import multer from 'multer'
import database from './config/database.js'
import {
  CandidateNotFoundError,
  CandidateValidationError,
  getCandidateById,
  listCandidates,
  saveCandidate,
  updateCandidate,
} from './services/candidateService.js'
import { importCandidateSearchResults } from './services/candidateImportService.js'
import {
  createCandidateActivity,
  listCandidateActivities,
} from './services/candidateActivityService.js'
import {
  CandidateExportValidationError,
  generateCandidateWorkbook,
  getCandidateExportFilename,
} from './services/candidateExportService.js'
import {
  CandidateOutreachGenerationError,
  CandidateOutreachValidationError,
  generateCandidateOutreach,
  generateLinkedInOutreach,
} from './services/candidateOutreachService.js'
import {
  generateInterviewCalendar,
  generateInterviewInvitation,
  getInterviewCalendarFilename,
  InterviewInvitationGenerationError,
  InterviewInvitationValidationError,
} from './services/candidateInterviewService.js'
import {
  CandidateEnrichmentNotFoundError,
  CandidateEnrichmentUnavailableError,
  enrichPublicCandidate,
} from './services/candidateEnrichmentService.js'
import { searchCandidates } from './services/candidateSearchService.js'
import {
  CandidateSourceConfigurationError,
  CandidateSourceRequestError,
} from './services/candidateSources/candidateSourceFactory.js'
import {
  analyzeResume,
  analyzeResumeRequestSchema,
  candidateAnalysisSchema,
  GroqConfigurationError,
  GroqServiceError,
  testGroqConnection,
} from './services/groqService.js'
import { analyzeResumeWithMock } from './services/mockAiService.js'
import {
  createImportSession,
  getImportSession,
  ImportSessionNotFoundError,
} from './services/importSessionService.js'
import {
  extractResumeText,
  ResumeParserError,
} from './services/resumeParser.js'

const app = express()
const port = 3000
const uploadsDirectory = fileURLToPath(
  new URL('../uploads/resumes/', import.meta.url),
)
const allowedFileTypes = {
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function sanitizeFilename(originalName) {
  const extension = path.extname(originalName).toLowerCase()
  const baseName = path.basename(originalName, path.extname(originalName))
  const sanitizedBaseName =
    baseName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'resume'

  return `${sanitizedBaseName}${extension}`
}

const resumeStorage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsDirectory)
  },
  filename: (_request, file, callback) => {
    const uniqueFilename = `${Date.now()}-${randomUUID()}-${sanitizeFilename(file.originalname)}`
    callback(null, uniqueFilename)
  },
})

const uploadResumes = multer({
  storage: resumeStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    const expectedMimeType = allowedFileTypes[extension]

    if (expectedMimeType && file.mimetype === expectedMimeType) {
      callback(null, true)
      return
    }

    const error = new Error(
      'Unsupported file type. Only PDF and DOCX files are allowed.',
    )
    error.code = 'UNSUPPORTED_FILE_TYPE'
    callback(error)
  },
}).array('resumes', 20)

async function removeUploadedFiles(files = []) {
  await Promise.allSettled(files.map((file) => unlink(file.path)))
}

function getUploadError(error) {
  if (error.code === 'UNSUPPORTED_FILE_TYPE') {
    return {
      status: 400,
      message: 'Unsupported file type. Only PDF and DOCX files are allowed.',
    }
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      message: 'File too large. Each resume must be 10 MB or smaller.',
    }
  }

  if (
    error.code === 'LIMIT_FILE_COUNT' ||
    (error.code === 'LIMIT_UNEXPECTED_FILE' && error.field === 'resumes')
  ) {
    return {
      status: 400,
      message: 'Too many files. A maximum of 20 resumes is allowed.',
    }
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      status: 400,
      message: 'Unexpected file field. Use "resumes".',
    }
  }

  return {
    status: 500,
    message: 'Unable to upload resumes.',
  }
}

function parseSkillsField(value, fieldName) {
  if (value === undefined || value === '') {
    return []
  }

  let skills

  try {
    skills = JSON.parse(value)
  } catch {
    skills = value.split(',')
  }

  if (!Array.isArray(skills) || skills.some((skill) => typeof skill !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings.`)
  }

  return [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))]
}

function parseJobFields(body) {
  const minimumExperience =
    body.minimumExperience === undefined || body.minimumExperience === ''
      ? 0
      : Number(body.minimumExperience)
  const job = {
    title: body.title ?? '',
    description: body.description ?? '',
    requiredSkills: parseSkillsField(body.requiredSkills, 'requiredSkills'),
    preferredSkills: parseSkillsField(body.preferredSkills, 'preferredSkills'),
    minimumExperience,
    location: body.location ?? '',
  }
  const validation = analyzeResumeRequestSchema.safeParse({
    job,
    resumeText: 'Resume validation placeholder',
  })

  if (!validation.success) {
    const error = new Error('Invalid job information.')
    error.details = validation.error.issues
      .filter((issue) => issue.path[0] === 'job')
      .map((issue) => ({
        path: issue.path.slice(1).join('.'),
        message: issue.message,
      }))
    throw error
  }

  return validation.data.job
}

function isMockAiEnabled() {
  return process.env.USE_MOCK_AI?.trim().toLowerCase() === 'true'
}

async function mapWithConcurrency(items, mapper, concurrency) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const itemIndex = nextIndex
      nextIndex += 1
      results[itemIndex] = await mapper(items[itemIndex], itemIndex)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}

const allowedBrowserOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
const configuredExtensionOrigin =
  process.env.CHROME_EXTENSION_ORIGIN?.trim()

if (
  configuredExtensionOrigin &&
  /^chrome-extension:\/\/[a-p]{32}$/.test(configuredExtensionOrigin)
) {
  allowedBrowserOrigins.add(configuredExtensionOrigin)
}

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedBrowserOrigins.has(origin))
    },
    exposedHeaders: ['Content-Disposition'],
  }),
)
app.use(express.json({ limit: '5mb' }))

function sendHealthResponse(_request, response) {
  response.json({
    status: 'ok',
    message: 'Recruitment AI API is running',
    database: 'connected',
  })
}

app.get('/health', sendHealthResponse)
app.get('/api/health', sendHealthResponse)

function handleCandidateApiError(error, response, fallbackMessage) {
  if (error instanceof CandidateSourceConfigurationError) {
    console.error('Candidate source configuration failed.', {
      errorType: error.constructor.name,
    })
    response.status(500).json({
      success: false,
      error: error.message,
    })
    return
  }

  if (error instanceof CandidateSourceRequestError) {
    response.status(error.statusCode).json({
      success: false,
      error: error.message,
    })
    return
  }

  if (error instanceof CandidateValidationError) {
    response.status(400).json({
      success: false,
      error: error.message,
      ...(error.details.length > 0 && { details: error.details }),
    })
    return
  }

  if (error instanceof CandidateNotFoundError) {
    response.status(404).json({
      success: false,
      error: error.message,
    })
    return
  }

  console.error('Candidate API operation failed.', {
    errorType: error?.constructor?.name,
  })
  response.status(500).json({
    success: false,
    error: fallbackMessage,
  })
}

app.post('/api/candidates', async (request, response) => {
  try {
    const result = await saveCandidate(request.body)

    if (result.possibleDuplicate) {
      response.status(409).json({
        success: false,
        possibleDuplicate: true,
        candidate: result.candidate,
      })
      return
    }

    response.status(result.created ? 201 : 200).json({
      success: true,
      candidate: result.candidate,
      created: result.created,
      duplicateDetected: result.duplicateDetected,
    })
  } catch (error) {
    handleCandidateApiError(error, response, 'Unable to save candidate.')
  }
})

app.post('/api/candidates/search', async (request, response) => {
  try {
    const result = await searchCandidates(request.body)
    response.json({ success: true, ...result })
  } catch (error) {
    handleCandidateApiError(error, response, 'Unable to search candidates.')
  }
})

app.post('/api/candidates/generate-outreach', async (request, response) => {
  try {
    const outreach = await generateCandidateOutreach(request.body)
    response.json({ success: true, ...outreach })
  } catch (error) {
    if (error instanceof CandidateOutreachValidationError) {
      response.status(400).json({
        success: false,
        error: error.message,
        details: error.details,
      })
      return
    }

    if (error instanceof GroqConfigurationError) {
      response.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof GroqServiceError) {
      response.status(error.statusCode).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof CandidateOutreachGenerationError) {
      response.status(502).json({
        success: false,
        error: error.message,
      })
      return
    }

    console.error('Candidate outreach generation failed.', {
      errorType: error?.constructor?.name,
    })
    response.status(500).json({
      success: false,
      error: 'Unable to generate outreach.',
    })
  }
})

app.post(
  '/api/candidates/generate-linkedin-outreach',
  async (request, response) => {
    try {
      const outreach = await generateLinkedInOutreach(request.body)
      response.json({ success: true, ...outreach })
    } catch (error) {
      if (error instanceof CandidateOutreachValidationError) {
        response.status(400).json({
          success: false,
          error: error.message,
          details: error.details,
        })
        return
      }

      if (error instanceof GroqConfigurationError) {
        response.status(500).json({
          success: false,
          error: error.message,
        })
        return
      }

      if (error instanceof GroqServiceError) {
        response.status(error.statusCode).json({
          success: false,
          error: error.message,
        })
        return
      }

      if (error instanceof CandidateOutreachGenerationError) {
        response.status(502).json({
          success: false,
          error: error.message,
        })
        return
      }

      console.error('LinkedIn outreach generation failed.', {
        errorType: error?.constructor?.name,
      })
      response.status(500).json({
        success: false,
        error: 'Unable to generate LinkedIn outreach.',
      })
    }
  },
)

app.post(
  '/api/candidates/generate-interview-invitation',
  async (request, response) => {
    try {
      const invitation = await generateInterviewInvitation(request.body)
      response.json({ success: true, ...invitation })
    } catch (error) {
      if (error instanceof InterviewInvitationValidationError) {
        response.status(400).json({
          success: false,
          error: error.message,
          details: error.details,
        })
        return
      }

      if (error instanceof GroqConfigurationError) {
        response.status(500).json({
          success: false,
          error: error.message,
        })
        return
      }

      if (error instanceof GroqServiceError) {
        response.status(error.statusCode).json({
          success: false,
          error: error.message,
        })
        return
      }

      if (error instanceof InterviewInvitationGenerationError) {
        response.status(502).json({
          success: false,
          error: error.message,
        })
        return
      }

      console.error('Interview invitation generation failed.', {
        errorType: error?.constructor?.name,
      })
      response.status(500).json({
        success: false,
        error: 'Unable to generate interview invitation.',
      })
    }
  },
)

app.post('/api/candidates/interview-calendar', (request, response) => {
  try {
    const calendar = generateInterviewCalendar(request.body)
    const filename = getInterviewCalendarFilename(
      request.body.candidate,
      request.body.interview,
    )

    response.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    )
    response.setHeader('Content-Length', calendar.length)
    response.send(calendar)
  } catch (error) {
    if (error instanceof InterviewInvitationValidationError) {
      response.status(400).json({
        success: false,
        error: error.message,
        details: error.details,
      })
      return
    }

    console.error('Interview calendar generation failed.', {
      errorType: error?.constructor?.name,
    })
    response.status(500).json({
      success: false,
      error: 'Unable to create interview calendar invitation.',
    })
  }
})

app.post('/api/candidates/export', async (request, response) => {
  try {
    const workbook = await generateCandidateWorkbook(request.body)

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${getCandidateExportFilename()}"`,
    )
    response.setHeader('Content-Length', workbook.length)
    response.send(workbook)
  } catch (error) {
    if (error instanceof CandidateExportValidationError) {
      response.status(400).json({
        success: false,
        error: error.message,
        details: error.details,
      })
      return
    }

    console.error('Candidate export failed.', {
      errorType: error?.constructor?.name,
    })
    response.status(500).json({
      success: false,
      error: 'Unable to export candidates.',
    })
  }
})

app.post(
  '/api/candidates/import-search-results',
  async (request, response) => {
    try {
      const { criteria, results } = await importCandidateSearchResults(
        request.body,
      )
      const importSession = createImportSession({
        criteria,
        candidates: results,
      })
      response.json({
        success: true,
        importSessionId: importSession.id,
        results,
      })
    } catch (error) {
      handleCandidateApiError(
        error,
        response,
        'Unable to import candidate search results.',
      )
    }
  },
)

app.get('/api/candidates/import-sessions/:id', (request, response) => {
  try {
    const importSession = getImportSession(request.params.id)
    response.json({ success: true, results: importSession.candidates })
  } catch (error) {
    if (error instanceof ImportSessionNotFoundError) {
      response.status(404).json({
        success: false,
        error: error.message,
      })
      return
    }

    console.error('Unable to load candidate import session.', {
      errorType: error?.constructor?.name,
    })
    response.status(500).json({
      success: false,
      error: 'Unable to load candidate import session.',
    })
  }
})

app.post('/api/candidates/enrich-public', async (request, response) => {
  try {
    const result = await enrichPublicCandidate(request.body)
    response.json({ success: true, ...result })
  } catch (error) {
    if (
      error instanceof CandidateEnrichmentNotFoundError ||
      error instanceof ImportSessionNotFoundError
    ) {
      response.status(404).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof CandidateEnrichmentUnavailableError) {
      response.status(502).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof GroqConfigurationError) {
      response.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof GroqServiceError) {
      response.status(error.statusCode).json({
        success: false,
        error: error.message,
      })
      return
    }

    handleCandidateApiError(
      error,
      response,
      'Unable to enrich candidate from public sources.',
    )
  }
})

app.get('/api/candidates', async (request, response) => {
  try {
    const candidates = await listCandidates(request.query)
    response.json({ success: true, candidates })
  } catch (error) {
    handleCandidateApiError(error, response, 'Unable to load candidates.')
  }
})

app.get('/api/candidates/:id/activities', async (request, response) => {
  try {
    const activities = await listCandidateActivities(request.params.id)
    response.json({ success: true, activities })
  } catch (error) {
    handleCandidateApiError(
      error,
      response,
      'Unable to load candidate activities.',
    )
  }
})

app.post('/api/candidates/:id/activities', async (request, response) => {
  try {
    const result = await createCandidateActivity(
      request.params.id,
      request.body,
    )
    response.status(201).json({ success: true, ...result })
  } catch (error) {
    handleCandidateApiError(
      error,
      response,
      'Unable to create candidate activity.',
    )
  }
})

app.patch('/api/candidates/:id', async (request, response) => {
  try {
    const candidate = await updateCandidate(request.params.id, request.body)
    response.json({ success: true, candidate })
  } catch (error) {
    handleCandidateApiError(error, response, 'Unable to update candidate.')
  }
})

app.get('/api/candidates/:id', async (request, response) => {
  try {
    const candidate = await getCandidateById(request.params.id)
    response.json({ success: true, candidate })
  } catch (error) {
    handleCandidateApiError(error, response, 'Unable to load candidate.')
  }
})

app.get('/api/ai/test', async (_request, response) => {
  try {
    const result = await testGroqConnection()
    response.json(result)
  } catch (error) {
    if (error instanceof GroqConfigurationError) {
      response.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof GroqServiceError) {
      response.status(error.statusCode).json({
        success: false,
        error: error.message,
      })
      return
    }

    console.error('Unexpected Groq API test failure.', {
      provider: 'groq',
      errorType: error?.constructor?.name,
      classification: 'unexpected',
    })
    response.status(500).json({
      success: false,
      error: 'Unable to test the Groq connection.',
    })
  }
})

app.post('/api/ai/analyze', async (request, response) => {
  const validation = analyzeResumeRequestSchema.safeParse(request.body)

  if (!validation.success) {
    response.status(400).json({
      success: false,
      error: 'Invalid request. A complete job and non-empty resumeText are required.',
      details: validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  try {
    const result = await analyzeResume(
      validation.data.job,
      validation.data.resumeText,
    )
    response.json(result)
  } catch (error) {
    if (error instanceof GroqConfigurationError) {
      response.status(500).json({
        success: false,
        error: error.message,
      })
      return
    }

    if (error instanceof GroqServiceError) {
      response.status(error.statusCode).json({
        success: false,
        error: error.message,
      })
      return
    }

    console.error('Unexpected resume analysis error.', {
      provider: 'groq',
      errorType: error?.constructor?.name,
      classification: 'unexpected',
    })
    response.status(500).json({
      success: false,
      error: 'Unable to analyze the resume.',
    })
  }
})

app.post('/api/resumes/analyze', (request, response) => {
  uploadResumes(request, response, async (error) => {
    if (error) {
      await removeUploadedFiles(request.files)
      const uploadError = getUploadError(error)
      response.status(uploadError.status).json({
        success: false,
        error: uploadError.message,
      })
      return
    }

    if (!request.files?.length) {
      response.status(400).json({
        success: false,
        error: 'No files supplied.',
      })
      return
    }

    let job

    try {
      job = parseJobFields(request.body)
    } catch (validationError) {
      await removeUploadedFiles(request.files)
      response.status(400).json({
        success: false,
        error: validationError.message,
        details: validationError.details,
      })
      return
    }

    const analyzeCandidate = isMockAiEnabled()
      ? analyzeResumeWithMock
      : analyzeResume
    let processedResumes

    try {
      processedResumes = await mapWithConcurrency(
        request.files,
        async (file) => {
          try {
            const resumeText = await extractResumeText(
              file.path,
              file.mimetype,
            )
            const analysis = await analyzeCandidate(job, resumeText)
            const validatedAnalysis = candidateAnalysisSchema.parse(analysis)

            return {
              fileName: file.originalname,
              status: 'success',
              ...validatedAnalysis,
            }
          } catch (analysisError) {
            console.error('Resume analysis failed.', {
              errorType:
                analysisError instanceof ResumeParserError
                  ? 'resume_parser_error'
                  : analysisError instanceof GroqConfigurationError ||
                      analysisError instanceof GroqServiceError
                    ? 'groq_service_error'
                    : 'unexpected_error',
              classification: isMockAiEnabled()
                ? 'mock_analysis_failure'
                : 'groq_analysis_failure',
            })

            return {
              fileName: file.originalname,
              status: 'failed',
              error:
                analysisError instanceof ResumeParserError
                  ? analysisError.message
                  : analysisError instanceof GroqConfigurationError ||
                      analysisError instanceof GroqServiceError
                    ? analysisError.message
                    : 'Unable to analyze using Groq.',
            }
          }
        },
        isMockAiEnabled() ? request.files.length : 1,
      )
    } finally {
      await removeUploadedFiles(request.files)
    }

    const results = processedResumes
      .filter((result) => result.status === 'success')
      .sort(
        (firstResult, secondResult) =>
          secondResult.overallScore - firstResult.overallScore,
      )
    const failed = processedResumes.filter(
      (result) => result.status === 'failed',
    )

    response.json({
      success: true,
      results,
      failed,
    })
  })
})

app.post('/api/resumes/upload', (request, response) => {
  uploadResumes(request, response, async (error) => {
    if (error) {
      await removeUploadedFiles(request.files)
      const uploadError = getUploadError(error)
      response.status(uploadError.status).json({
        success: false,
        error: uploadError.message,
      })
      return
    }

    if (!request.files?.length) {
      response.status(400).json({
        success: false,
        error: 'No files supplied.',
      })
      return
    }

    let resumes

    try {
      resumes = await Promise.all(
        request.files.map(async (file) => {
          try {
            const text = await extractResumeText(file.path, file.mimetype)

            return {
              originalName: file.originalname,
              status: 'success',
              text,
            }
          } catch (parseError) {
            console.error('Resume text extraction failed.', {
              errorType:
                parseError instanceof ResumeParserError
                  ? 'resume_parser_error'
                  : 'unexpected_error',
            })

            return {
              originalName: file.originalname,
              status: 'failed',
              error:
                parseError instanceof ResumeParserError
                  ? parseError.message
                  : 'Unable to extract text',
            }
          }
        }),
      )
    } finally {
      await removeUploadedFiles(request.files)
    }

    response.status(201).json({
      success: true,
      resumes,
    })
  })
})

async function startServer() {
  try {
    await mkdir(uploadsDirectory, { recursive: true })
    await database.authenticate()
    console.log('Database connected successfully')

    app.listen(port, () => {
      console.log('API running on http://localhost:3000')
    })
  } catch (error) {
    console.error('Database connection failed:', error)
  }
}

startServer()
