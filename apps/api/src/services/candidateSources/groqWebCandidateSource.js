import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import {
  GroqConfigurationError,
  GroqServiceError,
  normalizeWebCandidateResults,
} from '../groqService.js'
import {
  CandidateSource,
  CandidateSourceConfigurationError,
  CandidateSourceRequestError,
} from './candidateSource.js'

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_SEARCH_MODEL = 'openai/gpt-oss-20b'
const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_RESULT_LIMIT = 5
const MAX_RESULT_LIMIT = 10
const MAX_DISCOVERY_CONTENT_LENGTH = 30_000
const MAX_SEARCH_RESULTS = 30
const MAX_SEARCH_RESULT_TEXT_LENGTH = 2_000

function getConfiguredResultLimit() {
  const configuredLimit = Number(process.env.GROQ_WEB_MAX_RESULTS)

  if (!Number.isInteger(configuredLimit) || configuredLimit < 1) {
    return DEFAULT_RESULT_LIMIT
  }

  return Math.min(configuredLimit, MAX_RESULT_LIMIT)
}

function getSearchModel() {
  return process.env.GROQ_SEARCH_MODEL?.trim() || DEFAULT_SEARCH_MODEL
}

function getSafeValue(value) {
  if (typeof value !== 'string') {
    return null
  }

  const sanitizedValue = value
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 128)

  return sanitizedValue || null
}

function getRequestId(value) {
  return getSafeValue(
    value?._request_id ??
      value?.request_id ??
      value?.requestID ??
      value?.requestId ??
      value?.headers?.get?.('x-request-id'),
  )
}

function getSafeErrorStatus(error) {
  return Number.isInteger(error?.status) ? error.status : null
}

function logDiagnostic({
  webResultCount,
  normalizedCandidateCount,
  requestIds,
  durationMs,
  browserSearchExecuted,
}) {
  console.info('External candidate provider request.', {
    provider: 'groq-web',
    webResultCount,
    normalizedCandidateCount,
    requestIds: requestIds.filter(Boolean),
    durationMs,
    browserSearchExecuted,
  })
}

function logFailure({ requestId, durationMs }) {
  console.error('External candidate provider request failed.', {
    provider: 'groq-web',
    webResultCount: 0,
    normalizedCandidateCount: 0,
    requestIds: requestId ? [requestId] : [],
    durationMs,
  })
}

function normalizeList(values = []) {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function buildGroqWebSearchPrompt(criteria, resultLimit) {
  const searchCriteria = {
    role: criteria.role || null,
    requiredSkills: normalizeList(criteria.requiredSkills),
    preferredSkills: normalizeList(criteria.preferredSkills),
    location: criteria.location || null,
    minimumExperience: criteria.minExperience ?? null,
    maximumExperience: criteria.maxExperience ?? null,
    keywords: normalizeList(criteria.keywords),
    excludeKeywords: normalizeList(criteria.excludeKeywords),
  }

  return [
    `Find up to ${resultLimit} public professional profiles matching the supplied recruiting criteria.`,
    'Use browser search to find publicly available professional pages. Prefer public LinkedIn profile URLs when they appear in search results.',
    'For each discovered person, return the name, professional/profile URL, current title, company, location, professional skills, and a relevant public snippet only when each detail is visible in the searched public pages.',
    'Required skills, role, and location should guide discovery. Preferred skills should improve relevance but must not unnecessarily exclude candidates.',
    'Apply minimum and maximum experience only when the public evidence supports them.',
    'Respect keyword and excluded-keyword criteria.',
    'Do not use private data, authenticated pages, browser cookies, or LinkedIn credentials.',
    'Do not infer missing details or protected/personal characteristics.',
    `Recruiting criteria: ${JSON.stringify(searchCriteria)}`,
  ].join(' ')
}

function getExecutedTools(completion) {
  const executedTools = completion?.choices?.[0]?.message?.executed_tools
  return Array.isArray(executedTools) ? executedTools : []
}

function isBrowserSearchTool(tool) {
  const toolType = String(
    tool?.type ?? tool?.name ?? tool?.tool_name ?? '',
  ).toLowerCase()

  return (
    toolType === 'browser_search' ||
    toolType === 'browser_search_call' ||
    toolType === 'search' ||
    tool?.search_results !== undefined ||
    tool?.output?.search_results !== undefined
  )
}

export function didBrowserSearchExecute(completion) {
  return getExecutedTools(completion).some(isBrowserSearchTool)
}

function getSearchResultUrl(result) {
  return result?.url ?? result?.link ?? result?.source_url ?? null
}

function normalizeSearchResult(result) {
  if (!result || typeof result !== 'object') {
    return null
  }

  const url = getSearchResultUrl(result)
  const title = result.title ?? result.name ?? null
  const snippet =
    result.content ?? result.snippet ?? result.description ?? result.text ?? null

  if (!url && !title && !snippet) {
    return null
  }

  return {
    url: typeof url === 'string' ? url.slice(0, 2_000) : null,
    title: typeof title === 'string' ? title.slice(0, 500) : null,
    snippet:
      typeof snippet === 'string'
        ? snippet.slice(0, MAX_SEARCH_RESULT_TEXT_LENGTH)
        : null,
  }
}

function getToolSearchResults(tool) {
  const directResults = tool?.search_results

  if (Array.isArray(directResults)) {
    return directResults
  }

  if (Array.isArray(directResults?.results)) {
    return directResults.results
  }

  if (Array.isArray(tool?.output?.search_results)) {
    return tool.output.search_results
  }

  if (Array.isArray(tool?.output?.search_results?.results)) {
    return tool.output.search_results.results
  }

  return []
}

export function extractDiscoveryEvidence(completion) {
  const message = completion?.choices?.[0]?.message
  const searchResults = getExecutedTools(completion)
    .filter(isBrowserSearchTool)
    .flatMap(getToolSearchResults)
    .map(normalizeSearchResult)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_RESULTS)
  const citations = (message?.citations ?? [])
    .map((citation) =>
      typeof citation === 'string'
        ? citation
        : citation?.url ?? citation?.link ?? null,
    )
    .filter((citation) => typeof citation === 'string')
    .slice(0, MAX_SEARCH_RESULTS)

  return {
    content:
      typeof message?.content === 'string'
        ? message.content.slice(0, MAX_DISCOVERY_CONTENT_LENGTH)
        : '',
    searchResults,
    citations,
  }
}

