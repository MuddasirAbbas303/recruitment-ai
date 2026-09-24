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
import {
  calculateTotalExperienceYears,
  parseEmploymentDateRange,
} from './candidateExperienceService.js'
import {
  CandidateSearchSessionNotFoundError,
  getCandidateSearchSession,
} from './candidateSearchSessionService.js'

const importedCandidateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255),
    linkedinUrl: z.string().trim().min(1).max(2_000),
    resultTitle: z.string().trim().max(2_000).default(''),
    searchSnippet: z.string().trim().max(20_000).default(''),
    visibleSecondaryText: z.string().trim().max(2_000).default(''),
    sourceUrl: z.string().url().max(2_000).nullable().optional(),
    source: z.literal('google-linkedin').default('google-linkedin'),
  })
  .strict()

const importSearchResultsSchema = z
  .object({
    candidates: z.array(importedCandidateSchema).min(1).max(50),
    searchSessionId: z.string().uuid().optional(),
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
    new RegExp(`(?:^|[.;|·])\\s*(?:${labelPattern})\\s*[:–—-]\\s*([^.;|·]+)`, 'i'),
  )

  return cleanEvidenceValue(match?.[1]) || null
}

function parseSkillsEvidence(evidence) {
  const match = evidence.match(
    /(?:^|[.;|·])\s*(?:skills?|technologies)\s*[:–—-]\s*(.*?)(?=(?:\.\s+(?:\d{1,2}(?:\.\d+)?\+?\s+years?|location\s*[:–—-]|based in\s*[:–—-]))|[;|·]|$)/i,
  )
  const value = cleanEvidenceValue(match?.[1])

  if (!value) {
    return []
  }

  return [
    ...new Map(
      value
        .split(/[,·•]/)
        .map((skill) => cleanEvidenceValue(skill).replace(/[.;]+$/, ''))
        .filter((skill) => skill && skill.length <= 100)
        .map((skill) => [skill.toLowerCase(), skill]),
    ).values(),
  ].slice(0, 30)
}

