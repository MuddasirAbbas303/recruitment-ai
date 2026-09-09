import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createImportSession,
  getImportSession,
  IMPORT_SESSION_TTL_MS,
  ImportSessionNotFoundError,
  MAX_IMPORT_SESSION_CANDIDATES,
} from './importSessionService.js'

test('stores isolated candidate data and expires after thirty minutes', () => {
  const createdAt = Date.parse('2026-09-09T09:00:00.000Z')
  const candidates = [{ id: 'candidate-1', fullName: 'Example Candidate' }]
  const session = createImportSession(
    { criteria: null, candidates },
    createdAt,
  )

  candidates[0].fullName = 'Changed outside the store'

  assert.equal(
    getImportSession(session.id, createdAt).candidates[0].fullName,
    'Example Candidate',
  )
  assert.throws(
    () => getImportSession(session.id, createdAt + IMPORT_SESSION_TTL_MS),
    ImportSessionNotFoundError,
  )
})

test('rejects sessions above the candidate limit', () => {
  assert.throws(
    () =>
      createImportSession({
        candidates: Array.from(
          { length: MAX_IMPORT_SESSION_CANDIDATES + 1 },
          (_, index) => ({ id: `candidate-${index}` }),
        ),
      }),
    RangeError,
  )
})