function normalizeEvidenceText(evidence) {
  return JSON.stringify(evidence).toLowerCase()
}

function isEvidenceBacked(value, evidenceText) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    evidenceText.includes(value.trim().toLowerCase())
  )
}

function canonicalizeLinkedInProfileUrl(value) {
  if (!value) {
    return null
  }

  try {
    const parsedUrl = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    )
    const hostname = parsedUrl.hostname.toLowerCase()
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)

    if (
      !(
        hostname === 'linkedin.com' ||
        hostname.endsWith('.linkedin.com')
      ) ||
      pathSegments[0]?.toLowerCase() !== 'in' ||
      !pathSegments[1]
    ) {
      return null
    }

    return `https://www.linkedin.com/in/${pathSegments[1]}`
  } catch {
    return null
  }
}

function getDiscoveredLinkedInUrls(evidence) {
  const evidenceText = JSON.stringify(evidence)
  const foundUrls = evidenceText.match(
    /https?:\\?\/\\?\/(?:[a-z]{2,3}\\?\.)?(?:www\\?\.)?linkedin\\?\.com\\?\/in\\?\/[a-zA-Z0-9_%.-]+/gi,
  ) ?? []

  return new Map(
    foundUrls
      .map((url) => url.replaceAll('\\/', '/'))
      .map((url) => canonicalizeLinkedInProfileUrl(url))
      .filter(Boolean)
      .map((url) => [url.toLowerCase(), url]),
  )
}

function hasExperienceEvidence(yearsOfExperience, evidenceText) {
  if (yearsOfExperience === null) {
    return false
  }

  const escapedYears = String(yearsOfExperience).replace('.', '\\.')
  return new RegExp(
    `\\b${escapedYears}\\s*\\+?\\s*(?:years?|yrs?)\\b`,
    'i',
  ).test(evidenceText)
}

function getCandidateExternalId(candidate) {
  const identity = [
    candidate.linkedinUrl,
    candidate.fullName,
    candidate.currentCompany,
    candidate.currentTitle,
  ]
    .filter(Boolean)
    .join('|')
    .toLowerCase()

  return createHash('sha256').update(identity).digest('hex').slice(0, 20)
}

export function enforceDiscoveryEvidence(candidate, evidence) {
  const evidenceText = normalizeEvidenceText(evidence)
  const discoveredLinkedInUrls = getDiscoveredLinkedInUrls(evidence)
  const candidateLinkedInUrl = canonicalizeLinkedInProfileUrl(
    candidate.linkedinUrl,
  )
  const linkedinUrl = candidateLinkedInUrl
    ? discoveredLinkedInUrls.get(candidateLinkedInUrl.toLowerCase()) ?? null
    : null

  if (!isEvidenceBacked(candidate.fullName, evidenceText)) {
    return null
  }

  const evidenceBackedCandidate = {
    externalId: null,
    fullName: candidate.fullName.trim(),
    currentTitle: isEvidenceBacked(candidate.currentTitle, evidenceText)
      ? candidate.currentTitle.trim()
      : null,
    currentCompany: isEvidenceBacked(candidate.currentCompany, evidenceText)
      ? candidate.currentCompany.trim()
      : null,
    location: isEvidenceBacked(candidate.location, evidenceText)
      ? candidate.location.trim()
      : null,
    linkedinUrl,
    email: isEvidenceBacked(candidate.email, evidenceText)
      ? candidate.email.trim().toLowerCase()
      : null,
    yearsOfExperience: hasExperienceEvidence(
      candidate.yearsOfExperience,
      JSON.stringify(evidence),
    )
      ? candidate.yearsOfExperience
      : null,
    skills: candidate.skills.filter((skill) =>
      isEvidenceBacked(skill, evidenceText),
    ),
    summary: candidate.summary,
    source: 'groq-web',
  }

  evidenceBackedCandidate.externalId = getCandidateExternalId(
    evidenceBackedCandidate,
  )

  return evidenceBackedCandidate
}

