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
import {
  getImportSession,
  updateImportSession,
} from './importSessionService.js'

const importedCandidateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255),
    linkedinUrl: z.string().trim().min(1).max(2_000),
    resultTitle: z.string().trim().max(2_000).default(''),
    searchSnippet: z.string().trim().max(20_000).default(''),
    visibleSecondaryText: z.string().trim().max(2_000).default(''),
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

function cleanEvidenceValue(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function cleanResultTitle(value) {
  return cleanEvidenceValue(value)
    .replace(/\s*[|·]\s*LinkedIn.*$/i, '')
    .replace(/\s+[-–—]\s+LinkedIn.*$/i, '')
    .trim()
}

function parseLabeledEvidence(evidence, labels) {
  const labelPattern = labels.join('|')
  const match = evidence.match(
    new RegExp(`(?:^|[.;|])\\s*(?:${labelPattern})\\s*[:–—-]\\s*([^.;|]+)`, 'i'),
  )

  return cleanEvidenceValue(match?.[1]) || null
}

function parseSkillsEvidence(evidence) {
  const match = evidence.match(
    /(?:^|[.;|])\s*(?:skills?|technologies)\s*[:–—-]\s*(.*?)(?=(?:\.\s+(?:\d{1,2}(?:\.\d+)?\+?\s+years?|location\s*[:–—-]|based in\s*[:–—-]))|[;|]|$)/i,
  )
  const value = cleanEvidenceValue(match?.[1])

  if (!value) {
    return []
  }

  return [
    ...new Map(
      value
        .split(/[,·•]/)
        .map(cleanEvidenceValue)
        .filter((skill) => skill && skill.length <= 100)
        .map((skill) => [skill.toLowerCase(), skill]),
    ).values(),
  ].slice(0, 30)
}

export function extractPreliminaryCandidateFields(candidate) {
  const resultTitle = cleanResultTitle(candidate.resultTitle)
  const titleSegments = resultTitle
    .split(/\s+[-–—]\s+/)
    .map(cleanEvidenceValue)
    .filter(Boolean)
  const evidence = cleanEvidenceValue(
    [candidate.searchSnippet, candidate.visibleSecondaryText].join(' '),
  )
  let currentTitle = null
  let currentCompany = null

  if (titleSegments.length >= 2) {
    const professionalText = titleSegments.slice(1).join(' - ')
    const atCompanyMatch = professionalText.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i)

    if (atCompanyMatch) {
      currentTitle = cleanEvidenceValue(atCompanyMatch[1]) || null
      currentCompany = cleanEvidenceValue(atCompanyMatch[2]) || null
    } else if (titleSegments.length >= 3) {
      currentTitle = titleSegments[1]
      currentCompany = titleSegments.slice(2).join(' - ')
    } else {
      currentTitle = professionalText
    }
  }

  const experienceMatch = evidence.match(
    /\b(\d{1,2}(?:\.\d+)?)\+?\s+years?(?:\s+of)?\s+(?:professional\s+)?experience\b/i,
  )
  const yearsOfExperience = experienceMatch
    ? Number(experienceMatch[1])
    : null

  return {
    currentTitle,
    currentCompany,
    location: parseLabeledEvidence(evidence, ['location', 'based in']),
    yearsOfExperience: Number.isFinite(yearsOfExperience)
      ? yearsOfExperience
      : null,
    skills: parseSkillsEvidence(evidence),
  }
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
  const preliminaryFields = extractPreliminaryCandidateFields(candidate)

  if (existingCandidate) {
    const savedCandidate = existingCandidate.toJSON()

    return {
      ...savedCandidate,
      externalId: savedCandidate.id,
      currentTitle:
        savedCandidate.currentTitle || preliminaryFields.currentTitle,
      currentCompany:
        savedCandidate.currentCompany || preliminaryFields.currentCompany,
      location: savedCandidate.location || preliminaryFields.location,
      yearsOfExperience:
        savedCandidate.yearsOfExperience ??
        preliminaryFields.yearsOfExperience,
      skills:
        savedCandidate.skills?.length > 0
          ? savedCandidate.skills
          : preliminaryFields.skills,
      summary: savedCandidate.summary || candidate.searchSnippet || null,
      resultTitle: candidate.resultTitle,
      searchSnippet: candidate.searchSnippet,
      visibleSecondaryText: candidate.visibleSecondaryText,
      source: 'google-linkedin',
      isSaved: true,
    }
  }

  return {
    externalId: candidate.linkedinUrl,
    id: candidate.linkedinUrl,
    fullName: candidate.fullName,
    currentTitle: preliminaryFields.currentTitle,
    currentCompany: preliminaryFields.currentCompany,
    location: preliminaryFields.location,
    linkedinUrl: candidate.linkedinUrl,
    email: null,
    yearsOfExperience: preliminaryFields.yearsOfExperience,
    skills: preliminaryFields.skills,
    summary: candidate.searchSnippet || null,
    resultTitle: candidate.resultTitle,
    searchSnippet: candidate.searchSnippet,
    visibleSecondaryText: candidate.visibleSecondaryText,
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

export async function scoreImportSessionCandidates(
  importSessionId,
  input,
  dependencies = {},
) {
  const importSession = getImportSession(importSessionId)
  const criteria = validateCandidateSearchCriteria(input)
  const analyzeResults =
    dependencies.analyzeResults ?? analyzeCandidateResults
  const results = await analyzeResults(importSession.candidates, criteria)

  updateImportSession(importSessionId, {
    criteria,
    candidates: results,
  })

  return { criteria, results }
}
