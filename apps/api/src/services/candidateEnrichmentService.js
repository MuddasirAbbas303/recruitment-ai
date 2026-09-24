import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  extractManualCandidateProfile,
  normalizePublicCandidateEnrichment,
  searchPublicProfessionalEmail,
  searchPublicProfessionalWeb,
} from './ai/aiService.js'
import {
  CandidateValidationError,
  getCandidateById,
  normalizeLinkedInUrl,
  updateCandidateProfessionalProfile,
} from './candidateService.js'
import {
  analyzeCandidateResults,
  validateCandidateSearchCriteria,
} from './candidateSearchService.js'
import {
  getImportSession,
  updateImportSession,
} from './importSessionService.js'
import { calculateTotalExperienceYears } from './candidateExperienceService.js'

const MAX_EVIDENCE_RESULTS = 20
const MAX_EVIDENCE_TEXT_LENGTH = 30_000
const MANUAL_PREVIEW_TTL_MS = 10 * 60 * 1_000
const MAX_MANUAL_PREVIEWS = 100
const manualPreviews = new Map()
const emailDiscoveryPreviews = new Map()
const disallowedSourceDomains = [
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
]

const candidateInputSchema = z
  .object({
    id: z.string().trim().max(2_000).optional(),
    fullName: z.string().trim().min(1).max(255),
    linkedinUrl: z.string().trim().min(1).max(2_000),
    currentTitle: z.string().trim().max(255).nullable().optional(),
    currentCompany: z.string().trim().max(255).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    resultTitle: z.string().trim().max(2_000).nullable().optional(),
    searchSnippet: z.string().trim().max(20_000).nullable().optional(),
    visibleSecondaryText: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
const enrichmentRequestSchema = z
  .object({
    candidate: candidateInputSchema,
    criteria: z.unknown().optional(),
    importSessionId: z.string().uuid().optional(),
    skipScoring: z.boolean().default(false),
  })
  .strict()

const manualCandidateSchema = z
  .object({
    id: z.string().trim().min(1).max(2_000),
    fullName: z.string().trim().min(1).max(255),
    currentTitle: z.string().trim().max(255).nullable().optional(),
    currentCompany: z.string().trim().max(255).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    yearsOfExperience: z.number().finite().nonnegative().nullable().optional(),
    skills: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
    summary: z.string().trim().max(20_000).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    linkedinUrl: z.string().trim().max(2_000).nullable().optional(),
    isSaved: z.boolean().optional(),
    source: z.string().trim().max(255).nullable().optional(),
  })
  .strict()

const manualPreviewRequestSchema = z
  .object({
    action: z.literal('preview'),
    candidate: manualCandidateSchema,
    profileText: z
      .object({
        about: z.string().max(30_000).default(''),
        workExperience: z.string().max(50_000).default(''),
        skills: z.string().max(20_000).default(''),
      })
      .strict(),
    email: z
      .union([z.string().trim().email().max(255), z.literal('')])
      .default(''),
    criteria: z.unknown().optional(),
    importSessionId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.email.trim() ||
      Object.values(value.profileText).some((text) => text.trim()),
    'Enter an email address or paste at least one profile detail.',
  )

const manualFieldSchema = z.enum([
  'currentTitle',
  'currentCompany',
  'location',
  'skills',
  'summary',
  'employmentHistory',
  'yearsOfExperience',
  'email',
])
const manualConfirmRequestSchema = z
  .object({
    action: z.literal('confirm'),
    previewId: z.string().uuid(),
    approvedFields: z.array(manualFieldSchema).max(8),
  })
  .strict()

const emailCandidateSchema = manualCandidateSchema.extend({
  githubUrl: z.string().trim().url().max(2_000).nullable().optional(),
  portfolioUrl: z.string().trim().url().max(2_000).nullable().optional(),
  professionalUrls: z.array(z.string().trim().url().max(2_000)).max(20).optional(),
})
const emailDiscoveryPreviewSchema = z
  .object({
    action: z.literal('preview'),
    candidate: emailCandidateSchema,
    importSessionId: z.string().uuid().optional(),
  })
  .strict()
const emailDiscoveryConfirmSchema = z
  .object({
    action: z.literal('confirm'),
    previewId: z.string().uuid(),
  })
  .strict()

export class CandidateEnrichmentNotFoundError extends Error {
  constructor(message = 'Imported candidate not found.') {
    super(message)
    this.name = 'CandidateEnrichmentNotFoundError'
  }
}

export class CandidateEnrichmentUnavailableError extends Error {
  constructor(message = 'Public candidate enrichment is unavailable.') {
    super(message)
    this.name = 'CandidateEnrichmentUnavailableError'
  }
}

function cleanupManualPreviews(now = Date.now()) {
  for (const [id, preview] of manualPreviews) {
    if (preview.expiresAt <= now) manualPreviews.delete(id)
  }
}

function cleanupEmailPreviews(now = Date.now()) {
  for (const [id, preview] of emailDiscoveryPreviews) {
    if (preview.expiresAt <= now) emailDiscoveryPreviews.delete(id)
  }
}

function hasUsefulManualValue(value) {
  return Array.isArray(value)
    ? value.length > 0
    : value !== null && value !== undefined && value !== ''
}

function mergeManualFields(candidate, extracted, approvedFields) {
  const merged = { ...candidate }
  const approved = new Set(approvedFields)

  for (const field of [
    'currentTitle',
    'currentCompany',
    'location',
    'summary',
    'email',
  ]) {
    if (approved.has(field) && hasUsefulManualValue(extracted[field])) {
      merged[field] = extracted[field]
    }
  }

  if (approved.has('skills') && extracted.skills.length > 0) {
    merged.skills = [...new Set([...(candidate.skills ?? []), ...extracted.skills])]
  }

  if (approved.has('employmentHistory') && extracted.employmentHistory.length > 0) {
    merged.employmentHistory = extracted.employmentHistory
  }

  if (approved.has('yearsOfExperience') && extracted.yearsOfExperience !== null) {
    merged.yearsOfExperience = extracted.yearsOfExperience
  }

  return {
    ...merged,
    manualEnrichment: {
      enriched: true,
      approvedFields: [...approved],
    },
  }
}

function quoteQueryValue(value) {
  return `"${value.replace(/"/g, ' ').replace(/\s+/g, ' ').trim()}"`
}

function getLinkedInSlug(linkedinUrl) {
  try {
    const match = new URL(linkedinUrl).pathname.match(/^\/in\/([^/?#]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

function getConciseEvidenceHint(value, maximumWords = 12) {
  if (typeof value !== 'string') {
    return null
  }

  const hint = value
    .replace(/\s*[|·]\s*LinkedIn.*$/i, '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, maximumWords)
    .join(' ')

  return hint.length >= 3 ? hint : null
}

function pushUniqueQuery(queries, values, exclusions) {
  const query = [
    ...values.filter(Boolean),
    exclusions,
  ].join(' ')

  if (query && !queries.includes(query)) {
    queries.push(query)
  }
}

export function buildPublicEnrichmentQueries(candidate) {
  const name = quoteQueryValue(candidate.fullName)
  const queries = []
  const exclusions =
    '-site:linkedin.com -site:facebook.com -site:instagram.com -site:tiktok.com -site:x.com -site:twitter.com'
  const identityHints = [
    candidate.currentTitle,
    candidate.currentCompany,
    candidate.location,
  ]
    .filter(Boolean)
    .map(quoteQueryValue)
  const linkedinSlug = getLinkedInSlug(candidate.linkedinUrl)
  const resultTitleHint = getConciseEvidenceHint(candidate.resultTitle, 10)
  const snippetHint = getConciseEvidenceHint(candidate.searchSnippet, 12)
  const secondaryHint = getConciseEvidenceHint(
    candidate.visibleSecondaryText,
    10,
  )

  pushUniqueQuery(
    queries,
    [
      name,
      ...identityHints,
      '(GitHub OR portfolio OR conference OR blog OR team)',
    ],
    exclusions,
  )

  if (linkedinSlug) {
    pushUniqueQuery(
      queries,
      [name, quoteQueryValue(linkedinSlug), '(GitHub OR portfolio)'],
      exclusions,
    )
  }

  const googleEvidenceHints = [
    resultTitleHint,
    secondaryHint,
    snippetHint,
  ].filter(Boolean)

  if (googleEvidenceHints.length > 0) {
    pushUniqueQuery(
      queries,
      [name, ...googleEvidenceHints.map(quoteQueryValue)],
      exclusions,
    )
  }

  if (candidate.currentCompany || candidate.currentTitle) {
    pushUniqueQuery(
      queries,
      [
        name,
        candidate.currentCompany
          ? quoteQueryValue(candidate.currentCompany)
          : null,
        candidate.currentTitle ? quoteQueryValue(candidate.currentTitle) : null,
        '(company OR team OR conference OR blog)',
      ],
      exclusions,
    )
  }

  pushUniqueQuery(queries, [name, 'GitHub'], exclusions)

  return [...new Set(queries)].slice(0, 5)
}

export function buildPublicEnrichmentPrompt(candidate) {
  const quotedName = quoteQueryValue(candidate.fullName)
  const identity = [
    quotedName,
    candidate.currentTitle ? quoteQueryValue(candidate.currentTitle) : null,
    candidate.currentCompany
      ? quoteQueryValue(candidate.currentCompany)
      : null,
  ]
    .filter(Boolean)
    .join(' ')
  const queries = buildPublicEnrichmentQueries(candidate)
  const conciseQueries = queries
    .slice(0, 3)
    .map((query) => query.replace(/\s+-site:\S+/g, ''))
    .map((query) => query.replace(/\s+\(GitHub OR portfolio[^)]*\)/g, ''))
    .map((query, index) =>
      index > 0 && query.startsWith(`${quotedName} `)
        ? query.slice(quotedName.length + 1)
        : query,
    )

  return [
    `Find public professional pages for ${identity}. Perform one focused web search.`,
    `Queries: ${conciseQueries.join(' ; ')}`,
    'Prefer GitHub, portfolios, company/team pages, technical blogs, and conference profiles.',
    'Do not use LinkedIn pages, personal social media, or private sources.',
    'Return factual evidence with URLs from at most five pages. Never infer identity.',
  ].join(' ')
}

function getExecutedTools(completion) {
  const tools = completion?.choices?.[0]?.message?.executed_tools
  return Array.isArray(tools) ? tools : []
}

function isBrowserSearchTool(tool) {
  const type = String(
    tool?.type ?? tool?.name ?? tool?.tool_name ?? '',
  ).toLowerCase()

  return (
    type === 'browser_search' ||
    type === 'browser_search_call' ||
    tool?.search_results !== undefined ||
    tool?.output?.search_results !== undefined
  )
}

function getToolSearchResults(tool) {
  const searchResults = tool?.search_results ?? tool?.output?.search_results

  if (Array.isArray(searchResults)) {
    return searchResults
  }

  return Array.isArray(searchResults?.results) ? searchResults.results : []
}

function normalizePublicUrl(value) {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const url = new URL(value)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }

    url.hash = ''
    for (const parameterName of [...url.searchParams.keys()]) {
      if (parameterName.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(parameterName)
      }
    }

    return url.href
  } catch {
    return null
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

function isAllowedProfessionalSource(url) {
  const hostname = getHostname(url)

  return Boolean(
    hostname &&
      !disallowedSourceDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
      ),
  )
}

function getPublicEvidence(completion) {
  const message = completion?.choices?.[0]?.message
  const searchResults = getExecutedTools(completion)
    .filter(isBrowserSearchTool)
    .flatMap(getToolSearchResults)
  const citations = Array.isArray(message?.citations) ? message.citations : []
  const evidenceByUrl = new Map()

  for (const result of searchResults) {
    const url = normalizePublicUrl(
      result?.url ?? result?.link ?? result?.source_url,
    )

    if (!url || !isAllowedProfessionalSource(url)) {
      continue
    }

    evidenceByUrl.set(url, {
      url,
      title:
        typeof result?.title === 'string'
          ? result.title.slice(0, 500)
          : null,
      snippet:
        typeof (result?.content ?? result?.snippet ?? result?.description) ===
        'string'
          ? (result.content ?? result.snippet ?? result.description).slice(
              0,
              2_000,
            )
          : null,
    })
  }

  for (const citation of citations) {
    const url = normalizePublicUrl(
      typeof citation === 'string'
        ? citation
        : citation?.url ?? citation?.link,
    )

    if (url && isAllowedProfessionalSource(url) && !evidenceByUrl.has(url)) {
      evidenceByUrl.set(url, { url, title: null, snippet: null })
    }
  }

  return {
    content:
      typeof message?.content === 'string'
        ? message.content.slice(0, MAX_EVIDENCE_TEXT_LENGTH)
        : '',
    results: [...evidenceByUrl.values()].slice(0, MAX_EVIDENCE_RESULTS),
  }
}

function getRequestId(completion) {
  const value =
    completion?._request_id ??
    completion?.request_id ??
    completion?.requestId

  return typeof value === 'string'
    ? value.replace(/[^\x20-\x7E]/g, '').slice(0, 128)
    : null
}

function normalizeEvidenceValue(value) {
  return typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9+#.]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}

function getSourceEvidenceText(source) {
  return normalizeEvidenceValue([source.title, source.snippet].filter(Boolean).join(' '))
}

function sourceContainsValue(source, value) {
  const normalizedValue = normalizeEvidenceValue(value)

  return Boolean(
    normalizedValue && source.evidenceText.includes(normalizedValue),
  )
}

function sourceContainsNumber(source, value) {
  if (!Number.isFinite(value)) {
    return false
  }

  return new RegExp(`\\b${String(value).replace('.', '\\.')}\\b`).test(
    source.evidenceText,
  )
}

function getKnownProfileUrls(candidate) {
  return new Set(
    [
      candidate.linkedinUrl,
      candidate.githubUrl,
      candidate.portfolioUrl,
      ...(candidate.professionalUrls ?? []),
    ]
      .map(normalizePublicUrl)
      .filter(Boolean),
  )
}

function sourceHasVerifiedProfileCrossLink(source, knownProfileUrls) {
  if (knownProfileUrls.has(source.url)) {
    return true
  }

  return [...knownProfileUrls].some((profileUrl) =>
    source.evidenceText.includes(normalizeEvidenceValue(profileUrl)),
  )
}

function getIdentitySignals(candidate) {
  return [
    candidate.currentCompany,
    candidate.currentTitle,
    candidate.location,
  ].filter((value) => normalizeEvidenceValue(value).length >= 3)
}

function getIdentityVerifiedSources(candidate, evidence) {
  const candidateName = normalizeEvidenceValue(candidate.fullName)
  const identitySignals = getIdentitySignals(candidate)
  const knownProfileUrls = getKnownProfileUrls(candidate)

  return evidence.results
    .map((result) => ({
      ...result,
      evidenceText: getSourceEvidenceText(result),
    }))
    .filter(
      (source) =>
        candidateName &&
        source.evidenceText.includes(candidateName) &&
        (identitySignals.some((signal) => sourceContainsValue(source, signal)) ||
          sourceHasVerifiedProfileCrossLink(source, knownProfileUrls)),
    )
}

function mergeUniqueStrings(existingValues = [], newValues = []) {
  const valuesByIdentity = new Map()

  for (const value of [...existingValues, ...newValues]) {
    if (typeof value === 'string' && value.trim()) {
      valuesByIdentity.set(value.trim().toLowerCase(), value.trim())
    }
  }

  return [...valuesByIdentity.values()]
}

function getAcceptedEmploymentHistory(candidate, identityVerifiedSources) {
  const entries = Array.isArray(candidate.employmentHistory)
    ? candidate.employmentHistory
    : []
  const acceptedByIdentity = new Map()

  for (const entry of entries) {
    const sourceUrl = normalizePublicUrl(entry.sourceUrl)
    const source = identityVerifiedSources.find(
      (candidateSource) => candidateSource.url === sourceUrl,
    )

    if (
      !source ||
      !sourceContainsValue(source, entry.jobTitle) ||
      !sourceContainsValue(source, entry.company) ||
      !sourceContainsValue(source, entry.startDate) ||
      !sourceContainsValue(source, entry.endDate)
    ) {
      continue
    }

    const acceptedEntry = {
      jobTitle: entry.jobTitle.trim(),
      company: entry.company.trim(),
      startDate: entry.startDate.trim(),
      endDate: entry.endDate.trim(),
      sourceUrl,
    }
    const identity = [
      acceptedEntry.jobTitle,
      acceptedEntry.company,
      acceptedEntry.startDate,
      acceptedEntry.endDate,
      acceptedEntry.sourceUrl,
    ]
      .map((value) => value.toLowerCase())
      .join('|')

    acceptedByIdentity.set(identity, acceptedEntry)
  }

  return [...acceptedByIdentity.values()]
}

function mergeEmploymentHistory(existingEntries = [], acceptedEntries = []) {
  const entriesByIdentity = new Map()

  for (const entry of [...existingEntries, ...acceptedEntries]) {
    if (!entry?.jobTitle || !entry?.company || !entry?.startDate || !entry?.endDate || !entry?.sourceUrl) {
      continue
    }

    const identity = [
      entry.jobTitle,
      entry.company,
      entry.startDate,
      entry.endDate,
      entry.sourceUrl,
    ]
      .map((value) => String(value).trim().toLowerCase())
      .join('|')

    entriesByIdentity.set(identity, entry)
  }

  return [...entriesByIdentity.values()]
}

function getSupportingSourceUrls(sources, value) {
  return sources
    .filter((source) => sourceContainsValue(source, value))
    .map((source) => source.url)
}

function getSupportingNumberSourceUrls(sources, value) {
  return sources
    .filter((source) => sourceContainsNumber(source, value))
    .map((source) => source.url)
}

function validateNormalizedEnrichment(baseCandidate, normalized, evidence) {
  const normalizedCandidate = normalized.candidate
  const identityVerifiedSources = getIdentityVerifiedSources(
    baseCandidate,
    evidence,
  )
  const identityVerifiedUrls = new Set(
    identityVerifiedSources.map((source) => source.url),
  )
  const supportedSources = normalized.enrichment.sources
    .map((source) => ({
      url: normalizePublicUrl(source.url),
      type: source.type,
    }))
    .filter((source) => source.url && identityVerifiedUrls.has(source.url))
    .filter(
      (source, index, sources) =>
        sources.findIndex((item) => item.url === source.url) === index,
    )

  if (supportedSources.length === 0) {
    throw new CandidateEnrichmentUnavailableError(
      'No identity-verified public professional information was found.',
    )
  }

  const fieldSources = {}
  const titleSourceUrls = getSupportingSourceUrls(
    identityVerifiedSources,
    normalizedCandidate.currentTitle,
  )
  const companySourceUrls = getSupportingSourceUrls(
    identityVerifiedSources,
    normalizedCandidate.currentCompany,
  )
  const locationSourceUrls = getSupportingSourceUrls(
    identityVerifiedSources,
    normalizedCandidate.location,
  )
  const experienceSourceUrls = getSupportingNumberSourceUrls(
    identityVerifiedSources,
    normalizedCandidate.yearsOfExperience,
  )
  const summarySourceUrls = getSupportingSourceUrls(
    identityVerifiedSources,
    normalizedCandidate.summary,
  )
  const acceptedEmploymentHistory = getAcceptedEmploymentHistory(
    normalizedCandidate,
    identityVerifiedSources,
  )
  const employmentHistory = mergeEmploymentHistory(
    baseCandidate.employmentHistory,
    acceptedEmploymentHistory,
  )
  const calculatedYearsOfExperience = calculateTotalExperienceYears(
    employmentHistory,
  )

  if (titleSourceUrls.length > 0) fieldSources.currentTitle = titleSourceUrls
  if (companySourceUrls.length > 0) {
    fieldSources.currentCompany = companySourceUrls
  }
  if (locationSourceUrls.length > 0) fieldSources.location = locationSourceUrls
  if (experienceSourceUrls.length > 0) {
    fieldSources.yearsOfExperience = experienceSourceUrls
  }
  if (acceptedEmploymentHistory.length > 0) {
    fieldSources.employmentHistory = acceptedEmploymentHistory.map(
      (entry) => entry.sourceUrl,
    )
  }
  if (summarySourceUrls.length > 0) fieldSources.summary = summarySourceUrls

  const acceptedSkills = normalizedCandidate.skills.filter((skill) => {
    const sourceUrls = getSupportingSourceUrls(identityVerifiedSources, skill)

    if (sourceUrls.length === 0) {
      return false
    }

    fieldSources.skills ??= {}
    fieldSources.skills[skill] = sourceUrls
    return true
  })

  const githubUrl = normalizePublicUrl(normalizedCandidate.githubUrl)
  const portfolioUrl = normalizePublicUrl(normalizedCandidate.portfolioUrl)
  const acceptedProfessionalUrls = normalizedCandidate.professionalUrls
    .map(normalizePublicUrl)
    .filter((url) => url && identityVerifiedUrls.has(url))

  if (githubUrl && identityVerifiedUrls.has(githubUrl)) {
    fieldSources.githubUrl = [githubUrl]
  }
  if (portfolioUrl && identityVerifiedUrls.has(portfolioUrl)) {
    fieldSources.portfolioUrl = [portfolioUrl]
  }
  if (acceptedProfessionalUrls.length > 0) {
    fieldSources.professionalUrls = acceptedProfessionalUrls
  }

  const enrichedCandidate = {
    ...baseCandidate,
    fullName: baseCandidate.fullName,
    linkedinUrl: baseCandidate.linkedinUrl,
    currentTitle: titleSourceUrls.length > 0
      ? normalizedCandidate.currentTitle
      : baseCandidate.currentTitle ?? null,
    currentCompany: companySourceUrls.length > 0
      ? normalizedCandidate.currentCompany
      : baseCandidate.currentCompany ?? null,
    location: locationSourceUrls.length > 0
      ? normalizedCandidate.location
      : baseCandidate.location ?? null,
    yearsOfExperience:
      calculatedYearsOfExperience !== null
        ? calculatedYearsOfExperience
        : experienceSourceUrls.length > 0
        ? normalizedCandidate.yearsOfExperience
        : baseCandidate.yearsOfExperience ?? null,
    employmentHistory,
    skills: mergeUniqueStrings(baseCandidate.skills, acceptedSkills),
    summary:
      summarySourceUrls.length > 0
        ? normalizedCandidate.summary
        : baseCandidate.summary ?? null,
    githubUrl:
      githubUrl && identityVerifiedUrls.has(githubUrl)
        ? githubUrl
        : baseCandidate.githubUrl ?? null,
    portfolioUrl:
      portfolioUrl && identityVerifiedUrls.has(portfolioUrl)
        ? portfolioUrl
        : baseCandidate.portfolioUrl ?? null,
    professionalUrls: mergeUniqueStrings(
      baseCandidate.professionalUrls,
      acceptedProfessionalUrls,
    ),
    enrichment: {
      enriched: true,
      sources: supportedSources,
      fieldSources,
    },
  }

  return enrichedCandidate
}

function matchesCandidate(candidate, requestedCandidate) {
  if (candidate.linkedinUrl) {
    try {
      if (
        normalizeLinkedInUrl(candidate.linkedinUrl) ===
        requestedCandidate.linkedinUrl
      ) {
        return true
      }
    } catch {
      // Continue to the session candidate ID comparison.
    }
  }

  return Boolean(
    requestedCandidate.id && candidate.id === requestedCandidate.id,
  )
}

function sortCandidateResults(candidates) {
  return [...candidates].sort(
    (firstCandidate, secondCandidate) =>
      (Number.isFinite(secondCandidate.matchScore)
        ? secondCandidate.matchScore
        : -1) -
      (Number.isFinite(firstCandidate.matchScore)
        ? firstCandidate.matchScore
        : -1),
  )
}

export async function enrichPublicCandidate(
  input,
  dependencies = {},
) {
  const validation = enrichmentRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid public candidate enrichment request.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  let linkedinUrl

  try {
    linkedinUrl = normalizeLinkedInUrl(validation.data.candidate.linkedinUrl)
  } catch {
    throw new CandidateValidationError(
      'Invalid public candidate enrichment request.',
      [{
        path: 'candidate.linkedinUrl',
        message: 'A valid LinkedIn profile URL is required.',
      }],
    )
  }

  const requestedCandidate = {
    ...validation.data.candidate,
    linkedinUrl,
  }
  let importSession = null
  let sessionCandidateIndex = -1

  if (validation.data.importSessionId) {
    importSession = getImportSession(validation.data.importSessionId)
    sessionCandidateIndex = importSession.candidates.findIndex((candidate) =>
      matchesCandidate(candidate, requestedCandidate),
    )

    if (sessionCandidateIndex === -1) {
      throw new CandidateEnrichmentNotFoundError()
    }
  }

  const baseCandidate = importSession
    ? {
        ...importSession.candidates[sessionCandidateIndex],
        ...requestedCandidate,
        skills: importSession.candidates[sessionCandidateIndex].skills ?? [],
      }
    : { ...requestedCandidate, skills: [] }
  const discover = dependencies.discover ?? searchPublicProfessionalWeb
  const normalize =
    dependencies.normalize ?? normalizePublicCandidateEnrichment
  const startedAt = Date.now()
  const completion = await discover(buildPublicEnrichmentPrompt(baseCandidate))
  const browserSearchExecuted = getExecutedTools(completion).some(
    isBrowserSearchTool,
  )

  if (!browserSearchExecuted) {
    throw new CandidateEnrichmentUnavailableError()
  }

  const evidence = getPublicEvidence(completion)

  console.info('Public candidate discovery completed.', {
    evidenceResultCount: evidence.results.length,
    sourceDomains: [
      ...new Set(
        evidence.results
          .map((result) => getHostname(result.url))
          .filter(Boolean),
      ),
    ],
    requestIds: [getRequestId(completion)].filter(Boolean),
    durationMs: Date.now() - startedAt,
  })

  if (evidence.results.length === 0) {
    throw new CandidateEnrichmentUnavailableError(
      'No supported public professional information was found.',
    )
  }

  const normalized = await normalize(baseCandidate, evidence)
  let enrichedCandidate = validateNormalizedEnrichment(
    baseCandidate,
    normalized,
    evidence,
  )
  const criteria =
    validation.data.criteria === undefined
      ? importSession?.criteria ?? null
      : validateCandidateSearchCriteria(validation.data.criteria)

  if (criteria && !validation.data.skipScoring) {
    const analyzer = dependencies.analyzeResults ?? analyzeCandidateResults
    const [scoredCandidate] = await analyzer([enrichedCandidate], criteria)
    enrichedCandidate = scoredCandidate
  }

  if (importSession) {
    const updatedCandidates = [...importSession.candidates]
    updatedCandidates[sessionCandidateIndex] = enrichedCandidate
    updateImportSession(validation.data.importSessionId, {
      criteria,
      candidates: sortCandidateResults(updatedCandidates),
    })
  }

  const sourceDomains = enrichedCandidate.enrichment.sources
    .map((source) => getHostname(source.url))
    .filter(Boolean)

  console.info('Public candidate enrichment completed.', {
    enrichmentCount: 1,
    sourceDomains: [...new Set(sourceDomains)],
    requestIds: [getRequestId(completion)].filter(Boolean),
    durationMs: Date.now() - startedAt,
  })

  return {
    candidate: enrichedCandidate,
    enrichment: enrichedCandidate.enrichment,
    ...(Number.isFinite(enrichedCandidate.matchScore) && {
      matchScore: enrichedCandidate.matchScore,
      matchAnalysis: enrichedCandidate.matchAnalysis,
    }),
  }
}

export async function previewManualCandidateEnrichment(input, dependencies = {}) {
  const validation = manualPreviewRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid manual candidate enrichment request.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  let baseCandidate = validation.data.candidate
  let sessionCandidateIndex = -1
  let sessionCriteria = null

  if (validation.data.importSessionId) {
    const session = getImportSession(validation.data.importSessionId)
    sessionCandidateIndex = session.candidates.findIndex((candidate) =>
      matchesCandidate(candidate, baseCandidate),
    )
    if (sessionCandidateIndex === -1) throw new CandidateEnrichmentNotFoundError()
    baseCandidate = session.candidates[sessionCandidateIndex]
    sessionCriteria = session.criteria
  } else if (baseCandidate.isSaved) {
    const savedCandidate = await (dependencies.getSavedCandidate ?? getCandidateById)(
      baseCandidate.id,
    )
    baseCandidate = {
      ...(savedCandidate.toJSON?.() ?? savedCandidate),
      isSaved: true,
      source: baseCandidate.source ?? 'database',
    }
  }

  const hasProfileText = Object.values(validation.data.profileText).some(
    (text) => text.trim(),
  )
  const extract = dependencies.extract ?? extractManualCandidateProfile
  const extractedResult = hasProfileText
    ? await extract(validation.data.profileText)
    : {
        currentTitle: null,
        currentCompany: null,
        location: null,
        skills: [],
        summary: null,
        employmentHistory: [],
      }
  const extracted = {
    ...extractedResult,
    email: validation.data.email.trim().toLowerCase() || null,
    yearsOfExperience: calculateTotalExperienceYears(
      extractedResult.employmentHistory,
    ),
  }
  const replacementFields = [
    'currentTitle',
    'currentCompany',
    'location',
    'summary',
    'yearsOfExperience',
    'email',
  ].filter(
    (field) =>
      hasUsefulManualValue(baseCandidate[field]) &&
      hasUsefulManualValue(extracted[field]) &&
      baseCandidate[field] !== extracted[field],
  )

  cleanupManualPreviews()
  while (manualPreviews.size >= MAX_MANUAL_PREVIEWS) {
    manualPreviews.delete(manualPreviews.keys().next().value)
  }
  const previewId = randomUUID()
  const criteria =
    validation.data.criteria === undefined
      ? sessionCriteria
      : validateCandidateSearchCriteria(validation.data.criteria)
  manualPreviews.set(previewId, {
    id: previewId,
    expiresAt: Date.now() + MANUAL_PREVIEW_TTL_MS,
    candidate: structuredClone(baseCandidate),
    extracted: structuredClone(extracted),
    criteria: structuredClone(criteria),
    importSessionId: validation.data.importSessionId ?? null,
    sessionCandidateIndex,
    saved: Boolean(baseCandidate.isSaved),
  })

  return { previewId, candidate: baseCandidate, extracted, replacementFields }
}

export async function confirmManualCandidateEnrichment(input, dependencies = {}) {
  const validation = manualConfirmRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError('Invalid manual enrichment confirmation.')
  }

  cleanupManualPreviews()
  const preview = manualPreviews.get(validation.data.previewId)
  if (!preview) {
    throw new CandidateEnrichmentNotFoundError('Manual enrichment preview expired or was not found.')
  }

  let candidate = mergeManualFields(
    preview.candidate,
    preview.extracted,
    validation.data.approvedFields,
  )

  if (preview.saved) {
    const persist = dependencies.updateSavedCandidate ?? updateCandidateProfessionalProfile
    const persistentFields = Object.fromEntries(
      ['currentTitle', 'currentCompany', 'location', 'yearsOfExperience', 'skills', 'summary', 'email']
        .filter((field) => validation.data.approvedFields.includes(field))
        .filter((field) => hasUsefulManualValue(candidate[field]))
        .map((field) => [field, candidate[field]]),
    )
    if (Object.keys(persistentFields).length > 0) {
      const savedCandidate = await persist(candidate.id, persistentFields)
      candidate = {
        ...candidate,
        ...(savedCandidate.toJSON?.() ?? savedCandidate),
        isSaved: true,
      }
    }
  }

  if (preview.criteria) {
    const analyzer = dependencies.analyzeResults ?? analyzeCandidateResults
    try {
      const [scoredCandidate] = await analyzer([candidate], preview.criteria)
      candidate = scoredCandidate
    } catch {
      candidate = {
        ...candidate,
        matchError: 'Unable to update match analysis.',
      }
    }
  }

  if (preview.importSessionId) {
    const session = getImportSession(preview.importSessionId)
    const candidateIndex = session.candidates.findIndex((current) =>
      matchesCandidate(current, preview.candidate),
    )
    if (candidateIndex === -1) throw new CandidateEnrichmentNotFoundError()
    const candidates = [...session.candidates]
    candidates[candidateIndex] = candidate
    updateImportSession(preview.importSessionId, {
      criteria: preview.criteria,
      candidates: sortCandidateResults(candidates),
    })
  }

  manualPreviews.delete(validation.data.previewId)
  return {
    candidate,
    ...(Number.isFinite(candidate.matchScore) && {
      matchScore: candidate.matchScore,
      matchAnalysis: candidate.matchAnalysis,
    }),
  }
}

export async function enrichManualCandidate(input, dependencies = {}) {
  return input?.action === 'confirm'
    ? confirmManualCandidateEnrichment(input, dependencies)
    : previewManualCandidateEnrichment(input, dependencies)
}

export function buildCandidateEmailDiscoveryPrompt(candidate) {
  const identity = [
    quoteQueryValue(candidate.fullName),
    candidate.currentTitle ? quoteQueryValue(candidate.currentTitle) : null,
    candidate.currentCompany ? quoteQueryValue(candidate.currentCompany) : null,
  ].filter(Boolean).join(' ')
  const knownUrls = [
    candidate.githubUrl,
    candidate.portfolioUrl,
    ...(candidate.professionalUrls ?? []),
  ].filter(Boolean).slice(0, 5)

  return [
    `Find an explicitly published professional email address for ${identity}.`,
    knownUrls.length > 0 ? `Known verified professional URLs: ${knownUrls.join(' ')}` : '',
    'Search only public portfolios, company/team pages, technical blogs, conference profiles, and other public professional pages.',
    'Do not use LinkedIn pages, private sources, paid verification services, guessed addresses, or company email patterns.',
    'Return evidence only when the page explicitly publishes the email and clearly identifies this person. Include the supporting page URL.',
  ].filter(Boolean).join(' ')
}

function findVerifiedEmail(candidate, evidence) {
  const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const verifiedSources = getIdentityVerifiedSources(candidate, evidence)

  for (const source of verifiedSources) {
    const rawEvidence = [source.title, source.snippet].filter(Boolean).join(' ')
    const emails = rawEvidence.match(emailPattern) ?? []

    if (emails.length > 0) {
      return {
        email: emails[0].toLowerCase(),
        sourceUrl: source.url,
        verified: true,
      }
    }
  }

  return null
}

async function resolveEmailCandidate(candidate, importSessionId, dependencies) {
  if (importSessionId) {
    const session = getImportSession(importSessionId)
    const index = session.candidates.findIndex((current) =>
      matchesCandidate(current, candidate),
    )
    if (index === -1) throw new CandidateEnrichmentNotFoundError()
    return { candidate: session.candidates[index], session, index }
  }

  if (candidate.isSaved) {
    const saved = await (dependencies.getSavedCandidate ?? getCandidateById)(candidate.id)
    return {
      candidate: {
        ...(saved.toJSON?.() ?? saved),
        isSaved: true,
        source: candidate.source ?? 'database',
      },
      session: null,
      index: -1,
    }
  }

  return { candidate, session: null, index: -1 }
}

export async function previewCandidateEmailDiscovery(input, dependencies = {}) {
  const validation = emailDiscoveryPreviewSchema.safeParse(input)
  if (!validation.success) {
    throw new CandidateValidationError('Invalid candidate email discovery request.')
  }

  const resolved = await resolveEmailCandidate(
    validation.data.candidate,
    validation.data.importSessionId,
    dependencies,
  )
  const discover = dependencies.discover ?? searchPublicProfessionalEmail
  const completion = await discover(
    buildCandidateEmailDiscoveryPrompt(resolved.candidate),
    resolved.candidate,
  )
  const browserSearchExecuted = getExecutedTools(completion).some(isBrowserSearchTool)
  if (!browserSearchExecuted) throw new CandidateEnrichmentUnavailableError()

  const evidence = getPublicEvidence(completion)
  const discovered = findVerifiedEmail(resolved.candidate, evidence)
  if (!discovered) {
    throw new CandidateEnrichmentUnavailableError(
      'No verified professional email found.',
    )
  }

  cleanupEmailPreviews()
  while (emailDiscoveryPreviews.size >= MAX_MANUAL_PREVIEWS) {
    emailDiscoveryPreviews.delete(emailDiscoveryPreviews.keys().next().value)
  }
  const previewId = randomUUID()
  emailDiscoveryPreviews.set(previewId, {
    expiresAt: Date.now() + MANUAL_PREVIEW_TTL_MS,
    candidate: structuredClone(resolved.candidate),
    importSessionId: validation.data.importSessionId ?? null,
    discovered,
  })

  return {
    previewId,
    ...discovered,
    replacesExisting: Boolean(
      resolved.candidate.email &&
      resolved.candidate.email.toLowerCase() !== discovered.email,
    ),
  }
}

export async function confirmCandidateEmailDiscovery(input, dependencies = {}) {
  const validation = emailDiscoveryConfirmSchema.safeParse(input)
  if (!validation.success) {
    throw new CandidateValidationError('Invalid candidate email confirmation.')
  }

  cleanupEmailPreviews()
  const preview = emailDiscoveryPreviews.get(validation.data.previewId)
  if (!preview) {
    throw new CandidateEnrichmentNotFoundError('Email discovery preview expired or was not found.')
  }

  let candidate = {
    ...preview.candidate,
    email: preview.discovered.email,
    emailEvidence: {
      verified: true,
      sourceUrl: preview.discovered.sourceUrl,
    },
  }

  if (candidate.isSaved) {
    const persist = dependencies.updateSavedCandidate ?? updateCandidateProfessionalProfile
    const saved = await persist(candidate.id, { email: candidate.email })
    candidate = {
      ...candidate,
      ...(saved.toJSON?.() ?? saved),
      isSaved: true,
    }
  }

  if (preview.importSessionId) {
    const session = getImportSession(preview.importSessionId)
    const index = session.candidates.findIndex((current) =>
      matchesCandidate(current, preview.candidate),
    )
    if (index === -1) throw new CandidateEnrichmentNotFoundError()
    const candidates = [...session.candidates]
    candidates[index] = candidate
    updateImportSession(preview.importSessionId, {
      criteria: session.criteria,
      candidates,
    })
  }

  emailDiscoveryPreviews.delete(validation.data.previewId)
  return { candidate, ...preview.discovered }
}

export async function discoverCandidateEmail(input, dependencies = {}) {
  return input?.action === 'confirm'
    ? confirmCandidateEmailDiscovery(input, dependencies)
    : previewCandidateEmailDiscovery(input, dependencies)
}
