import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyCandidateEvidenceRules,
  candidateMatchAnalysisSchema,
} from './candidateMatchSchemas.js'

const job = {
  role: 'Backend Developer',
  requiredSkills: ['Node.js', 'AWS'],
  preferredSkills: ['Docker'],
  minExperience: 5,
  maxExperience: 10,
  location: 'Latvia',
  keywords: [],
  excludeKeywords: [],
}

const completeCandidate = {
  fullName: 'Alex Example',
  currentTitle: 'Backend Developer',
  currentCompany: 'Example Ltd',
  location: 'Riga, Latvia',
  yearsOfExperience: 7,
  skills: ['Node.js', 'Docker'],
  summary: 'Builds backend systems.',
}

function providerAnalysis(overrides = {}) {
  return {
    overallScore: 82,
    requiredSkillsScore: 50,
    preferredSkillsScore: 100,
    experienceScore: 100,
    roleScore: 100,
    matchedSkills: ['Node.js', 'Docker'],
    missingSkills: ['AWS'],
    strengths: ['Relevant backend title.'],
    concerns: ['AWS is not evidenced in the supplied profile.'],
    summary: 'Relevant professional alignment with one required skill unevidenced.',
    evidenceCoverage: {
      percentage: 100,
      availableFields: ['title', 'skills', 'experience', 'location'],
      unknownFields: [],
      sufficientForScoring: true,
    },
    ...overrides,
  }
}

test('preserves provider scores for complete candidate information', () => {
  const result = applyCandidateEvidenceRules(
    job,
    completeCandidate,
    providerAnalysis(),
  )

  assert.equal(result.overallScore, 82)
  assert.equal(result.experienceScore, 100)
  assert.deepEqual(result.evidenceCoverage.unknownFields, [])
})

test('overrides invented scores for sparse candidate information', () => {
  const result = applyCandidateEvidenceRules(
    job,
    {
      ...completeCandidate,
      currentTitle: '',
      location: '',
      yearsOfExperience: null,
      skills: ['Node.js'],
      summary: '',
    },
    providerAnalysis({
      overallScore: 96,
      roleScore: 90,
      experienceScore: 90,
      concerns: [
        'The candidate lacks the required years of experience.',
        'AWS is not evidenced in the supplied profile.',
      ],
    }),
  )

  assert.equal(result.overallScore, null)
  assert.equal(result.roleScore, null)
  assert.equal(result.experienceScore, null)
  assert.equal(result.evidenceCoverage.percentage, 25)
  assert.match(result.summary, /^Insufficient information/)
  assert.equal(
    result.concerns.some((concern) => concern.includes('lacks the required years')),
    false,
  )
  assert.equal(
    result.concerns.some((concern) => concern.includes('Information unavailable')),
    true,
  )
})

test('preserves confirmed qualification mismatches when evidence is complete', () => {
  const result = applyCandidateEvidenceRules(
    job,
    completeCandidate,
    providerAnalysis({
      overallScore: 38,
      requiredSkillsScore: 50,
      experienceScore: 40,
      roleScore: 25,
      concerns: [
        'The supplied title does not align with the requested role.',
        'The stated experience is below the minimum.',
      ],
    }),
  )

  assert.equal(result.overallScore, 38)
  assert.equal(result.experienceScore, 40)
  assert.equal(result.roleScore, 25)
  assert.equal(result.concerns.length, 2)
})

test('marks a high score provisional and removes unsupported experience claims', () => {
  const result = applyCandidateEvidenceRules(
    job,
    {
      ...completeCandidate,
      yearsOfExperience: null,
    },
    providerAnalysis({
      overallScore: 94,
      experienceScore: 100,
      strengths: [
        'The candidate has seven years of experience.',
        'The supplied title aligns with the requested role.',
      ],
      concerns: [],
      summary: 'The candidate meets the five years experience requirement. The title and skills align well.',
    }),
  )

  assert.equal(result.overallScore, 94)
  assert.equal(result.experienceScore, null)
  assert.deepEqual(result.strengths, [
    'The supplied title aligns with the requested role.',
  ])
  assert.doesNotMatch(result.summary, /five years|meets.*experience/i)
  assert.match(result.summary, /provisional match assessment/i)
  assert.match(result.summary, /75% evidence coverage/i)
  assert.equal(
    result.concerns.includes(
      'Professional experience is unverified because reliable duration evidence is unavailable.',
    ),
    true,
  )
})

test('Groq and OpenAI candidate responses use the same shared structure', () => {
  const groqResponse = candidateMatchAnalysisSchema.parse(providerAnalysis())
  const openAIResponse = candidateMatchAnalysisSchema.parse({
    ...providerAnalysis(),
  })

  assert.deepEqual(groqResponse, openAIResponse)
  assert.ok('evidenceCoverage' in groqResponse)
  assert.ok(groqResponse.overallScore !== undefined)
})
