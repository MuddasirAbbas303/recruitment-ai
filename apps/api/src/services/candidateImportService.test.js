import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractPreliminaryCandidateFields,
  normalizeImportedCandidates,
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
    employmentDates: [],
    employmentHistory: [],
  })
})

test('extracts complete professional fields from common Google formats', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Jane Doe',
    resultTitle: 'Jane Doe - Software Engineer at Example Company | LinkedIn',
    searchSnippet:
      'Experienced in Node.js, TypeScript and AWS. Location: Riga, Latvia.',
    visibleSecondaryText: '',
  })

  assert.equal(fields.currentTitle, 'Software Engineer')
  assert.equal(fields.currentCompany, 'Example Company')
  assert.equal(fields.location, 'Riga, Latvia')
  assert.deepEqual(fields.skills, ['Node.js', 'TypeScript', 'AWS'])
  assert.equal(fields.yearsOfExperience, null)
})

test('extracts partial title skills without inventing company or location', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Jane Doe',
    resultTitle: 'Backend Engineer | Node.js, TypeScript, AWS | LinkedIn',
    searchSnippet: '',
    visibleSecondaryText: '',
  })

  assert.equal(fields.currentTitle, 'Backend Engineer')
  assert.equal(fields.currentCompany, null)
  assert.equal(fields.location, null)
  assert.deepEqual(fields.skills, ['Node.js', 'TypeScript', 'AWS'])
})

test('extracts metadata fields and naturally supported technologies', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Jane Doe',
    resultTitle: 'Jane Doe | LinkedIn',
    searchSnippet: 'Builds distributed services using PostgreSQL and Docker.',
    visibleSecondaryText:
      'Riga, Latvia · Backend Developer · Example Ltd',
  })

  assert.equal(fields.currentTitle, 'Backend Developer')
  assert.equal(fields.currentCompany, 'Example Ltd')
  assert.equal(fields.location, 'Riga, Latvia')
  assert.deepEqual(fields.skills, ['PostgreSQL', 'Docker'])
})

test('extracts natural title, company, location, and inline skills', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Sergejs Rupainis',
    resultTitle: 'Sergejs Rupainis - Node.js · TypeScript · AWS · Kafka',
    searchSnippet:
      'Senior Software Engineer at Ness Digital Engineering, Riga. Senior Software Engineer | Node.js | TypeScript | AWS.',
    visibleSecondaryText: '',
  })

  assert.equal(fields.currentTitle, 'Senior Software Engineer')
  assert.equal(fields.currentCompany, 'Ness Digital Engineering')
  assert.equal(fields.location, 'Riga')
  assert.deepEqual(fields.skills, ['Node.js', 'TypeScript', 'AWS'])
  assert.equal(fields.yearsOfExperience, null)
})

test('extracts the complete Step 53 Google metadata without cross-result inference', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Mareks Ļipņickis',
    resultTitle: 'Mareks Ļipņickis - Software Engineer | Node.js | TypeScript',
    searchSnippet:
      'Mareks Ļipņickis. Software Engineer | Node.js | TypeScript | AWS.',
    visibleSecondaryText:
      'Riga, Latvia · Software Engineer · Accenture Baltics',
  })

  assert.equal(fields.currentTitle, 'Software Engineer')
  assert.equal(fields.currentCompany, 'Accenture Baltics')
  assert.equal(fields.location, 'Riga, Latvia')
  assert.deepEqual(fields.skills, ['Node.js', 'TypeScript', 'AWS'])
  assert.equal(fields.yearsOfExperience, null)
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
    employmentDates: [],
    employmentHistory: [],
  })
})

test('extracts employer and location only from a clear professional metadata sequence', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Clear Candidate',
    resultTitle: 'Clear Candidate - Backend Engineer | LinkedIn',
    searchSnippet: 'Builds reliable services using Node.js.',
    visibleSecondaryText: 'Riga, Latvia · Backend Engineer · Example Labs',
  })

  assert.equal(fields.currentCompany, 'Example Labs')
  assert.equal(fields.location, 'Riga, Latvia')
})

test('keeps a city-named company separate from a clearly formatted location', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'City Company Candidate',
    resultTitle: 'City Company Candidate - Software Engineer | LinkedIn',
    searchSnippet: '',
    visibleSecondaryText: 'Riga, Latvia · Software Engineer · London Riga Labs',
  })

  assert.equal(fields.currentCompany, 'London Riga Labs')
  assert.equal(fields.location, 'Riga, Latvia')
})

test('does not treat education metadata as an employer', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Graduate Candidate',
    resultTitle: 'Graduate Candidate - Software Engineer | LinkedIn',
    searchSnippet: 'Studied computer science at University of Latvia.',
    visibleSecondaryText: 'Riga, Latvia · Software Engineer · University of Latvia',
  })

  assert.equal(fields.currentTitle, 'Software Engineer')
  assert.equal(fields.currentCompany, null)
  assert.equal(fields.location, null)
})

test('returns null company and location for shifted or ambiguous Google metadata', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Ambiguous Candidate',
    resultTitle: 'Ambiguous Candidate - Software Engineer | LinkedIn',
    searchSnippet:
      'Software Engineer working with Node.js, TypeScript and AWS at Example Labs.',
    visibleSecondaryText: 'Software Engineer · Example Labs · Riga, Latvia',
  })

  assert.equal(fields.currentCompany, null)
  assert.equal(fields.location, null)
})

test('does not create a location when employer evidence has no location', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Remote Candidate',
    resultTitle: 'Remote Candidate - Backend Engineer at Example Labs | LinkedIn',
    searchSnippet: 'Builds services using Node.js.',
    visibleSecondaryText: '',
  })

  assert.equal(fields.currentCompany, 'Example Labs')
  assert.equal(fields.location, null)
})

