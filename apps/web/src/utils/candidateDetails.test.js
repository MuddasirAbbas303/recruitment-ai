import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCandidateDetails,
  calculateEmploymentYears,
  createCandidateDetailsDraft,
  formatEmploymentDuration,
} from './candidateDetails.js'

const completeCandidate = {
  id: 'candidate-1',
  fullName: 'Alex Morgan',
  currentTitle: 'Backend Engineer',
  currentCompany: 'Example Labs',
  location: 'Riga, Latvia',
  email: 'alex@example.com',
  linkedinUrl: 'https://www.linkedin.com/in/alex-morgan',
  skills: ['Node.js', 'AWS'],
  summary: 'Builds backend platforms.',
  yearsOfExperience: 5,
  employmentHistory: [{
    title: 'Backend Engineer',
    company: 'Example Labs',
    startDate: 'Jan 2021',
    endDate: 'Dec 2025',
    sourceUrl: 'https://example.com/team/alex',
  }],
  matchScore: 92,
  matchAnalysis: {
    matchedSkills: ['Node.js'],
    missingSkills: ['Kubernetes'],
    strengths: ['Verified backend role.'],
    concerns: ['Kubernetes is not evidenced.'],
    summary: 'Strong verified alignment.',
    evidenceCoverage: {
      percentage: 100,
      availableFields: ['title', 'skills', 'experience', 'location'],
      unknownFields: [],
      sufficientForScoring: true,
    },
  },
  enrichment: {
    sources: [{ url: 'https://example.com/team/alex', type: 'company' }],
    fieldSources: { currentTitle: ['https://example.com/team/alex'] },
  },
  notes: 'Follow up Friday.',
  status: 'SHORTLISTED',
  isSaved: true,
}

test('builds a complete verified candidate view with evidence links', () => {
  const details = buildCandidateDetails(completeCandidate)
  assert.deepEqual(details.missing, [])
  assert.equal(details.assessmentStatus, 'Verified evidence coverage')
  assert.deepEqual(details.evidenceUrls, ['https://example.com/team/alex'])
  assert.equal(details.actions.save, false)
  assert.equal(details.actions.inviteInterview, true)
  assert.equal(
    formatEmploymentDuration(completeCandidate.employmentHistory[0]),
    '5 years',
  )
})

test('identifies unknown fields without converting them to mismatches', () => {
  const details = buildCandidateDetails({
    fullName: 'Sparse Candidate',
    skills: [],
    yearsOfExperience: null,
    isSaved: false,
    source: 'google-linkedin',
  })
  assert.ok(details.missing.includes('Verified experience'))
  assert.ok(details.missing.includes('Current title'))
  assert.equal(details.recommendation, 'Insufficient information')
  assert.deepEqual(details.confirmedConcerns, [])
  assert.equal(details.actions.inviteInterview, false)
})

test('labels incomplete scored profiles as provisional', () => {
  const details = buildCandidateDetails({
    ...completeCandidate,
    yearsOfExperience: null,
    matchScore: 85,
    matchAnalysis: {
      ...completeCandidate.matchAnalysis,
      concerns: [
        'Professional experience is unverified.',
        'A confirmed qualification mismatch.',
      ],
      evidenceCoverage: {
        percentage: 75,
        availableFields: ['title', 'skills', 'location'],
        unknownFields: ['experience'],
        sufficientForScoring: true,
      },
    },
  })
  assert.equal(details.assessmentStatus, 'Provisional — incomplete evidence')
  assert.deepEqual(details.confirmedConcerns, [
    'A confirmed qualification mismatch.',
  ])
})

test('enables only supported unsaved candidate actions', () => {
  const details = buildCandidateDetails({
    ...completeCandidate,
    isSaved: false,
    email: null,
    source: 'google-linkedin',
  })
  assert.equal(details.actions.enrich, true)
  assert.equal(details.actions.save, true)
  assert.equal(details.actions.email, false)
  assert.equal(details.actions.linkedinMessage, true)
  assert.equal(details.actions.inviteInterview, false)
})

test('calculates overlapping employment only once', () => {
  assert.equal(calculateEmploymentYears([
    { startDate: 'Jan 2020', endDate: 'Dec 2022' },
    { startDate: 'Jan 2022', endDate: 'Dec 2023' },
  ]), 4)
})

test('returns unknown experience when an employment date is incomplete', () => {
  assert.equal(calculateEmploymentYears([
    { startDate: '2020', endDate: 'Dec 2023' },
  ]), null)
})

test('creates an isolated edit draft so cancellation preserves candidate data', () => {
  const original = structuredClone(completeCandidate)
  const draft = createCandidateDetailsDraft(completeCandidate)
  draft.fullName = 'Changed locally'
  draft.employmentHistory[0].company = 'Changed locally'
  assert.deepEqual(completeCandidate, original)
  assert.equal(createCandidateDetailsDraft(completeCandidate).fullName, 'Alex Morgan')
})
