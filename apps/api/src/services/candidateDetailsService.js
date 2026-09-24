import { z } from 'zod'
import Candidate from '../models/Candidate.js'
import {
  CandidateNotFoundError,
  CandidateValidationError,
} from './candidateService.js'
import {
  calculateTotalExperienceYears,
} from './candidateExperienceService.js'
import {
  getImportSession,
  updateImportSession,
} from './importSessionService.js'

const nullableString = z.string().trim().max(255).nullable()
const employmentEntrySchema = z.object({
  title: z.string().trim().min(1).max(255),
  company: z.string().trim().min(1).max(255),
  startDate: z.string().trim().min(1).max(50),
  endDate: z.string().trim().min(1).max(50),
  isCurrent: z.boolean().default(false),
  sourceUrl: z.string().trim().max(2_000).nullable().optional(),
}).strict()

const detailsSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  currentTitle: nullableString,
  currentCompany: nullableString,
  location: nullableString,
  email: z.union([z.string().trim().email().max(255), z.literal(''), z.null()]),
  skills: z.array(z.string().trim().min(1).max(255)).max(100),
  summary: z.string().trim().max(20_000).nullable(),
  yearsOfExperience: z.number().finite().nonnegative().nullable(),
  employmentHistory: z.array(employmentEntrySchema).max(50),
}).strict()

function normalizeDetails(input) {
  const validation = detailsSchema.safeParse(input)
  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate details.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  const rawHistory = validation.data.employmentHistory.map((entry) => ({
    ...entry,
    endDate: entry.isCurrent ? 'Present' : entry.endDate,
  }))
  const employmentHistory = rawHistory.map((entry) => ({
    ...entry,
    sourceUrl: entry.sourceUrl || null,
  }))
  const calculatedExperience = employmentHistory.length
    ? calculateTotalExperienceYears(
        employmentHistory.map((entry) => ({
          ...entry,
          jobTitle: entry.title,
        })),
      )
    : null
  if (employmentHistory.length > 0 && calculatedExperience === null) {
    throw new CandidateValidationError(
      'Employment dates are incomplete or unsupported.',
    )
  }

  const details = {
    ...validation.data,
    email: validation.data.email || null,
    skills: [...new Set(validation.data.skills)],
    employmentHistory,
    yearsOfExperience:
      employmentHistory.length > 0
        ? calculatedExperience
        : validation.data.yearsOfExperience,
  }
  const fieldOrigins = Object.fromEntries(
    Object.keys(details).map((field) => [field, 'manual']),
  )
  return { details, fieldOrigins }
}

export function prepareCandidateDetailsUpdate(input) {
  return normalizeDetails(input)
}

export async function updateSavedCandidateDetails(id, input, dependencies = {}) {
  const idValidation = z.string().uuid().safeParse(id)
  if (!idValidation.success) throw new CandidateValidationError('Invalid candidate ID.')
  const { details, fieldOrigins } = normalizeDetails(input)
  const CandidateModel = dependencies.CandidateModel ?? Candidate
  const candidate = await CandidateModel.findByPk(idValidation.data)
  if (!candidate) throw new CandidateNotFoundError('Candidate not found.')
  await candidate.update({
    ...details,
    fieldOrigins: { ...(candidate.fieldOrigins ?? {}), ...fieldOrigins },
  })
  return candidate
}

export function updateTemporaryCandidateDetails(
  sessionId,
  candidateId,
  input,
) {
  const { details, fieldOrigins } = normalizeDetails(input)
  const session = getImportSession(sessionId)
  const index = session.candidates.findIndex(
    (candidate) => candidate.id === candidateId,
  )
  if (index === -1) throw new CandidateNotFoundError('Candidate not found.')
  const existing = session.candidates[index]
  const updated = {
    ...existing,
    ...details,
    linkedinUrl: existing.linkedinUrl,
    notes: existing.notes,
    status: existing.status,
    enrichment: existing.enrichment,
    fieldOrigins: { ...(existing.fieldOrigins ?? {}), ...fieldOrigins },
  }
  const candidates = [...session.candidates]
  candidates[index] = updated
  updateImportSession(sessionId, { criteria: session.criteria, candidates })
  return updated
}
