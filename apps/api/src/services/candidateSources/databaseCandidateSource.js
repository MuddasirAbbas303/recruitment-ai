import { listCandidates } from '../candidateService.js'
import { CandidateSource } from './candidateSource.js'

function normalize(value) {
  return value?.trim().toLowerCase() ?? ''
}

function getSearchableText(candidate) {
  return normalize(
    [
      candidate.fullName,
      candidate.currentTitle,
      candidate.currentCompany,
      candidate.location,
      candidate.email,
      candidate.skills?.join(' '),
      candidate.summary,
    ].join(' '),
  )
}

function matchesKeywordCriteria(candidate, criteria) {
  const searchableText = getSearchableText(candidate)

  return (
    criteria.keywords.every((keyword) =>
      searchableText.includes(normalize(keyword)),
    ) &&
    !criteria.excludeKeywords.some((keyword) =>
      searchableText.includes(normalize(keyword)),
    )
  )
}

function buildDatabaseFilters(criteria) {
  const filters = {}

  if (criteria.role) {
    filters.title = criteria.role
  }

  if (criteria.requiredSkills.length > 0) {
    filters.skills = criteria.requiredSkills.join(',')
  }

  if (criteria.location) {
    filters.location = criteria.location
  }

  if (criteria.minExperience !== undefined) {
    filters.minExperience = criteria.minExperience
  }

  if (criteria.maxExperience !== undefined) {
    filters.maxExperience = criteria.maxExperience
  }

  return filters
}

export class DatabaseCandidateSource extends CandidateSource {
  constructor() {
    super('database')
  }

  async searchCandidates(criteria) {
    const candidates = await listCandidates(buildDatabaseFilters(criteria))
    const sourceCandidates = candidates
      .map((candidate) =>
        candidate.toJSON ? candidate.toJSON() : candidate,
      )
      .filter((candidate) => matchesKeywordCriteria(candidate, criteria))
      .map((candidate) => ({
        ...candidate,
        externalId: candidate.id,
        id: candidate.id,
        notes: candidate.notes ?? '',
        isSaved: true,
      }))

    return this.normalizeCandidates(sourceCandidates)
  }
}
