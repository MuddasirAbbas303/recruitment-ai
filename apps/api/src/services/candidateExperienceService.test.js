import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateTotalExperienceYears,
  normalizeEmploymentEntries,
  processCandidateExperience,
} from './candidateExperienceService.js'
import {
  createImportSession,
  getImportSession,
} from './importSessionService.js'

const sourceUrl = 'https://example.com/alex-profile'
const referenceDate = new Date('2026-09-15T00:00:00Z')

function employment(startDate, endDate, overrides = {}) {
  return {
    jobTitle: 'Backend Engineer',
    company: 'Example Ltd',
    startDate,
    endDate,
    sourceUrl,
    ...overrides,
  }
}

test('calculates complete month-level employment history', () => {
  assert.equal(
    calculateTotalExperienceYears(
      [employment('Jan 2020', 'Dec 2022')],
      referenceDate,
    ),
    3,
  )
})

test('merges overlapping jobs without double-counting months', () => {
  assert.equal(
    calculateTotalExperienceYears(
      [
        employment('Jan 2020', 'Dec 2022'),
        employment('Jan 2022', 'Dec 2023', { company: 'Second Ltd' }),
      ],
      referenceDate,
    ),
    4,
  )
})

test('calculates current employment through the reference month', () => {
  assert.equal(
    calculateTotalExperienceYears(
      [employment('Oct 2025', 'Present')],
      referenceDate,
    ),
    1,
  )
})

test('returns null for partial or month-ambiguous employment dates', () => {
  assert.equal(
    calculateTotalExperienceYears(
      [employment('2020', '2022')],
      referenceDate,
    ),
    null,
  )
  assert.equal(
    calculateTotalExperienceYears(
      [employment('Jan 2020', '')],
      referenceDate,
    ),
    null,
  )
})

const candidate = {
  id: 'https://www.linkedin.com/in/alex-example',
  fullName: 'Alex Example',
  linkedinUrl: 'https://www.linkedin.com/in/alex-example',
  currentTitle: 'Backend Engineer',
  currentCompany: 'Example Ltd',
  yearsOfExperience: null,
  employmentHistory: [],
  skills: ['Node.js'],
  isSaved: false,
}

const criteria = {
  role: 'Backend Engineer',
  requiredSkills: ['Node.js'],
  preferredSkills: [],
  location: '',
  keywords: [],
  excludeKeywords: [],
  source: 'external',
}

function completeHistory() {
  return [
    employment('Jan 2020', 'Dec 2022'),
    employment('Jan 2022', 'Present', { company: 'Second Ltd' }),
  ]
}

test('normalizes complete, overlapping, and current employment entries', () => {
  const entries = normalizeEmploymentEntries(completeHistory())

  assert.equal(entries[0].title, 'Backend Engineer')
  assert.equal(entries[1].isCurrent, true)
  assert.equal(entries[1].endDate, 'Present')
  assert.equal(
    calculateTotalExperienceYears(
      entries.map((entry) => ({ ...entry, jobTitle: entry.title })),
      referenceDate,
    ),
    6.8,
  )
})

test('uses complete existing evidence, updates the temporary candidate, and re-scores', async () => {
  const session = createImportSession({
    criteria,
    candidates: [{ ...candidate, employmentHistory: completeHistory() }],
  })
  let enrichmentCalled = false
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    {
      enrich: async () => {
        enrichmentCalled = true
        throw new Error('should not run')
      },
      analyzeResults: async ([value]) => [{
        ...value,
        matchScore: 84,
        matchAnalysis: { overallScore: 84 },
      }],
    },
  )

  assert.equal(enrichmentCalled, false)
  assert.equal(result.experienceStatus, 'COMPLETE')
  assert.equal(result.matchScore, 84)
  assert.equal(getImportSession(session.id).candidates[0].matchScore, 84)
})

test('keeps experience incomplete when employment dates are missing', async () => {
  const session = createImportSession({ candidates: [candidate] })
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    {
      enrich: async () => ({
        candidate: {
          ...candidate,
          employmentHistory: [{
            jobTitle: 'Backend Engineer',
            company: 'Example Ltd',
            startDate: 'Jan 2020',
            endDate: '',
            sourceUrl,
          }],
        },
      }),
    },
  )

  assert.equal(result.experienceStatus, 'INCOMPLETE')
  assert.equal(result.yearsOfExperience, null)
})