function uniqueTextValues(values, maximum = 30) {
  return [
    ...new Map(
      values
        .map(cleanEvidenceValue)
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ].slice(0, maximum)
}

const technologyPatterns = [
  ['Node.js', /node(?:\.js|js)?/i],
  ['TypeScript', /typescript/i],
  ['JavaScript', /javascript/i],
  ['React', /react(?:\.js|js)?/i],
  ['AWS', /aws|amazon web services/i],
  ['PostgreSQL', /postgres(?:ql)?/i],
  ['Docker', /docker/i],
  ['Redis', /redis/i],
  ['Kubernetes', /kubernetes/i],
  ['NestJS', /nest(?:\.js|js)?/i],
  ['Next.js', /next(?:\.js|js)?/i],
  ['Angular', /angular/i],
  ['Vue.js', /vue(?:\.js|js)?/i],
  ['Python', /python/i],
  ['Java', /java/i],
  ['Go', /golang|go/i],
  ['PHP', /php/i],
  ['.NET', /\.net/i],
  ['C#', /c#/i],
  ['C++', /c\+\+/i],
  ['Kafka', /kafka/i],
  ['MySQL', /mysql/i],
  ['MongoDB', /mongodb/i],
  ['Azure', /azure/i],
  ['GCP', /gcp|google cloud/i],
  ['GraphQL', /graphql/i],
]

function extractKnownTechnologies(value) {
  const text = cleanEvidenceValue(value)

  return technologyPatterns
    .filter(([, pattern]) => {
      const match = text.match(pattern)

      if (!match) {
        return false
      }

      const before = text[match.index - 1] || ''
      const after = text[match.index + match[0].length] || ''
      return !/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after)
    })
    .map(([technology]) => technology)
}

function parseNaturalTechnologyEvidence(evidence) {
  const supportedSegments = []
  const contextPatterns = [
    /(?:experience|experienced|expertise|background|proficient|skilled|specializ(?:e|es|ed|ing)|works?|working|develop(?:s|ed|ing)?|build(?:s|ing|t)?)\b[^;]{0,50}\b(?:with|in|using)\s+(.{1,250}?)(?=\.\s+[A-Z]|;|$)/gi,
    /\b(?:uses?|using)\s+(.{1,250}?)(?=\.\s+[A-Z]|;|$)/gi,
  ]

  for (const pattern of contextPatterns) {
    for (const match of evidence.matchAll(pattern)) {
      supportedSegments.push(match[1])
    }
  }

  return uniqueTextValues(
    supportedSegments.flatMap(extractKnownTechnologies),
  )
}

function looksLikeJobTitle(value) {
  return /\b(?:engineer|developer|architect|manager|analyst|designer|consultant|lead|director|specialist|administrator|scientist|researcher|devops|sre|founder|officer)\b/i.test(
    value,
  )
}

function looksLikeEducationEntity(value) {
  return /\b(?:university|college|school|academy)\b/i.test(value)
}

function isPlausibleEmployer(value, { allowEducationEmployer = false } = {}) {
  const company = cleanEvidenceValue(value)

  if (
    !company ||
    looksLikeJobTitle(company) ||
    isClearlyFormattedLocation(company) ||
    (!allowEducationEmployer && looksLikeEducationEntity(company))
  ) {
    return false
  }

  return company.length <= 255
}

function isPlausibleNaturalLocation(value) {
  const location = cleanEvidenceValue(value)

  return Boolean(
    location &&
      location.length <= 255 &&
      !looksLikeJobTitle(location) &&
      !looksLikeEducationEntity(location) &&
      !/\b(?:inc|ltd|llc|gmbh|company|corp)\.?$/i.test(location),
  )
}

function parseNaturalProfessionalFields(evidence) {
  const match = evidence.match(
    /\b((?:(?:senior|junior|staff|lead|principal|full[- ]?stack)\s+)?(?:software|backend|frontend|full[- ]?stack|web|platform|data|devops)?\s*(?:engineer|developer|architect|manager|analyst|designer|consultant|specialist|administrator|scientist|researcher))\s+(?:at|@)\s+([^,.;|·]+)(?:,\s*([^.;|·]+))?/i,
  )

  if (!match) {
    return { currentTitle: null, currentCompany: null, location: null }
  }

  const currentCompany = cleanEvidenceValue(match[2])
  const location = cleanEvidenceValue(match[3])

  return {
    currentTitle: cleanEvidenceValue(match[1]) || null,
    currentCompany: isPlausibleEmployer(currentCompany, {
      allowEducationEmployer: true,
    })
      ? currentCompany
      : null,
    location: isPlausibleNaturalLocation(location) ? location : null,
  }
}

function parseProfessionalInlineSkills(evidence) {
  return uniqueTextValues(
    evidence
      .split(/\.\s+(?=[A-Z])/)
      .filter((segment) => segment.includes('|') && looksLikeJobTitle(segment))
      .flatMap(extractKnownTechnologies),
  )
}

function parseTitleProfessionalFields(resultTitle, fullName) {
  const normalizedName = cleanEvidenceValue(fullName)
  let professionalText = resultTitle
  const namePrefix = normalizedName
    ? new RegExp(
        `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[-–—]\\s+`,
        'i',
      )
    : null

  if (namePrefix?.test(professionalText)) {
    professionalText = professionalText.replace(namePrefix, '')
  } else {
    const titleParts = professionalText.split(/\s+[-–—]\s+/)

    if (titleParts.length >= 2) {
      professionalText = titleParts.slice(1).join(' - ')
    }
  }

  const segments = professionalText
    .split(/\s+\|\s+/)
    .map(cleanEvidenceValue)
    .filter(Boolean)
  const roleAndCompany = segments[0] || ''
  const atCompanyMatch = roleAndCompany.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i)
  const currentTitle = cleanEvidenceValue(
    atCompanyMatch?.[1] || roleAndCompany,
  )
  const hasSupportedTitle = looksLikeJobTitle(currentTitle)
  const currentCompany = cleanEvidenceValue(atCompanyMatch?.[2])

  return {
    currentTitle: hasSupportedTitle ? currentTitle : null,
    currentCompany:
      hasSupportedTitle &&
      isPlausibleEmployer(currentCompany, { allowEducationEmployer: true })
        ? currentCompany
        : null,
  }
}

