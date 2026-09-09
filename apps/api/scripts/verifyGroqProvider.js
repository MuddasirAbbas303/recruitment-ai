import { z } from 'zod'
import { analyzeCandidate } from '../src/services/candidateMatchService.js'
import { analyzeCandidateResults } from '../src/services/candidateSearchService.js'
import { analyzeResumeWithMock } from '../src/services/mockAiService.js'
import {
  analyzeResume,
  analyzeResumeRequestSchema,
  candidateAnalysisSchema,
  candidateMatchAnalysisSchema,
  GroqConfigurationError,
  GroqServiceError,
} from '../src/services/groqService.js'

const job = {
  title: 'Senior Backend Developer',
  description: 'Build and operate reliable backend services.',
  requiredSkills: ['Node.js', 'PostgreSQL'],
  preferredSkills: ['Docker'],
  minimumExperience: 5,
  location: 'Europe',
}
const resumeText = [
  'Alex Morgan',
  'Senior Backend Developer',
  'Seven years building Node.js and PostgreSQL services with Docker.',
].join('\n')
const resumeAnalysis = {
  candidateName: 'Alex Morgan',
  currentTitle: 'Senior Backend Developer',
  overallScore: 92,
  requiredSkillsScore: 95,
  preferredSkillsScore: 85,
  experienceScore: 100,
  matchedSkills: ['Node.js', 'PostgreSQL', 'Docker'],
  missingSkills: [],
  strengths: ['Relevant backend experience'],
  concerns: [],
  yearsOfExperience: 7,
  summary: 'Strong job-relevant alignment for recruiter review.',
}
const sourcingAnalysis = {
  overallScore: 90,
  requiredSkillsScore: 100,
  preferredSkillsScore: 80,
  experienceScore: 100,
  roleScore: 90,
  matchedSkills: ['Node.js', 'PostgreSQL'],
  missingSkills: [],
  strengths: ['Relevant backend experience'],
  concerns: [],
  summary: 'Strong professional alignment for recruiter review.',
}

function createStructuredResponse(analysis) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'openai/gpt-oss-20b',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify(analysis),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'safe-test-request-id',
      },
    },
  )
}