test('ignores misleading query and hiring terms as candidate skills', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Alex Example',
    resultTitle: 'Alex Example - Software Engineer | LinkedIn',
    searchSnippet:
      'Search results for Node.js and React. Example Company is hiring AWS developers.',
    visibleSecondaryText: 'LinkedIn profile result',
  })

  assert.equal(fields.currentTitle, 'Software Engineer')
  assert.equal(fields.currentCompany, null)
  assert.equal(fields.location, null)
  assert.deepEqual(fields.skills, [])
  assert.equal(fields.yearsOfExperience, null)
})

test('extracts exact Google metadata, title skills, and employment date evidence', () => {
  const fields = extractPreliminaryCandidateFields({
    resultTitle: 'Jane Doe - Senior Backend Engineer | Node.js, AWS | LinkedIn',
    searchSnippet: 'Feb 2023 – Jan 2025 · 2 years',
    visibleSecondaryText:
      'Riga, Latvia · Senior Backend Engineer · Example Ltd',
  })

  assert.deepEqual(fields, {
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Example Ltd',
    location: 'Riga, Latvia',
    yearsOfExperience: null,
    skills: ['Node.js', 'AWS'],
    employmentDates: ['Feb 2023 – Jan 2025'],
    employmentHistory: [],
  })
})

test('extracts a source-linked employment entry and calculates reliable experience', () => {
  const fields = extractPreliminaryCandidateFields({
    linkedinUrl: 'https://www.linkedin.com/in/jane-doe',
    resultTitle: 'Jane Doe - Senior Backend Engineer at Example Ltd | LinkedIn',
    searchSnippet: 'Feb 2023 – Present · Senior Backend Engineer',
    visibleSecondaryText: '',
  })

  assert.deepEqual(fields.employmentHistory, [
    {
      jobTitle: 'Senior Backend Engineer',
      company: 'Example Ltd',
      startDate: 'Feb 2023',
      endDate: 'Present',
      sourceUrl: 'https://www.linkedin.com/in/jane-doe',
    },
  ])
  assert.ok(fields.yearsOfExperience > 0)
})

test('retains year-only employment evidence without inventing total experience', () => {
  const fields = extractPreliminaryCandidateFields({
    linkedinUrl: 'https://www.linkedin.com/in/jane-doe',
    resultTitle: 'Jane Doe - Backend Engineer at Example Ltd | LinkedIn',
    searchSnippet: '2021 - 2023 · Backend Engineer',
    visibleSecondaryText: '',
  })

  assert.equal(fields.employmentHistory[0].startDate, '2021')
  assert.equal(fields.employmentHistory[0].endDate, '2023')
  assert.equal(fields.yearsOfExperience, null)
})

test('extracts an explicit professional duration without requiring the word experience', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Aleksey K.',
    linkedinUrl: 'https://www.linkedin.com/in/sliceem88',
    resultTitle: 'Aleksey K. - Senior Full-Stack Developer | LinkedIn',
    searchSnippet:
      'Senior Full-Stack Developer | PHP, Node.js & React | 6+ Years Building Scalable Solutions | Tech Mentor',
    visibleSecondaryText: '',
  })

  assert.equal(fields.yearsOfExperience, 6)
})

test('keeps an unlabeled parenthetical number unknown', () => {
  const fields = extractPreliminaryCandidateFields({
    fullName: 'Vadim Maksimov',
    linkedinUrl: 'https://www.linkedin.com/in/vadim-maksimov-9b76ba266',
    resultTitle: 'Vadim Maksimov - Web developer (5+) | JavaScript | LinkedIn',
    searchSnippet:
      'Web developer (5+) | JavaScript | TypeScript | Node.js | React.js',
    visibleSecondaryText: '',
  })

  assert.equal(fields.yearsOfExperience, null)
})

test('merges complementary duplicate Google evidence for one canonical LinkedIn URL', () => {
  const [candidate] = normalizeImportedCandidates([
    {
      fullName: 'Jane Doe',
      linkedinUrl: 'https://www.linkedin.com/in/jane-doe/?trk=first',
      resultTitle: 'Jane Doe - Backend Engineer | LinkedIn',
      searchSnippet: 'Riga, Latvia · Senior Backend Engineer · Example Ltd',
      visibleSecondaryText: '',
      source: 'google-linkedin',
    },
    {
      fullName: 'Jane Doe',
      linkedinUrl: 'https://lv.linkedin.com/in/jane-doe/',
      resultTitle: 'Jane Doe - Senior Backend Engineer | Node.js, AWS | LinkedIn',
      searchSnippet: 'Feb 2023 – Jan 2025 · 2 years',
      visibleSecondaryText: 'Skills: PostgreSQL.',
      source: 'google-linkedin',
    },
  ])

  const fields = extractPreliminaryCandidateFields(candidate)

  assert.equal(candidate.linkedinUrl, 'https://www.linkedin.com/in/jane-doe')
  assert.match(candidate.searchSnippet, /Riga, Latvia/)
  assert.match(candidate.searchSnippet, /Feb 2023 – Jan 2025/)
  assert.equal(fields.currentCompany, 'Example Ltd')
  assert.deepEqual(fields.skills, ['PostgreSQL', 'Node.js', 'AWS'])
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
    result.results.map((candidate) => candidate.scoringStatus),
    ['SUCCEEDED', 'SUCCEEDED'],
  )
  assert.deepEqual(
    getImportSession(session.id).candidates.map(
      (candidate) => candidate.matchScore,
    ),
    [91, 72],
  )
})
