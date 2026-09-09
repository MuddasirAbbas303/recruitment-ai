import { Op } from 'sequelize'
import { z } from 'zod'
import Candidate from '../models/Candidate.js'
import {
  CandidateValidationError,
  normalizeLinkedInUrl,
} from './candidateService.js'
import {
  analyzeCandidateResults,
  validateCandidateSearchCriteria,
} from './candidateSearchService.js'

const importedCandidateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255),
    linkedinUrl: z.string().trim().min(1).max(2_000),
    searchSnippet: z.string().trim().max(20_000).default(''),
    source: z.literal('google-linkedin').default('google-linkedin'),
  })
  .strict()

const importSearchResultsSchema = z
  .object({
    candidates: z.array(importedCandidateSchema).min(1).max(50),
    criteria: z.unknown().optional(),
  })
  .strict()

function formatValidationIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

function normalizeImportedCandidates(candidates) {
  const candidatesByLinkedInUrl = new Map()

  candidates.forEach((candidate, index) => {
    let linkedinUrl

    try {
      linkedinUrl = normalizeLinkedInUrl(candidate.linkedinUrl)
    } catch {
      throw new CandidateValidationError('Invalid imported candidate data.', [
        {
          path: `candidates.${index}.linkedinUrl`,
          message: 'A valid LinkedIn profile URL is required.',
        },
      ])
    }

    if (!candidatesByLinkedInUrl.has(linkedinUrl)) {
      candidatesByLinkedInUrl.set(linkedinUrl, {
        ...candidate,
        linkedinUrl,
      })
    }
  })

  return [...candidatesByLinkedInUrl.values()]
}

function toImportedCandidate(candidate, existingCandidate) {
  if (existingCandidate) {
    const savedCandidate = existingCandidate.toJSON()

    return {
      ...savedCandidate,
      externalId: savedCandidate.id,
      searchSnippet: candidate.searchSnippet,
      source: 'google-linkedin',
      isSaved: true,
    }
  }

  return {
    externalId: candidate.linkedinUrl,
    id: candidate.linkedinUrl,
    fullName: candidate.fullName,
    currentTitle: null,
    currentCompany: null,
    location: null,
    linkedinUrl: candidate.linkedinUrl,
    email: null,
    yearsOfExperience: null,
    skills: [],
    summary: candidate.searchSnippet || null,
    searchSnippet: candidate.searchSnippet,
    source: 'google-linkedin',
    notes: '',
    isSaved: false,
  }
}

export async function importCandidateSearchResults(input) {
  const validation = importSearchResultsSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate search results.',
      formatValidationIssues(validation.error.issues),
    )
  }

  const normalizedCandidates = normalizeImportedCandidates(
    validation.data.candidates,
  )
  const linkedInUrls = normalizedCandidates.map(
    (candidate) => candidate.linkedinUrl,
  )
  const existingCandidates = await Candidate.findAll({
    where: { linkedinUrl: { [Op.in]: linkedInUrls } },
  })
  const existingCandidatesByLinkedInUrl = new Map(
    existingCandidates.map((candidate) => [candidate.linkedinUrl, candidate]),
  )
  const importedCandidates = normalizedCandidates.map((candidate) =>
    toImportedCandidate(
      candidate,
      existingCandidatesByLinkedInUrl.get(candidate.linkedinUrl),
    ),
  )

  if (validation.data.criteria === undefined) {
    return { criteria: null, results: importedCandidates }
  }

  const criteria = validateCandidateSearchCriteria(validation.data.criteria)
  const results = await analyzeCandidateResults(importedCandidates, criteria)

  return { criteria, results }
}
