import { z } from 'zod'
import { CandidateValidationError } from './candidateService.js'
import {
  analyzeCandidateResults,
  validateCandidateSearchCriteria,
} from './candidateSearchService.js'
import {
  getImportSession,
  updateImportSession,
} from './importSessionService.js'

const monthNumbers = new Map([
  ['jan', 0], ['january', 0],
  ['feb', 1], ['february', 1],
  ['mar', 2], ['march', 2],
  ['apr', 3], ['april', 3],
  ['may', 4],
  ['jun', 5], ['june', 5],
  ['jul', 6], ['july', 6],
  ['aug', 7], ['august', 7],
  ['sep', 8], ['sept', 8], ['september', 8],
  ['oct', 9], ['october', 9],
  ['nov', 10], ['november', 10],
  ['dec', 11], ['december', 11],
])

function parseMonth(value, presentMonthIndex) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === 'present' || normalized === 'current') {
    return presentMonthIndex
  }

  const match = normalized.match(/^([a-z]+)\s+(\d{4})$/)

  if (!match || !monthNumbers.has(match[1])) {
    return null
  }

  return Number(match[2]) * 12 + monthNumbers.get(match[1])
}

export function calculateTotalExperienceYears(
  employmentHistory,
  referenceDate = new Date(),
) {
  if (!Array.isArray(employmentHistory) || employmentHistory.length === 0) {
    return null
  }

  const presentMonthIndex =
    referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth()
  const ranges = employmentHistory.map((employment) => {
    const start = parseMonth(employment.startDate, presentMonthIndex)
    const end = parseMonth(employment.endDate, presentMonthIndex)

    if (start === null || end === null || end < start) {
      return null
    }

    return { start, end: end + 1 }
  })

  if (ranges.some((range) => range === null)) {
    return null
  }

  ranges.sort((first, second) => first.start - second.start)
  const mergedRanges = []

  for (const range of ranges) {
    const previous = mergedRanges.at(-1)

    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      mergedRanges.push({ ...range })
    }
  }

  const totalMonths = mergedRanges.reduce(
    (total, range) => total + range.end - range.start,
    0,
  )

  return Math.round((totalMonths / 12) * 10) / 10
}

export function parseEmploymentDateRange(value) {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.trim().match(
    /^(.+?)\s*(?:-|–|—|to)\s*(present|current|.+)$/i,
  )

  if (!match) {
    return null
  }

  return {
    startDate: match[1].trim(),
    endDate: /^(?:present|current)$/i.test(match[2].trim())
      ? 'Present'
      : match[2].trim(),
  }
}

const employmentEvidenceSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    jobTitle: z.string().trim().min(1).max(255).optional(),
    company: z.string().trim().min(1).max(255),
    startDate: z.string().trim().min(1).max(100),
    endDate: z.string().trim().min(1).max(100),
    isCurrent: z.boolean().optional(),
    sourceUrl: z.string().trim().url().max(2_000),
  })
  .passthrough()
  .refine((entry) => entry.title || entry.jobTitle, {
    message: 'Employment title is required.',
  })

const experienceRequestSchema = z
  .object({
    candidate: z
      .object({
        id: z.string().trim().min(1).max(2_000),
        fullName: z.string().trim().min(1).max(255),
        linkedinUrl: z.string().trim().url().max(2_000),
      })
      .passthrough(),
    existingEmploymentEvidence: z
      .array(employmentEvidenceSchema)
      .max(50)
      .optional(),
    criteria: z.unknown().optional(),
    importSessionId: z.string().uuid().optional(),
    deferScoring: z.boolean().default(false),
  })
  .strict()

function sameCandidate(candidate, requestedCandidate) {
  return (
    candidate.id === requestedCandidate.id ||
    candidate.linkedinUrl === requestedCandidate.linkedinUrl
  )
}

export function normalizeEmploymentEntries(entries = []) {
  const normalized = []
  const identities = new Set()

  for (const entry of entries) {
    const validation = employmentEvidenceSchema.safeParse(entry)
    if (!validation.success) continue

    const value = validation.data
    const title = (value.title ?? value.jobTitle).trim()
    const isCurrent = /^(?:present|current)$/i.test(value.endDate)
    const normalizedEntry = {
      title,
      company: value.company.trim(),
      startDate: value.startDate.trim(),
      endDate: isCurrent ? 'Present' : value.endDate.trim(),
      isCurrent,
      sourceUrl: value.sourceUrl,
    }
    const identity = Object.values(normalizedEntry)
      .map((item) => String(item).toLowerCase())
      .join('|')

    if (!identities.has(identity)) {
      identities.add(identity)
      normalized.push(normalizedEntry)
    }
  }

  return normalized
}

function toCalculationEntries(entries) {
  return entries.map((entry) => ({
    jobTitle: entry.title,
    company: entry.company,
    startDate: entry.startDate,
    endDate: entry.endDate,
    sourceUrl: entry.sourceUrl,
  }))
}

function sortByScore(candidates) {
  return [...candidates].sort(
    (first, second) =>
      (Number.isFinite(second.matchScore) ? second.matchScore : -1) -
      (Number.isFinite(first.matchScore) ? first.matchScore : -1),
  )
}