function parseTitleSkills(resultTitle) {
  const segments = resultTitle
    .split(/\s+\|\s+/)
    .map(cleanEvidenceValue)
    .filter(Boolean)

  if (segments.length < 2) {
    return []
  }

  return uniqueTextValues(
    segments.slice(1).flatMap(extractKnownTechnologies),
  )
}

function parseMetadataSegments(evidence) {
  return evidence
    .split(/\s+·\s+/)
    .map(cleanEvidenceValue)
    .filter(Boolean)
}

function isClearlyFormattedLocation(value) {
  if (!value || /\b(?:inc|ltd|llc|gmbh|company|corp)\.?$/i.test(value)) {
    return false
  }

  // A city/country pair is copied exactly as displayed. We require the comma so
  // that an unlabelled company or job title is never relabelled as a location.
  return /^[^,;|]{1,100},\s*[^,;|]{2,100}$/.test(value)
}

function parseMetadataProfessionalFields(evidence) {
  const segments = parseMetadataSegments(evidence)
  const locationIndex = segments.findIndex(isClearlyFormattedLocation)

  if (locationIndex === -1 || segments.length < locationIndex + 3) {
    return { location: null, currentTitle: null, currentCompany: null }
  }

  const currentTitle = segments[locationIndex + 1]
  const currentCompany = segments[locationIndex + 2]

  if (
    !looksLikeJobTitle(currentTitle) ||
    !isPlausibleEmployer(currentCompany) ||
    /\d{4}\s*[–—-]/.test(currentTitle)
  ) {
    return { location: null, currentTitle: null, currentCompany: null }
  }

  return {
    location: segments[locationIndex],
    currentTitle,
    currentCompany,
  }
}

function parseEmploymentDates(evidence) {
  const month =
    '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
  const datedMonthOrYear = `(?:${month}\\s+)?\\d{4}`
  const dateRangePattern = new RegExp(
    `\\b${datedMonthOrYear}\\s*(?:-|–|—|to)\\s*(?:${datedMonthOrYear}|present|current)\\b`,
    'gi',
  )

  return uniqueTextValues(evidence.match(dateRangePattern) || [], 10)
}

function mergeRawEvidence(...values) {
  return uniqueTextValues(values, 100).join(' · ')
}

export function extractPreliminaryCandidateFields(candidate) {
  const resultTitle = cleanResultTitle(candidate.resultTitle)
  const snippetEvidence = cleanEvidenceValue(candidate.searchSnippet)
  const secondaryEvidence = cleanEvidenceValue(candidate.visibleSecondaryText)
  const evidence = cleanEvidenceValue(
    [snippetEvidence, secondaryEvidence].filter(Boolean).join(' · '),
  )
  const secondaryMetadataFields = parseMetadataProfessionalFields(
    secondaryEvidence,
  )
  const snippetMetadataFields = parseMetadataProfessionalFields(
    snippetEvidence,
  )
  const metadataFields = secondaryMetadataFields.location
    ? secondaryMetadataFields
    : snippetMetadataFields
  const naturalFields = parseNaturalProfessionalFields(evidence)
  const titleFields = parseTitleProfessionalFields(
    resultTitle,
    candidate.fullName,
  )
  const currentTitle =
    titleFields.currentTitle ||
    metadataFields.currentTitle ||
    naturalFields.currentTitle
  const currentCompany =
    titleFields.currentCompany ||
    metadataFields.currentCompany ||
    naturalFields.currentCompany

  const experienceMatch =
    evidence.match(
      /\b(\d{1,2}(?:\.\d+)?)\+?\s+years?(?:\s+of)?\s+(?:professional\s+)?experience\b/i,
    ) ||
    evidence.match(
      /\b(\d{1,2}(?:\.\d+)?)\+?\s+years?\s+(?:building|developing|engineering|working|creating|delivering|leading|designing)\b/i,
    )
  const yearsOfExperience = experienceMatch
    ? Number(experienceMatch[1])
    : null
  const employmentDates = parseEmploymentDates(evidence)
  const employmentHistory =
    currentTitle && currentCompany && candidate.linkedinUrl
      ? employmentDates
          .map((dateRange) => {
            const dates = parseEmploymentDateRange(dateRange)

            return dates
              ? {
                  jobTitle: currentTitle,
                  company: currentCompany,
                  ...dates,
                  sourceUrl: candidate.linkedinUrl,
                }
              : null
          })
          .filter(Boolean)
      : []
  const calculatedExperience = calculateTotalExperienceYears(employmentHistory)

  return {
    currentTitle,
    currentCompany,
    location:
      parseLabeledEvidence(evidence, ['location', 'based in']) ||
      metadataFields.location ||
      naturalFields.location,
    yearsOfExperience: Number.isFinite(yearsOfExperience)
      ? yearsOfExperience
      : calculatedExperience,
    skills: uniqueTextValues([
      ...parseSkillsEvidence(evidence),
      ...parseTitleSkills(resultTitle),
      ...parseNaturalTechnologyEvidence(evidence),
      ...parseProfessionalInlineSkills(evidence),
    ]),
    employmentDates,
    employmentHistory,
  }
}

