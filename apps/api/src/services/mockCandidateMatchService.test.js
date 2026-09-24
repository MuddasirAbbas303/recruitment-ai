import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeCandidate } from './candidateMatchService.js'
import { analyzeCandidateWithMock } from './mockCandidateMatchService.js'

const job = {
  role: 'Senior Backend Developer',
  requiredSkills: ['Node.js', 'AWS'],
  preferredSkills: ['Docker'],
  minExperience: 5,
  maxExperience: 10,
  location: 'Latvia',
  keywords: ['SaaS'],
  excludeKeywords: ['student'],
}

function candidate(overrides = {}) {
  return {
    fullName: 'Alex Example',
    currentTitle: 'Backend Engineer',
    currentCompany: 'Example Ltd',
    location: 'Riga, Latvia',
    yearsOfExperience: 7,
    skills: ['Node.js', 'Docker'],
    summary: 'Backend engineer building SaaS platforms.',
    ...overrides,
  }
}

test('preserves deterministic scoring for a complete professional profile', async () => {
  const analysis = await analyzeCandidateWithMock(job, candidate())

  assert.equal(analysis.overallScore, 85)
  assert.equal(analysis.requiredSkillsScore, 50)
  assert.equal(analysis.experienceScore, 100)
  assert.equal(analysis.roleScore, 100)
  assert.deepEqual(analysis.missingSkills, ['AWS'])
  assert.deepEqual(analysis.evidenceCoverage, {
    percentage: 100,
    availableFields: ['title', 'skills', 'experience', 'location'],
    unknownFields: [],
    sufficientForScoring: true,
  })
})

test('scores only known dimensions for a partially known profile', async () => {
  const analysis = await analyzeCandidateWithMock(
    job,
    candidate({
      location: '',
      yearsOfExperience: null,
      summary: '',
    }),
  )

  assert.equal(analysis.overallScore, 75)
  assert.equal(analysis.experienceScore, null)
  assert.deepEqual(analysis.missingSkills, [])
  assert.equal(analysis.evidenceCoverage.percentage, 50)
  assert.deepEqual(analysis.evidenceCoverage.unknownFields, [
    'experience',
    'location',
  ])
  assert.match(analysis.concerns.join(' '), /Information unavailable/)
})

test('withholds a score for a sparse profile instead of rewarding one skill', async () => {
  const analysis = await analyzeCandidateWithMock(
    job,
    candidate({
      currentTitle: '',
      currentCompany: '',
      location: '',
      yearsOfExperience: null,
      skills: ['Node.js'],
      summary: '',
    }),
  )

  assert.equal(analysis.overallScore, null)
  assert.equal(analysis.roleScore, null)
  assert.equal(analysis.experienceScore, null)
  assert.equal(analysis.evidenceCoverage.percentage, 25)
  assert.equal(analysis.evidenceCoverage.sufficientForScoring, false)
  assert.match(analysis.summary, /^Insufficient information/)

  const unknownSkillsAnalysis = await analyzeCandidateWithMock(
    job,
    candidate({
      currentTitle: '',
      location: '',
      yearsOfExperience: null,
      skills: [],
      summary: '',
    }),
  )

  assert.equal(unknownSkillsAnalysis.requiredSkillsScore, null)
  assert.deepEqual(unknownSkillsAnalysis.missingSkills, [])
})

test('candidate match service preserves nullable mock scores and coverage', async () => {
  const previousMockSetting = process.env.USE_MOCK_AI
  process.env.USE_MOCK_AI = 'true'

  try {
    const analysis = await analyzeCandidate(
      job,
      candidate({
        currentTitle: null,
        currentCompany: null,
        location: null,
        yearsOfExperience: null,
        skills: ['Node.js'],
        summary: null,
      }),
    )

    assert.equal(analysis.overallScore, null)
    assert.equal(analysis.evidenceCoverage.sufficientForScoring, false)
  } finally {
    if (previousMockSetting === undefined) {
      delete process.env.USE_MOCK_AI
    } else {
      process.env.USE_MOCK_AI = previousMockSetting
    }
  }
})