function updateTemporaryCandidate(importSessionId, criteria, candidate) {
  if (!importSessionId) return

  const session = getImportSession(importSessionId)
  const index = session.candidates.findIndex((item) =>
    sameCandidate(item, candidate),
  )
  if (index === -1) {
    throw new CandidateValidationError('Candidate was not found in the import session.')
  }

  const candidates = [...session.candidates]
  candidates[index] = candidate
  updateImportSession(importSessionId, {
    criteria,
    candidates: sortByScore(candidates),
  })
}

export async function processCandidateExperience(input, dependencies = {}) {
  const validation = experienceRequestSchema.safeParse(input)
  if (!validation.success) {
    throw new CandidateValidationError('Invalid candidate experience request.')
  }

  const request = validation.data
  const session = request.importSessionId
    ? getImportSession(request.importSessionId)
    : null
  const sessionCandidate = session?.candidates.find((candidate) =>
    sameCandidate(candidate, request.candidate),
  )
  if (session && !sessionCandidate) {
    throw new CandidateValidationError('Candidate was not found in the import session.')
  }

  let candidate = sessionCandidate ?? request.candidate
  let criteria = request.criteria === undefined
    ? session?.criteria ?? null
    : validateCandidateSearchCriteria(request.criteria)
  let rawEmploymentHistory = [
    ...(candidate.employmentHistory ?? []),
    ...(request.existingEmploymentEvidence ?? []),
  ]
  let employmentHistory = normalizeEmploymentEntries(rawEmploymentHistory)
  let hasPartialEmploymentEvidence =
    rawEmploymentHistory.length > employmentHistory.length
  let calculatedExperience = hasPartialEmploymentEvidence
    ? null
    : calculateTotalExperienceYears(toCalculationEntries(employmentHistory))
  const hasVerifiedExplicitExperience =
    Number.isFinite(candidate.yearsOfExperience) &&
    candidate.yearsOfExperience >= 0
  let enrichmentStatus =
    calculatedExperience !== null || hasVerifiedExplicitExperience
      ? 'NOT_NEEDED'
      : 'NOT_RUN'
  let retrievalError = null

  if (calculatedExperience === null && !hasVerifiedExplicitExperience) {
    try {
      const enrich = dependencies.enrich ?? (await import(
        './candidateEnrichmentService.js'
      )).enrichPublicCandidate
      const enrichmentResult = await enrich({
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: candidate.currentTitle ?? null,
          currentCompany: candidate.currentCompany ?? null,
          location: candidate.location ?? null,
          resultTitle: candidate.resultTitle ?? null,
          searchSnippet: candidate.searchSnippet ?? null,
          visibleSecondaryText: candidate.visibleSecondaryText ?? null,
        },
        ...(criteria ? { criteria } : {}),
        ...(request.importSessionId
          ? { importSessionId: request.importSessionId }
          : {}),
        skipScoring: request.deferScoring,
      }, dependencies.enrichmentDependencies ?? {})
      candidate = enrichmentResult.candidate
      rawEmploymentHistory = candidate.employmentHistory ?? []
      employmentHistory = normalizeEmploymentEntries(rawEmploymentHistory)
      hasPartialEmploymentEvidence =
        rawEmploymentHistory.length > employmentHistory.length
      calculatedExperience = hasPartialEmploymentEvidence
        ? null
        : calculateTotalExperienceYears(toCalculationEntries(employmentHistory))
      enrichmentStatus = 'SUCCEEDED'
    } catch {
      enrichmentStatus = 'FAILED'
      retrievalError = 'Unable to complete professional experience automatically.'
      candidate = {
        ...candidate,
        experienceStatus: 'INCOMPLETE',
        yearsOfExperience: null,
      }
    }
  }

  const yearsOfExperience = calculatedExperience ??
    (Number.isFinite(candidate.yearsOfExperience)
      ? candidate.yearsOfExperience
      : null)
  const experienceStatus = yearsOfExperience === null ? 'INCOMPLETE' : 'COMPLETE'
  candidate = {
    ...candidate,
    employmentHistory,
    yearsOfExperience,
    experienceStatus,
    enrichmentStatus,
  }

  let scoringStatus = 'NOT_RUN'
  if (criteria && !request.deferScoring) {
    try {
      if (!candidate.matchAnalysis) {
        const analyzeResults = dependencies.analyzeResults ?? analyzeCandidateResults
        ;[candidate] = await analyzeResults([candidate], criteria)
      }
      scoringStatus = Number.isFinite(candidate.matchScore)
        ? 'SUCCEEDED'
        : candidate.matchError === 'Insufficient information'
          ? 'INSUFFICIENT_EVIDENCE'
          : 'FAILED'
    } catch {
      scoringStatus = 'FAILED'
      candidate = {
        ...candidate,
        matchScore: null,
        matchAnalysis: null,
        matchError: 'Unable to score candidate.',
      }
    }
  }

  candidate = { ...candidate, enrichmentStatus, scoringStatus }

  updateTemporaryCandidate(request.importSessionId, criteria, candidate)

  return {
    candidate,
    employmentHistory,
    experienceStatus,
    yearsOfExperience,
    enrichmentStatus,
    scoringStatus,
    ...(retrievalError && { retrievalError }),
    ...(Number.isFinite(candidate.matchScore) && {
      matchScore: candidate.matchScore,
      matchAnalysis: candidate.matchAnalysis,
    }),
  }
}