export function normalizeImportedCandidates(candidates) {
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

    const normalizedCandidate = {
      ...candidate,
      linkedinUrl,
    }
    const existingCandidate = candidatesByLinkedInUrl.get(linkedinUrl)

    if (!existingCandidate) {
      candidatesByLinkedInUrl.set(linkedinUrl, {
        ...normalizedCandidate,
      })
      return
    }

    // Retain complementary Google evidence. This only combines text shown on
    // Google; it does not assert that any unlabelled value is a profile field.
    candidatesByLinkedInUrl.set(linkedinUrl, {
      ...existingCandidate,
      fullName:
        existingCandidate.fullName.length >= normalizedCandidate.fullName.length
          ? existingCandidate.fullName
          : normalizedCandidate.fullName,
      resultTitle:
        normalizedCandidate.resultTitle.length > existingCandidate.resultTitle.length
          ? normalizedCandidate.resultTitle
          : existingCandidate.resultTitle,
      searchSnippet: mergeRawEvidence(
        existingCandidate.searchSnippet,
        normalizedCandidate.searchSnippet,
      ),
      visibleSecondaryText: mergeRawEvidence(
        existingCandidate.visibleSecondaryText,
        normalizedCandidate.visibleSecondaryText,
      ).slice(0, 2_000),
      sourceUrl:
        existingCandidate.sourceUrl || normalizedCandidate.sourceUrl || null,
    })
  })

  return [...candidatesByLinkedInUrl.values()]
}

export function resolveImportedSearchCriteria(searchSessionId) {
  if (!searchSessionId) {
    return null
  }

  try {
    return getCandidateSearchSession(searchSessionId).criteria
  } catch (error) {
    if (error instanceof CandidateSearchSessionNotFoundError) {
      return null
    }

    throw error
  }
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
      employmentDates: preliminaryFields.employmentDates,
      employmentHistory: preliminaryFields.employmentHistory,
      summary: savedCandidate.summary || candidate.searchSnippet || null,
      resultTitle: candidate.resultTitle,
      searchSnippet: candidate.searchSnippet,
      visibleSecondaryText: candidate.visibleSecondaryText,
      sourceUrl: candidate.sourceUrl || candidate.linkedinUrl,
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
    employmentDates: preliminaryFields.employmentDates,
    employmentHistory: preliminaryFields.employmentHistory,
    summary: candidate.searchSnippet || null,
    resultTitle: candidate.resultTitle,
    searchSnippet: candidate.searchSnippet,
    visibleSecondaryText: candidate.visibleSecondaryText,
    sourceUrl: candidate.sourceUrl || candidate.linkedinUrl,
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

  const criteria = resolveImportedSearchCriteria(
    validation.data.searchSessionId,
  )

  // Imports are intentionally not scored here. React enriches the temporary
  // candidates first, then performs one scoring pass with these exact criteria.
  return { criteria, results: importedCandidates }
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
  const analyzedResults = await analyzeResults(importSession.candidates, criteria)
  const results = analyzedResults.map((candidate) => ({
    ...candidate,
    scoringStatus: Number.isFinite(candidate.matchScore)
      ? 'SUCCEEDED'
      : candidate.matchError === 'Insufficient information'
        ? 'INSUFFICIENT_EVIDENCE'
        : 'FAILED',
  }))

  updateImportSession(importSessionId, {
    criteria,
    candidates: results,
  })

  return { criteria, results }
}
