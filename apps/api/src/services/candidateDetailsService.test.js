import assert from 'node:assert/strict'
import test from 'node:test'
import {
  prepareCandidateDetailsUpdate,
  updateSavedCandidateDetails,
  updateTemporaryCandidateDetails,
} from './candidateDetailsService.js'
import {
  createImportSession,
  getImportSession,
} from './importSessionService.js'

const details = {
  fullName: 'Alex Example',
  currentTitle: 'Senior Engineer',
  currentCompany: 'Example Ltd',
  location: 'Riga, Latvia',
  email: 'alex@example.com',
  skills: ['Node.js', 'AWS'],
  summary: 'Builds services.',
  yearsOfExperience: 2,
  employmentHistory: [
    { title: 'Engineer', company: 'First Ltd', startDate: 'Jan 2020', endDate: 'Dec 2022', isCurrent: false, sourceUrl: 'https://example.com/first' },
    { title: 'Senior Engineer', company: 'Example Ltd', startDate: 'Jan 2022', endDate: 'Dec 2023', isCurrent: false, sourceUrl: null },
  ],
}

test('calculates overlapping employment once and labels edited fields manual', () => {
  const prepared = prepareCandidateDetailsUpdate(details)
  assert.equal(prepared.details.yearsOfExperience, 4)
  assert.equal(prepared.details.employmentHistory.length, 2)
  assert.equal(prepared.fieldOrigins.currentCompany, 'manual')
})

test('rejects invalid email and incomplete employment dates', () => {
  assert.throws(() => prepareCandidateDetailsUpdate({ ...details, email: 'invalid' }))
  assert.throws(() => prepareCandidateDetailsUpdate({
    ...details,
    employmentHistory: [{ ...details.employmentHistory[0], startDate: '2020' }],
  }))
})

test('updates a temporary candidate without saving or losing recruiter data', () => {
  const candidate = {
    id: 'temporary-1',
    fullName: 'Original Name',
    linkedinUrl: 'https://www.linkedin.com/in/original',
    notes: 'Keep this note',
    status: 'SAVED',
    enrichment: { sources: [{ url: 'https://example.com/first' }] },
  }
  const session = createImportSession({ candidates: [candidate] })
  const updated = updateTemporaryCandidateDetails(session.id, candidate.id, details)
  assert.equal(updated.fullName, 'Alex Example')
  assert.equal(updated.linkedinUrl, candidate.linkedinUrl)
  assert.equal(updated.notes, candidate.notes)
  assert.deepEqual(updated.enrichment, candidate.enrichment)
  assert.equal(getImportSession(session.id).candidates[0].fullName, 'Alex Example')
})

test('updates an existing saved candidate instead of creating another row', async () => {
  let updatePayload
  const record = {
    fieldOrigins: { linkedinUrl: 'external' },
    async update(payload) {
      updatePayload = payload
      Object.assign(this, payload)
    },
  }
  let findCount = 0
  const updated = await updateSavedCandidateDetails(
    '7b34e98d-c300-44dc-a78d-b4b578ae150b',
    details,
    { CandidateModel: { findByPk: async () => { findCount += 1; return record } } },
  )
  assert.equal(findCount, 1)
  assert.equal(updated.fullName, 'Alex Example')
  assert.equal(updatePayload.fieldOrigins.linkedinUrl, 'external')
  assert.equal(updatePayload.fieldOrigins.fullName, 'manual')
})