function countWebResults(evidence) {
  if (evidence.searchResults.length > 0) {
    return evidence.searchResults.length
  }

  return getDiscoveredLinkedInUrls(evidence).size
}

function mapDiscoveryError(error, startedAt) {
  logFailure({
    requestId: getRequestId(error),
    durationMs: Date.now() - startedAt,
  })

  if (getSafeErrorStatus(error) === 429) {
    return new CandidateSourceRequestError(
      'Groq browser search rate limit exceeded.',
      429,
    )
  }

  return new CandidateSourceRequestError(
    'External candidate search is unavailable.',
    error?.name === 'APIConnectionTimeoutError' ? 504 : 503,
  )
}

export class GroqWebCandidateSource extends CandidateSource {
  constructor({
    apiKey = process.env.GROQ_API_KEY?.trim(),
    client,
    normalizer = normalizeWebCandidateResults,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    resultLimit = getConfiguredResultLimit(),
  } = {}) {
    super('groq-web')
    this.apiKey = apiKey
    this.client = client
    this.normalizer = normalizer
    this.timeoutMs = timeoutMs
    this.resultLimit = Math.min(
      MAX_RESULT_LIMIT,
      Math.max(1, Math.trunc(Number(resultLimit) || DEFAULT_RESULT_LIMIT)),
    )
  }

  getClient() {
    return (
      this.client ??
      new OpenAI({
        apiKey: this.apiKey,
        baseURL: GROQ_BASE_URL,
        maxRetries: 0,
        timeout: this.timeoutMs,
      })
    )
  }

  async searchCandidates(criteria) {
    if (!this.apiKey) {
      throw new CandidateSourceConfigurationError(
        'Groq API key is not configured.',
      )
    }

    const startedAt = Date.now()
    let searchCompletion

    try {
      searchCompletion = await this.getClient().chat.completions.create({
        model: getSearchModel(),
        messages: [
          {
            role: 'user',
            content: buildGroqWebSearchPrompt(criteria, this.resultLimit),
          },
        ],
        tools: [{ type: 'browser_search' }],
        tool_choice: 'required',
      })
    } catch (error) {
      throw mapDiscoveryError(error, startedAt)
    }

    const browserSearchExecuted = didBrowserSearchExecute(searchCompletion)

    if (!browserSearchExecuted) {
      logFailure({
        requestId: getRequestId(searchCompletion),
        durationMs: Date.now() - startedAt,
      })
      throw new CandidateSourceRequestError(
        'External candidate search is unavailable.',
        503,
      )
    }

    const extractedEvidence = extractDiscoveryEvidence(searchCompletion)
    const evidence = {
      ...extractedEvidence,
      searchResults: extractedEvidence.searchResults.slice(0, this.resultLimit),
      citations: extractedEvidence.citations.slice(0, this.resultLimit),
    }
    const webResultCount = countWebResults(evidence)
    let normalizedCandidates

    try {
      normalizedCandidates = await this.normalizer(
        evidence,
        this.resultLimit,
        this.timeoutMs,
      )
    } catch (error) {
      logFailure({
        requestId: getRequestId(error),
        durationMs: Date.now() - startedAt,
      })

      if (error instanceof GroqConfigurationError) {
        throw new CandidateSourceConfigurationError(
          'Groq API key is not configured.',
        )
      }

      if (error instanceof GroqServiceError || error instanceof Error) {
        throw new CandidateSourceRequestError(
          'Unable to normalize candidate search results.',
        )
      }

      throw error
    }

    const candidates = normalizedCandidates
      .map((candidate) => enforceDiscoveryEvidence(candidate, evidence))
      .filter(Boolean)
      .slice(0, this.resultLimit)
      .map((candidate) => ({
        ...candidate,
        id: `groq-web-${candidate.externalId}`,
        notes: '',
        isSaved: false,
      }))

    logDiagnostic({
      webResultCount,
      normalizedCandidateCount: candidates.length,
      requestIds: [getRequestId(searchCompletion)],
      durationMs: Date.now() - startedAt,
      browserSearchExecuted,
    })

    return this.normalizeCandidates(candidates)
  }
}