test('does not present a valid fragment as total experience when history is partial', async () => {
  const partialCandidate = {
    ...candidate,
    employmentHistory: [
      employment('Jan 2020', 'Dec 2022'),
      { ...employment('Jan 2023', 'Present'), startDate: '' },
    ],
  }
  const session = createImportSession({ candidates: [partialCandidate] })
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    { enrich: async () => { throw new Error('No additional evidence') } },
  )

  assert.equal(result.experienceStatus, 'INCOMPLETE')
  assert.equal(result.yearsOfExperience, null)
  assert.equal(result.employmentHistory.length, 1)
})

test('preserves the temporary candidate on identity mismatch or enrichment failure', async () => {
  const session = createImportSession({ candidates: [candidate] })
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    { enrich: async () => { throw new Error('Identity mismatch') } },
  )

  assert.equal(result.experienceStatus, 'INCOMPLETE')
  assert.equal(result.candidate.fullName, candidate.fullName)
  assert.deepEqual(result.candidate.skills, candidate.skills)
  assert.equal(getImportSession(session.id).candidates[0].fullName, candidate.fullName)
})

test('adds verified enriched history and automatically re-scores it', async () => {
  const session = createImportSession({ criteria, candidates: [candidate] })
  const enrichedHistory = [employment('Jan 2021', 'Present')]
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    {
      enrich: async () => ({
        candidate: { ...candidate, employmentHistory: enrichedHistory },
      }),
      analyzeResults: async ([value], receivedCriteria) => {
        assert.equal(receivedCriteria.role, criteria.role)
        return [{
          ...value,
          matchScore: 91,
          matchAnalysis: { overallScore: 91 },
        }]
      },
    },
  )

  assert.equal(result.experienceStatus, 'COMPLETE')
  assert.equal(result.enrichmentStatus, 'SUCCEEDED')
  assert.equal(result.scoringStatus, 'SUCCEEDED')
  assert.equal(result.matchScore, 91)
  assert.equal(getImportSession(session.id).candidates[0].matchScore, 91)
})

test('scores verified existing evidence when public enrichment fails', async () => {
  const session = createImportSession({ criteria, candidates: [candidate] })
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    {
      enrich: async () => { throw new Error('Identity validation failed') },
      analyzeResults: async ([value], receivedCriteria) => {
        assert.equal(receivedCriteria.role, criteria.role)
        return [{
          ...value,
          matchScore: 76,
          matchAnalysis: {
            overallScore: 76,
            evidenceCoverage: { percentage: 50 },
          },
        }]
      },
    },
  )

  assert.equal(result.enrichmentStatus, 'FAILED')
  assert.equal(result.scoringStatus, 'SUCCEEDED')
  assert.equal(result.experienceStatus, 'INCOMPLETE')
  assert.equal(result.yearsOfExperience, null)
  assert.equal(result.matchScore, 76)
  assert.deepEqual(result.candidate.skills, candidate.skills)
})

test('reports insufficient scoring evidence independently of failed enrichment', async () => {
  const sparseCandidate = { ...candidate, currentTitle: null, skills: [] }
  const session = createImportSession({
    criteria,
    candidates: [sparseCandidate],
  })
  const result = await processCandidateExperience(
    { candidate: sparseCandidate, importSessionId: session.id },
    {
      enrich: async () => { throw new Error('No verified public evidence') },
      analyzeResults: async ([value]) => [{
        ...value,
        matchScore: null,
        matchAnalysis: {
          overallScore: null,
          evidenceCoverage: {
            percentage: 0,
            availableFields: [],
            unknownFields: ['title', 'skills', 'experience'],
            sufficientForScoring: false,
          },
        },
        matchError: 'Insufficient information',
      }],
    },
  )

  assert.equal(result.enrichmentStatus, 'FAILED')
  assert.equal(result.scoringStatus, 'INSUFFICIENT_EVIDENCE')
  assert.equal(result.candidate.matchScore, null)
  assert.equal(result.candidate.yearsOfExperience, null)
})

test('keeps enrichment and scoring failures independent', async () => {
  const session = createImportSession({ criteria, candidates: [candidate] })
  const result = await processCandidateExperience(
    { candidate, importSessionId: session.id },
    {
      enrich: async () => { throw new Error('Enrichment unavailable') },
      analyzeResults: async () => { throw new Error('Scoring unavailable') },
    },
  )

  assert.equal(result.enrichmentStatus, 'FAILED')
  assert.equal(result.scoringStatus, 'FAILED')
  assert.equal(result.candidate.matchScore, null)
  assert.equal(result.candidate.fullName, candidate.fullName)
  assert.deepEqual(result.candidate.skills, candidate.skills)
})
