import { z } from 'zod'
import {
  CandidateSource,
  CandidateSourceConfigurationError,
  CandidateSourceRequestError,
} from './candidateSource.js'

const CORESIGNAL_SEARCH_URL =
  'https://api.coresignal.com/cdapi/v2/employee_base/search/filter/preview'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RESULT_LIMIT = 5

const previewEmployeeSchema = z.object({
  id: z.union([z.string().trim().min(1), z.number().int()]),
  full_name: z.string().trim().min(1),
  profile_url: z.string().trim().nullable().optional(),
  headline: z.string().trim().nullable().optional(),
  location: z.string().trim().nullable().optional(),
  company_name: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
})

function quoteFilterTerm(value) {
  const escapedValue = value
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')

  return `"${escapedValue}"`
}

function buildAndFilter(values) {
  return values.map(quoteFilterTerm).join(' AND ')
}

export function buildCoresignalQuery(criteria) {
  const query = {}

  if (criteria.role) {
    query.experience_title = quoteFilterTerm(criteria.role)
    query.active_experience = true
  }

  if (criteria.location) {
    query.location = criteria.location
  }

  if (criteria.requiredSkills.length > 0) {
    query.skill = buildAndFilter(criteria.requiredSkills)
  }

  if (criteria.keywords.length > 0) {
    query.keyword = buildAndFilter(criteria.keywords)
  }

  // Coresignal exposes dates for individual roles, not total career years.
  // Sending min/max experience as date filters would change their meaning.
  return query
}

function normalizeLinkedInProfileUrl(profileUrl) {
  if (!profileUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(
      /^https?:\/\//i.test(profileUrl)
        ? profileUrl
        : `https://${profileUrl}`,
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

function getProviderRequestId(response) {
  return (
    response.headers.get('x-request-id') ||
    response.headers.get('request-id') ||
    response.headers.get('x-correlation-id') ||
    null
  )
}

function logProviderDiagnostic(level, requestStatus, recordCount, requestId) {
  console[level]('Candidate provider request.', {
    provider: 'coresignal',
    requestStatus,
    recordCount,
    requestId,
  })
}

function mapProviderError(response, requestId) {
  logProviderDiagnostic('error', response.status, 0, requestId)

  if (response.status === 401 || response.status === 403) {
    return new CandidateSourceRequestError(
      'Coresignal authentication failed.',
      502,
    )
  }

  if (response.status === 429) {
    return new CandidateSourceRequestError(
      'Coresignal rate limit exceeded. Please try again.',
      429,
    )
  }

  if (response.status >= 500) {
    return new CandidateSourceRequestError(
      'Coresignal service is temporarily unavailable.',
      503,
    )
  }

  return new CandidateSourceRequestError(
    'Coresignal request could not be completed.',
  )
}

function normalizePreviewEmployee(employee) {
  const parsedEmployee = previewEmployeeSchema.parse(employee)
  const externalId = String(parsedEmployee.id)

  return {
    externalId,
    id: `coresignal-${externalId}`,
    fullName: parsedEmployee.full_name,
    currentTitle:
      parsedEmployee.title || parsedEmployee.headline || null,
    currentCompany: parsedEmployee.company_name || null,
    location: parsedEmployee.location || null,
    linkedinUrl: normalizeLinkedInProfileUrl(
      parsedEmployee.profile_url,
    ),
    email: null,
    yearsOfExperience: null,
    skills: [],
    summary: null,
    notes: '',
    source: 'coresignal',
    isSaved: false,
  }
}

export class CoresignalCandidateSource extends CandidateSource {
  constructor({
    apiKey = process.env.CORESIGNAL_API_KEY?.trim(),
    fetchImplementation = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    resultLimit = DEFAULT_RESULT_LIMIT,
  } = {}) {
    super('coresignal')
    this.apiKey = apiKey
    this.fetchImplementation = fetchImplementation
    this.timeoutMs = timeoutMs
    this.resultLimit = resultLimit
  }

  async searchCandidates(criteria) {
    if (!this.apiKey) {
      throw new CandidateSourceConfigurationError(
        'Coresignal API key is not configured.',
      )
    }

    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs)

    try {
      const response = await this.fetchImplementation(CORESIGNAL_SEARCH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          apikey: this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildCoresignalQuery(criteria)),
        signal: abortController.signal,
      })
      const requestId = getProviderRequestId(response)

      if (!response.ok) {
        throw mapProviderError(response, requestId)
      }

      let providerRecords

      try {
        providerRecords = await response.json()
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw error
        }

        logProviderDiagnostic('error', response.status, 0, requestId)
        throw new CandidateSourceRequestError(
          'Coresignal returned an invalid response.',
        )
      }

      if (!Array.isArray(providerRecords)) {
        logProviderDiagnostic('error', response.status, 0, requestId)
        throw new CandidateSourceRequestError(
          'Coresignal returned an invalid response.',
        )
      }

      let candidates

      try {
        candidates = providerRecords
          .slice(0, this.resultLimit)
          .map(normalizePreviewEmployee)
      } catch {
        logProviderDiagnostic(
          'error',
          response.status,
          providerRecords.length,
          requestId,
        )
        throw new CandidateSourceRequestError(
          'Coresignal returned an invalid response.',
        )
      }

      logProviderDiagnostic(
        'info',
        response.status,
        providerRecords.length,
        requestId,
      )

      return this.normalizeCandidates(candidates)
    } catch (error) {
      if (error instanceof CandidateSourceRequestError) {
        throw error
      }

      if (error?.name === 'AbortError') {
        logProviderDiagnostic('error', 'timeout', 0, null)
        throw new CandidateSourceRequestError(
          'Coresignal request timed out.',
          504,
        )
      }

      logProviderDiagnostic('error', 'unavailable', 0, null)
      throw new CandidateSourceRequestError(
        'Coresignal service is temporarily unavailable.',
        503,
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}