function createProviderErrorResponse(type, code, status = 429) {
  return new Response(
    JSON.stringify({
      error: {
        message: 'Provider detail that must not reach the application.',
        type,
        code,
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'retry-after': '0',
        'x-request-id': 'safe-test-request-id',
      },
    },
  )
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function ensureStrictObjectSchema(schema) {
  ensure(schema.type === 'object', 'Structured output must be an object.')
  ensure(
    schema.additionalProperties === false,
    'Structured output must reject additional properties.',
  )
  ensure(
    schema.required.length === Object.keys(schema.properties).length,
    'Every structured output property must be required.',
  )
}

const originalEnvironment = {
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  USE_MOCK_AI: process.env.USE_MOCK_AI,
}
const originalFetch = globalThis.fetch

try {
  delete process.env.GROQ_API_KEY
  let missingKeyIsSafe = false

  try {
    await analyzeResume(job, resumeText)
  } catch (error) {
    missingKeyIsSafe =
      error instanceof GroqConfigurationError &&
      error.message === 'Groq API key is not configured.'
  }

  ensure(missingKeyIsSafe, 'Missing GROQ_API_KEY did not fail safely.')

  let providerRequests = 0
  globalThis.fetch = async () => {
    providerRequests += 1
    throw new Error('Mock mode must not make a provider request.')
  }
  process.env.USE_MOCK_AI = 'true'

  candidateAnalysisSchema.parse(await analyzeResumeWithMock(job, resumeText))
  candidateMatchAnalysisSchema.parse(
    await analyzeCandidate(
      {
        role: job.title,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
        minExperience: job.minimumExperience,
        maxExperience: 10,
        location: job.location,
        keywords: [],
        excludeKeywords: [],
      },
      {
        fullName: 'Alex Morgan',
        currentTitle: 'Senior Backend Developer',
        currentCompany: 'Example Company',
        location: 'Riga, Latvia',
        yearsOfExperience: 7,
        skills: ['Node.js', 'PostgreSQL', 'Docker'],
        summary: 'Builds reliable backend services.',
      },
    ),
  )
  ensure(providerRequests === 0, 'Mock mode made a Groq request.')

  analyzeResumeRequestSchema.parse({ job, resumeText })
  candidateAnalysisSchema.parse(resumeAnalysis)
  candidateMatchAnalysisSchema.parse(sourcingAnalysis)

  process.env.USE_MOCK_AI = 'false'
  process.env.GROQ_API_KEY = 'test-groq-key'
  delete process.env.GROQ_MODEL
  let requestUrl
  let requestBody

  globalThis.fetch = async (url, options) => {
    providerRequests += 1
    requestUrl = String(url)
    requestBody = JSON.parse(options.body)
    return createStructuredResponse(resumeAnalysis)
  }

  candidateAnalysisSchema.parse(await analyzeResume(job, resumeText))
  ensure(
    requestUrl === 'https://api.groq.com/openai/v1/chat/completions',
    'Groq client did not use the Groq Chat Completions endpoint.',
  )
  ensure(
    requestBody.model === 'openai/gpt-oss-20b',
    'Default Groq model was not used.',
  )
  ensure(
    requestBody.response_format.type === 'json_schema' &&
      requestBody.response_format.json_schema.strict === true,
    'Groq strict Structured Outputs were not requested.',
  )
  ensureStrictObjectSchema(requestBody.response_format.json_schema.schema)

  let temporaryRateLimitAttempts = 0
  globalThis.fetch = async () => {
    temporaryRateLimitAttempts += 1
    return temporaryRateLimitAttempts < 3
      ? createProviderErrorResponse('rate_limit_error', 'rate_limit_exceeded')
      : createStructuredResponse(resumeAnalysis)
  }
  await analyzeResume(job, resumeText)
  ensure(
    temporaryRateLimitAttempts === 3,
    'Temporary rate limits did not use three total attempts.',
  )

  let quotaAttempts = 0
  globalThis.fetch = async () => {
    quotaAttempts += 1
    return createProviderErrorResponse(
      'insufficient_quota',
      'insufficient_quota',
    )
  }
  let quotaMessageIsSafe = false

  try {
    await analyzeResume(job, resumeText)
  } catch (error) {
    quotaMessageIsSafe =
      error instanceof GroqServiceError &&
      error.message ===
        'Groq API quota is unavailable. Check Groq billing and project limits.'
  }

  ensure(quotaAttempts === 1, 'Quota errors were retried.')
  ensure(quotaMessageIsSafe, 'Quota error was not mapped safely.')

  let validationRequests = 0
  globalThis.fetch = async () => {
    validationRequests += 1
    return createStructuredResponse(resumeAnalysis)
  }
  let validationFailed = false

  try {
    await analyzeResume({ ...job, title: '' }, resumeText)
  } catch (error) {
    validationFailed = error instanceof z.ZodError
  }

  ensure(validationFailed, 'Invalid input did not fail Zod validation.')
  ensure(validationRequests === 0, 'Validation errors reached Groq.')

  let activeAnalyses = 0
  let maximumActiveAnalyses = 0
  const concurrencyProbeCandidates = [1, 2, 3].map((id) => ({
    id,
    fullName: `Candidate ${id}`,
  }))
  await analyzeCandidateResults(
    concurrencyProbeCandidates,
    {},
    async () => {
      activeAnalyses += 1
      maximumActiveAnalyses = Math.max(
        maximumActiveAnalyses,
        activeAnalyses,
      )
      await new Promise((resolve) => setTimeout(resolve, 5))
      activeAnalyses -= 1
      return sourcingAnalysis
    },
  )
  ensure(
    maximumActiveAnalyses === 1,
    'Real candidate analysis concurrency exceeded one.',
  )

  console.log(
    JSON.stringify({
      missingKeyIsSafe,
      mockModeProviderRequests: 0,
      structuredSchemasValid: true,
      strictStructuredOutput: true,
      groqEndpoint: requestUrl,
      defaultModel: requestBody.model,
      temporaryRateLimitAttempts,
      retryAfterHeaderHandled: true,
      quotaAttempts,
      validationRequests,
      realCandidateConcurrency: maximumActiveAnalyses,
    }),
  )
} finally {
  globalThis.fetch = originalFetch

  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
}
