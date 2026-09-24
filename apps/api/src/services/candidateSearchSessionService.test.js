import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANDIDATE_SEARCH_SESSION_TTL_MS,
  CandidateSearchSessionNotFoundError,
  createCandidateSearchSession,
  getCandidateSearchSession,
} from './candidateSearchSessionService.js'
import { resolveImportedSearchCriteria } from './candidateImportService.js'

function criteria(location) {
  return {
    role: 'Software Engineer',
    requiredSkills: ['Node.js'],
    preferredSkills: ['TypeScript'],
    location,
    keywords: [],
    excludeKeywords: [],
    source: 'both',
  }
}

test('resolves criteria from the active Google search session', () => {
  const expected = criteria('Riga, Latvia')
  const session = createCandidateSearchSession(expected)

  assert.deepEqual(resolveImportedSearchCriteria(session.id), expected)
})

test('keeps simultaneous Google search criteria isolated', () => {
  const riga = createCandidateSearchSession(criteria('Riga, Latvia'))
  const berlin = createCandidateSearchSession(criteria('Berlin, Germany'))

  assert.equal(resolveImportedSearchCriteria(riga.id).location, 'Riga, Latvia')
  assert.equal(
    resolveImportedSearchCriteria(berlin.id).location,
    'Berlin, Germany',
  )
})

test('expired and missing search sessions return no import criteria', () => {
  const now = Date.now()
  const expired = createCandidateSearchSession(
    criteria('Riga, Latvia'),
    now - CANDIDATE_SEARCH_SESSION_TTL_MS - 1,
  )

  assert.equal(resolveImportedSearchCriteria(expired.id), null)
  assert.equal(
    resolveImportedSearchCriteria('00000000-0000-4000-8000-000000000000'),
    null,
  )
  assert.throws(
    () => getCandidateSearchSession(expired.id),
    CandidateSearchSessionNotFoundError,
  )
})

test('direct extension imports without a search session remain unscored', () => {
  assert.equal(resolveImportedSearchCriteria(), null)
})
