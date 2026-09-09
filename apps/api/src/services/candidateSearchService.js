import { z } from 'zod'
import {
  CandidateValidationError,
  normalizeLinkedInUrl,
} from './candidateService.js'
import {
  analyzeCandidate,
  isMockCandidateMatchingEnabled,
} from './candidateMatchService.js'
import { createCandidateSource } from './candidateSources/candidateSourceFactory.js'

const MAX_REAL_AI_CONCURRENCY = 1

const textField = z.string().trim().max(255).default('')
const listField = z
  .array(z.string().trim().min(1).max(255))
  .max(100)
  .default([])
const experienceField = z.number().finite().nonnegative().optional()

const candidateSearchSchema = z
  .object({
    role: textField,
    requiredSkills: listField,
    preferredSkills: listField,
    minExperience: experienceField,
    maxExperience: experienceField,
    location: textField,
    keywords: listField,
    excludeKeywords: listField,
    source: z.enum(['database', 'external', 'both']).default('both'),
  })
  .strict()
  .superRefine((search, context) => {
    if (
      search.minExperience !== undefined &&
      search.maxExperience !== undefined &&
      search.minExperience > search.maxExperience
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxExperience'],
        message: 'Maximum experience must be greater than or equal to minimum experience.',
      })
    }
  })

export function validateCandidateSearchCriteria(input) {
  const validation = candidateSearchSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate search.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return validation.data
}

function normalize(value) {
  return value?.trim().toLowerCase() ?? ''
}

function getLinkedInIdentity(candidate) {
  if (!candidate.linkedinUrl) {
    return null
  }

  try {
    return normalizeLinkedInUrl(candidate.linkedinUrl)
  } catch {
    return normalize(candidate.linkedinUrl)
  }
}

function getFallbackIdentity(candidate) {
  if (
    !candidate.fullName ||
    !candidate.currentCompany ||
    !candidate.currentTitle
  ) {
    return null
  }

  return [
    normalize(candidate.fullName),
    normalize(candidate.currentCompany),
    normalize(candidate.currentTitle),
  ].join('|')
}

function isSameCandidate(firstCandidate, secondCandidate) {
  const firstLinkedIn = getLinkedInIdentity(firstCandidate)
  const secondLinkedIn = getLinkedInIdentity(secondCandidate)

  if (firstLinkedIn && secondLinkedIn) {
    return firstLinkedIn === secondLinkedIn
  }

  const firstEmail = normalize(firstCandidate.email)
  const secondEmail = normalize(secondCandidate.email)

  if (firstEmail && secondEmail) {
    return firstEmail === secondEmail
  }

  const firstFallback = getFallbackIdentity(firstCandidate)
  const secondFallback = getFallbackIdentity(secondCandidate)

  return Boolean(firstFallback && firstFallback === secondFallback)
}

export function deduplicateCandidateResults(candidates) {
  return candidates.reduce((uniqueCandidates, candidate) => {
    if (
      !uniqueCandidates.some((existingCandidate) =>
        isSameCandidate(existingCandidate, candidate),
      )
    ) {
      uniqueCandidates.push(candidate)
    }

    return uniqueCandidates
  }, [])
}

export async function analyzeCandidateResults(
  candidates,
  job,
  analyzer = analyzeCandidate,
  concurrency = isMockCandidateMatchingEnabled()
    ? Math.max(1, candidates.length)
    : MAX_REAL_AI_CONCURRENCY,
) {
  if (candidates.length === 0) {
    return []
  }

  const scoredCandidates = new Array(candidates.length)
  let nextCandidateIndex = 0

  async function worker() {
    while (nextCandidateIndex < candidates.length) {
      const candidateIndex = nextCandidateIndex
      nextCandidateIndex += 1
      const candidate = candidates[candidateIndex]

      try {
        const matchAnalysis = await analyzer(job, candidate)

        scoredCandidates[candidateIndex] = {
          ...candidate,
          matchScore: matchAnalysis.overallScore,
          matchAnalysis,
        }
      } catch (error) {
        console.error('Candidate match analysis failed.', {
          errorType: error?.constructor?.name,
          candidateIndex,
        })
        scoredCandidates[candidateIndex] = {
          ...candidate,
          matchScore: null,
          matchAnalysis: null,
          matchError: 'Unable to score candidate.',
        }
      }
    }
  }

  const workerCount = Math.min(
    Math.max(1, concurrency),
    candidates.length,
  )
  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  )

  return scoredCandidates.sort(
    (firstCandidate, secondCandidate) =>
      (secondCandidate.matchScore ?? -1) -
      (firstCandidate.matchScore ?? -1),
  )
}

function resolveCandidateSources(requestedSource) {
  const sourceNames =
    requestedSource === 'both'
      ? ['database', 'external']
      : [requestedSource]

  return sourceNames.map(createCandidateSource)
}

export async function searchCandidates(input) {
  const search = validateCandidateSearchCriteria(input)
  const candidateSources = resolveCandidateSources(search.source)
  const sourceResults = await Promise.all(
    candidateSources.map((source) => source.searchCandidates(search)),
  )
  const deduplicatedResults = deduplicateCandidateResults(
    sourceResults.flat(),
  )
  const results = await analyzeCandidateResults(
    deduplicatedResults,
    search,
  )

  return {
    results,
    summary: {
      total: results.length,
      database: results.filter((candidate) => candidate.source === 'database')
        .length,
      external: results.filter((candidate) => candidate.source !== 'database')
        .length,
      saved: results.filter((candidate) => candidate.isSaved).length,
    },
  }
}
