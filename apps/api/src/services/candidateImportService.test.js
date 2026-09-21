import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractPreliminaryCandidateFields,
  scoreImportSessionCandidates,
} from './candidateImportService.js'
import {
  createImportSession,
  getImportSession,
} from './importSessionService.js'

test('extracts clearly supported professional fields from Google evidence', () => {
  const fields = extractPreliminaryCandidateFields({
    resultTitle:
      'Kristina Safonova - Senior Backend Developer at Example Ltd | LinkedIn',
    searchSnippet:
      'Location: Riga, Latvia. Skills: Node.js, AWS, PostgreSQL. 6 years of experience.',
    visibleSecondaryText: '',
  })

  assert.deepEqual(fields, {
    currentTitle: 'Senior Backend Developer',
    currentCompany: 'Example Ltd',
    location: 'Riga, Latvia',
    yearsOfExperience: 6,
    skills: ['Node.js', 'AWS', 'PostgreSQL'],
  })
})

test('does not guess unlabeled fields from ambiguous evidence', () => {
  const fields = extractPreliminaryCandidateFields({
    resultTitle: 'Alex Example | LinkedIn',
    searchSnippet: 'Building reliable systems and helping engineering teams.',
    visibleSecondaryText: 'Riga, Latvia',
  })

  assert.deepEqual(fields, {
    currentTitle: null,
    currentCompany: null,
    location: null,
    yearsOfExperience: null,
    skills: [],
  })
})

test('scores every candidate in an import session and stores the ranking', async () => {
  const session = createImportSession({
    candidates: [
      { id: 'candidate-1', fullName: 'First Candidate', matchScore: null },
      { id: 'candidate-2', fullName: 'Second Candidate', matchScore: null },
    ],
  })
  const criteria = {
    role: 'Backend Developer',
    requiredSkills: ['Node.js'],
    preferredSkills: [],
    location: 'Latvia',
    keywords: [],
    excludeKeywords: [],
  }

  const result = await scoreImportSessionCandidates(
    session.id,
    criteria,
    {
      analyzeResults: async (candidates, receivedCriteria) => {
        assert.equal(receivedCriteria.source, 'both')
        return [
          { ...candidates[1], matchScore: 91 },
          { ...candidates[0], matchScore: 72 },
        ]
      },
    },
  )

  assert.deepEqual(
    result.results.map((candidate) => candidate.matchScore),
    [91, 72],
  )
  assert.deepEqual(
    getImportSession(session.id).candidates.map(
      (candidate) => candidate.matchScore,
    ),
    [91, 72],
  )
})
