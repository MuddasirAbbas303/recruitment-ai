import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPublicEnrichmentPrompt,
  buildPublicEnrichmentQueries,
  enrichPublicCandidate,
  previewCandidateEmailDiscovery,
  confirmCandidateEmailDiscovery,
  previewManualCandidateEnrichment,
  confirmManualCandidateEnrichment,
} from './candidateEnrichmentService.js'
import {
  createImportSession,
  getImportSession,
} from './importSessionService.js'

function manualExtraction(overrides = {}) {
  return {
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
    skills: ['Node.js', 'AWS'],
    summary: 'Builds reliable backend services.',
    employmentHistory: [
      {
        jobTitle: 'Senior Backend Engineer',
        company: 'Example Labs',
        startDate: 'Jan 2020',
        endDate: 'Present',
      },
      {
        jobTitle: 'Consultant',
        company: 'Consulting Co',
        startDate: 'Jan 2021',
        endDate: 'Dec 2022',
      },
    ],
    ...overrides,
  }
}

const criteria = {
  role: 'Backend Developer',
  requiredSkills: ['Node.js'],
  preferredSkills: ['AWS'],
  minExperience: 5,
  maxExperience: 10,
  location: 'Latvia',
  keywords: [],
  excludeKeywords: [],
  source: 'external',
}

function buildImportedCandidate(overrides = {}) {
  return {
    id: 'https://www.linkedin.com/in/synthetic-developer',
    externalId: 'https://www.linkedin.com/in/synthetic-developer',
    fullName: 'Synthetic Developer',
    currentTitle: null,
    currentCompany: null,
    location: null,
    linkedinUrl: 'https://www.linkedin.com/in/synthetic-developer',
    email: null,
    yearsOfExperience: null,
    skills: [],
    summary: null,
    searchSnippet: 'Backend developer working with Node.js in Latvia.',
    source: 'google-linkedin',
    notes: '',
    isSaved: false,
    matchScore: 60,
    matchAnalysis: null,
    ...overrides,
  }
}

function buildDiscoveryCompletion() {
  return {
    _request_id: 'safe-test-request-id',
    choices: [
      {
        message: {
          content:
            'Synthetic Developer is a Senior Backend Developer at Example Labs in Riga, Latvia. Jan 2018 – Dec 2025. The public GitHub profile shows Node.js and TypeScript projects and 8 years of experience.',
          executed_tools: [
            {
              type: 'browser_search',
              search_results: [
                {
                  url:
                    'https://github.com/synthetic-developer?utm_source=openai',
                  title: 'Synthetic Developer on GitHub',
                  snippet:
                    'Synthetic Developer, Senior Backend Developer at Example Labs in Riga, Latvia. Jan 2018 – Dec 2025. Node.js and TypeScript. 8 years of experience.',
                },
                {
                  url: 'https://synthetic.example.dev/',
                  title: 'Synthetic Developer portfolio',
                  snippet:
                    'Synthetic Developer, Senior Backend Developer at Example Labs in Riga, Latvia. Backend engineering projects and conference talks.',
                },
                {
                  url: 'https://www.linkedin.com/in/synthetic-developer',
                  title: 'Synthetic Developer | LinkedIn',
                  snippet: 'This result must never be used as enrichment evidence.',
                },
              ],
            },
          ],
        },
      },
    ],
  }
}

function buildEmailCompletion({
  name = 'Synthetic Developer',
  identity = 'Senior Backend Engineer at Example Labs',
  email = 'synthetic.developer@example.com',
  url = 'https://example.com/team/synthetic-developer',
} = {}) {
  return {
    _request_id: 'mock-email-request',
    choices: [{
      message: {
        executed_tools: [{
          type: 'browser_search',
          search_results: [{
            url,
            title: `${name} — ${identity}`,
            snippet: `${name}, ${identity}. Contact: ${email}`,
          }],
        }],
      },
    }],
  }
}

function toEmailCandidate(candidate) {
  return {
    id: candidate.id,
    fullName: candidate.fullName,
    currentTitle: candidate.currentTitle,
    currentCompany: candidate.currentCompany,
    location: candidate.location,
    yearsOfExperience: candidate.yearsOfExperience,
    skills: candidate.skills,
    summary: candidate.summary,
    email: candidate.email,
    linkedinUrl: candidate.linkedinUrl,
    isSaved: candidate.isSaved,
    source: candidate.source,
  }
}

test('public enrichment queries exclude LinkedIn and personal social sites', () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
    resultTitle:
      'Synthetic Developer - Backend Developer at Example Labs | LinkedIn',
    visibleSecondaryText:
      'Riga, Latvia · Backend Developer · Example Labs',
  })
  const queries = buildPublicEnrichmentQueries(candidate)
  const prompt = buildPublicEnrichmentPrompt(candidate)

  assert.ok(queries.length <= 5)
  assert.ok(queries.every((query) => query.includes('-site:linkedin.com')))
  assert.ok(queries.some((query) => query.includes('GitHub')))
  assert.ok(queries.some((query) => query.includes('synthetic-developer')))
  assert.ok(queries.some((query) => query.includes('Riga, Latvia')))
  assert.ok(queries.some((query) => query.includes('Example Labs')))
  assert.ok(queries.some((query) => query.includes('working with Node.js')))
  assert.match(prompt, /Do not use LinkedIn pages/)
  assert.match(prompt, /Perform one focused web search/)
  assert.ok(prompt.length < 700)
})

test('builds focused queries from only a LinkedIn slug and Google snippet', () => {
  const candidate = buildImportedCandidate({
    currentTitle: null,
    currentCompany: null,
    location: null,
    resultTitle: null,
    visibleSecondaryText: null,
    searchSnippet:
      'Backend engineer building Node.js services and speaking at RigaJS.',
  })
  const queries = buildPublicEnrichmentQueries(candidate)

  assert.ok(queries.some((query) => query.includes('synthetic-developer')))
  assert.ok(queries.some((query) => query.includes('RigaJS')))
  assert.ok(queries.every((query) => query.includes('"Synthetic Developer"')))
  assert.ok(queries.every((query) => query.length < 500))
})

test('enrichment uses supported public evidence, updates the session, and re-ranks', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
  })
  const otherCandidate = buildImportedCandidate({
    id: 'https://www.linkedin.com/in/other-developer',
    externalId: 'https://www.linkedin.com/in/other-developer',
    fullName: 'Other Developer',
    linkedinUrl: 'https://www.linkedin.com/in/other-developer',
    matchScore: 70,
  })
  const session = createImportSession({
    criteria,
    candidates: [otherCandidate, candidate],
  })
  let normalizationEvidence

  const result = await enrichPublicCandidate(
    {
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        linkedinUrl: candidate.linkedinUrl,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        location: candidate.location,
        searchSnippet: candidate.searchSnippet,
      },
      importSessionId: session.id,
    },
    {
      discover: async () => buildDiscoveryCompletion(),
      normalize: async (_candidate, evidence) => {
        normalizationEvidence = evidence
        return {
          candidate: {
            fullName: candidate.fullName,
            linkedinUrl: candidate.linkedinUrl,
            currentTitle: 'Senior Backend Developer',
            currentCompany: 'Example Labs',
            location: 'Riga, Latvia',
            yearsOfExperience: 8,
            employmentHistory: [
              {
                jobTitle: 'Senior Backend Developer',
                company: 'Example Labs',
                startDate: 'Jan 2018',
                endDate: 'Dec 2025',
                sourceUrl: 'https://github.com/synthetic-developer',
              },
            ],
            skills: ['Node.js', 'TypeScript', 'Rust'],
            summary: 'Senior Backend Developer at Example Labs in Riga, Latvia.',
            githubUrl: 'https://github.com/synthetic-developer',
            portfolioUrl: 'https://synthetic.example.dev/',
            professionalUrls: [
              'https://github.com/synthetic-developer',
              'https://synthetic.example.dev/',
              'https://www.linkedin.com/in/synthetic-developer',
            ],
          },
          enrichment: {
            enriched: true,
            sources: [
              {
                url: 'https://github.com/synthetic-developer',
                type: 'github',
              },
              {
                url: 'https://synthetic.example.dev/',
                type: 'portfolio',
              },
              {
                url: 'https://www.linkedin.com/in/synthetic-developer',
                type: 'professional',
              },
            ],
          },
        }
      },
      analyzeResults: async (candidates, receivedCriteria) => {
        assert.deepEqual(receivedCriteria, criteria)
        return candidates.map((scoredCandidate) => ({
          ...scoredCandidate,
          matchScore: 95,
          matchAnalysis: {
            overallScore: 95,
            requiredSkillsScore: 100,
            preferredSkillsScore: 70,
            experienceScore: 100,
            roleScore: 95,
            matchedSkills: ['Node.js'],
            missingSkills: [],
            strengths: ['Relevant backend experience'],
            concerns: [],
            summary: 'Strong professional match.',
          },
        }))
      },
    },
  )

  assert.equal(
    normalizationEvidence.results.some((item) =>
      item.url.includes('linkedin.com'),
    ),
    false,
  )
  assert.equal(result.candidate.currentTitle, 'Senior Backend Developer')
  assert.equal(result.candidate.currentCompany, 'Example Labs')
  assert.equal(result.candidate.location, 'Riga, Latvia')
  assert.equal(result.candidate.yearsOfExperience, 8)
  assert.deepEqual(result.candidate.employmentHistory, [
    {
      jobTitle: 'Senior Backend Developer',
      company: 'Example Labs',
      startDate: 'Jan 2018',
      endDate: 'Dec 2025',
      sourceUrl: 'https://github.com/synthetic-developer',
    },
  ])
  assert.deepEqual(result.candidate.skills, ['Node.js', 'TypeScript'])
  assert.equal(result.candidate.githubUrl, 'https://github.com/synthetic-developer')
  assert.equal(result.candidate.portfolioUrl, 'https://synthetic.example.dev/')
  assert.equal(result.candidate.enrichment.sources.length, 2)
  assert.deepEqual(result.candidate.enrichment.fieldSources.currentTitle, [
    'https://github.com/synthetic-developer',
    'https://synthetic.example.dev/',
  ])
  assert.deepEqual(
    result.candidate.enrichment.fieldSources.skills['Node.js'],
    ['https://github.com/synthetic-developer'],
  )
  assert.equal(result.candidate.isSaved, false)
  assert.equal(result.matchScore, 95)

  const updatedSession = getImportSession(session.id)
  assert.equal(updatedSession.candidates[0].id, candidate.id)
  assert.equal(updatedSession.candidates[0].matchScore, 95)
  assert.equal(updatedSession.candidates[0].enrichment.enriched, true)
})

test('keeps existing fields when identity-verified evidence does not support new fields', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
  })

  const result = await enrichPublicCandidate(
    {
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        linkedinUrl: candidate.linkedinUrl,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        location: candidate.location,
        searchSnippet: candidate.searchSnippet,
      },
    },
    {
      discover: async () => buildDiscoveryCompletion(),
      normalize: async () => ({
        candidate: {
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: 'Fabricated Architect',
          currentCompany: 'Fabricated Corp',
          location: 'Tallinn, Estonia',
          yearsOfExperience: 42,
          skills: ['Rust'],
          summary: null,
          githubUrl: null,
          portfolioUrl: null,
          professionalUrls: [],
        },
        enrichment: {
          enriched: true,
          sources: [
            {
              url: 'https://github.com/synthetic-developer',
              type: 'github',
            },
          ],
        },
      }),
    },
  )

  assert.equal(result.candidate.currentTitle, 'Backend Developer')
  assert.equal(result.candidate.currentCompany, 'Example Labs')
  assert.equal(result.candidate.location, 'Riga, Latvia')
  assert.equal(result.candidate.yearsOfExperience, null)
  assert.deepEqual(result.candidate.skills, [])
  assert.equal(result.candidate.isSaved, undefined)
})

test('rejects a different person with the same name and preserves the import session', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
  })
  const session = createImportSession({ candidates: [candidate] })
  const originalCandidate = getImportSession(session.id).candidates[0]

  await assert.rejects(
    enrichPublicCandidate(
      {
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: candidate.currentTitle,
          currentCompany: candidate.currentCompany,
          location: candidate.location,
          searchSnippet: candidate.searchSnippet,
        },
        importSessionId: session.id,
      },
      {
        discover: async () => ({
          _request_id: 'same-name-test',
          choices: [
            {
              message: {
                content:
                  'Synthetic Developer is a tax lawyer at Different Firm in London.',
                executed_tools: [
                  {
                    type: 'browser_search',
                    search_results: [
                      {
                        url: 'https://unrelated.example/synthetic-developer',
                        title: 'Synthetic Developer | Tax Lawyer',
                        snippet:
                          'Synthetic Developer is a tax lawyer at Different Firm in London. Jan 2019 – Dec 2024.',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
        normalize: async () => ({
          candidate: {
            fullName: candidate.fullName,
            linkedinUrl: candidate.linkedinUrl,
            currentTitle: 'Tax Lawyer',
            currentCompany: 'Different Firm',
            location: 'London',
            yearsOfExperience: null,
            employmentHistory: [
              {
                jobTitle: 'Tax Lawyer',
                company: 'Different Firm',
                startDate: 'Jan 2019',
                endDate: 'Dec 2024',
                sourceUrl: 'https://unrelated.example/synthetic-developer',
              },
            ],
            skills: ['Tax Law'],
            summary: 'Synthetic Developer is a tax lawyer at Different Firm in London.',
            githubUrl: null,
            portfolioUrl: null,
            professionalUrls: [],
          },
          enrichment: {
            enriched: true,
            sources: [
              {
                url: 'https://unrelated.example/synthetic-developer',
                type: 'professional',
              },
            ],
          },
        }),
      },
    ),
    /No identity-verified public professional information was found/,
  )

  assert.deepEqual(getImportSession(session.id).candidates[0], originalCandidate)
})

test('rejects name-only evidence when no reliable identity signal is present', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
  })

  await assert.rejects(
    enrichPublicCandidate(
      {
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: candidate.currentTitle,
          currentCompany: candidate.currentCompany,
          location: candidate.location,
          searchSnippet: candidate.searchSnippet,
        },
      },
      {
        discover: async () => ({
          _request_id: 'name-only-test',
          choices: [
            {
              message: {
                content: 'Synthetic Developer has a public portfolio.',
                executed_tools: [
                  {
                    type: 'browser_search',
                    search_results: [
                      {
                        url: 'https://portfolio.example/synthetic-developer',
                        title: 'Synthetic Developer portfolio',
                        snippet: 'Selected work and writing.',
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }),
        normalize: async () => ({
          candidate: {
            fullName: candidate.fullName,
            linkedinUrl: candidate.linkedinUrl,
            currentTitle: null,
            currentCompany: null,
            location: null,
            yearsOfExperience: null,
            skills: [],
            summary: null,
            githubUrl: null,
            portfolioUrl: 'https://portfolio.example/synthetic-developer',
            professionalUrls: [
              'https://portfolio.example/synthetic-developer',
            ],
          },
          enrichment: {
            enriched: true,
            sources: [
              {
                url: 'https://portfolio.example/synthetic-developer',
                type: 'portfolio',
              },
            ],
          },
        }),
      },
    ),
    /No identity-verified public professional information was found/,
  )
})

test('manual enrichment previews extraction and updates an unsaved import only after confirmation', async () => {
  const candidate = buildImportedCandidate({ currentTitle: 'Backend Developer' })
  const session = createImportSession({ criteria, candidates: [candidate] })
  const preview = await previewManualCandidateEnrichment(
    {
      action: 'preview',
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        currentTitle: candidate.currentTitle,
        currentCompany: null,
        location: null,
        yearsOfExperience: null,
        skills: [],
        summary: null,
        linkedinUrl: candidate.linkedinUrl,
        isSaved: false,
        source: candidate.source,
      },
      profileText: {
        about: 'Builds reliable backend services.',
        workExperience: 'Senior Backend Engineer at Example Labs, Jan 2020 - Present',
        skills: 'Node.js, AWS',
      },
      importSessionId: session.id,
    },
    { extract: async () => manualExtraction() },
  )

  assert.equal(getImportSession(session.id).candidates[0].currentTitle, 'Backend Developer')
  assert.equal(preview.extracted.yearsOfExperience > 5, true)
  assert.ok(preview.replacementFields.includes('currentTitle'))

  const confirmed = await confirmManualCandidateEnrichment(
    {
      action: 'confirm',
      previewId: preview.previewId,
      approvedFields: ['currentCompany', 'skills', 'employmentHistory', 'yearsOfExperience'],
    },
    {
      analyzeResults: async (candidates) => candidates.map((value) => ({
        ...value,
        matchScore: 88,
        matchAnalysis: { summary: 'Evidence-aware match.' },
      })),
    },
  )

  assert.equal(confirmed.candidate.currentTitle, 'Backend Developer')
  assert.equal(confirmed.candidate.currentCompany, 'Example Labs')
  assert.deepEqual(confirmed.candidate.skills, ['Node.js', 'AWS'])
  assert.equal(confirmed.candidate.matchScore, 88)
  assert.equal(getImportSession(session.id).candidates[0].currentCompany, 'Example Labs')
})

test('manual enrichment leaves missing fields unknown and does not double-count overlapping jobs', async () => {
  const candidate = buildImportedCandidate()
  const preview = await previewManualCandidateEnrichment(
    {
      action: 'preview',
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        currentTitle: null,
        currentCompany: null,
        location: null,
        yearsOfExperience: null,
        skills: [],
        summary: null,
        linkedinUrl: candidate.linkedinUrl,
        isSaved: false,
        source: candidate.source,
      },
      profileText: { about: '', workExperience: 'Professional history', skills: '' },
    },
    { extract: async () => manualExtraction({ location: null }) },
  )

  assert.equal(preview.extracted.location, null)
  assert.equal(preview.extracted.yearsOfExperience < 8, true)
})

test('saved manual enrichment persists only explicitly approved professional fields', async () => {
  const id = 'eec2f30a-6d45-44c4-b1bd-a84707e20766'
  const saved = {
    id,
    fullName: 'Saved Candidate',
    currentTitle: 'Backend Developer',
    currentCompany: 'Existing Co',
    location: null,
    yearsOfExperience: null,
    skills: ['JavaScript'],
    summary: null,
    linkedinUrl: 'https://www.linkedin.com/in/saved-candidate',
    isSaved: true,
    source: 'database',
  }
  let persisted
  const preview = await previewManualCandidateEnrichment(
    {
      action: 'preview',
      candidate: saved,
      profileText: { about: 'Backend specialist.', workExperience: 'History', skills: 'Node.js' },
    },
    {
      getSavedCandidate: async () => saved,
      extract: async () => manualExtraction(),
    },
  )

  const result = await confirmManualCandidateEnrichment(
    { action: 'confirm', previewId: preview.previewId, approvedFields: ['skills', 'summary'] },
    {
      updateSavedCandidate: async (_id, fields) => {
        persisted = fields
        return { ...saved, ...fields }
      },
    },
  )

  assert.deepEqual(persisted.skills, ['JavaScript', 'Node.js', 'AWS'])
  assert.equal(persisted.summary, 'Builds reliable backend services.')
  assert.equal(result.candidate.currentTitle, 'Backend Developer')
  assert.equal(result.candidate.currentCompany, 'Existing Co')
})

test('manual AI extraction failure preserves candidate and import session', async () => {
  const candidate = buildImportedCandidate({ currentCompany: 'Original Co' })
  const session = createImportSession({ criteria, candidates: [candidate] })
  const before = getImportSession(session.id)

  await assert.rejects(
    previewManualCandidateEnrichment(
      {
        action: 'preview',
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          currentTitle: null,
          currentCompany: candidate.currentCompany,
          location: null,
          yearsOfExperience: null,
          skills: [],
          summary: null,
          linkedinUrl: candidate.linkedinUrl,
          isSaved: false,
          source: candidate.source,
        },
        profileText: { about: 'Text', workExperience: '', skills: '' },
        importSessionId: session.id,
      },
      { extract: async () => { throw new Error('Mock provider failure') } },
    ),
    /Mock provider failure/,
  )
  assert.deepEqual(getImportSession(session.id), before)
})

test('manual enrichment previews and confirms a recruiter-entered email without an AI call', async () => {
  const candidate = buildImportedCandidate()
  const session = createImportSession({ candidates: [candidate] })
  let extractionCalled = false
  const preview = await previewManualCandidateEnrichment(
    {
      action: 'preview',
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        currentTitle: null,
        currentCompany: null,
        location: null,
        yearsOfExperience: null,
        skills: [],
        summary: null,
        email: null,
        linkedinUrl: candidate.linkedinUrl,
        isSaved: false,
        source: candidate.source,
      },
      profileText: { about: '', workExperience: '', skills: '' },
      email: ' Candidate@Example.com ',
      importSessionId: session.id,
    },
    {
      extract: async () => {
        extractionCalled = true
        return manualExtraction()
      },
    },
  )

  assert.equal(extractionCalled, false)
  assert.equal(preview.extracted.email, 'candidate@example.com')
  const result = await confirmManualCandidateEnrichment({
    action: 'confirm',
    previewId: preview.previewId,
    approvedFields: ['email'],
  })
  assert.equal(result.candidate.email, 'candidate@example.com')
  assert.equal(getImportSession(session.id).candidates[0].email, 'candidate@example.com')
})

test('leaves candidate unchanged when no relevant public sources are found', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
    location: 'Riga, Latvia',
  })
  let normalizeCalled = false

  await assert.rejects(
    enrichPublicCandidate(
      {
        candidate: {
          id: candidate.id,
          fullName: candidate.fullName,
          linkedinUrl: candidate.linkedinUrl,
          currentTitle: candidate.currentTitle,
          currentCompany: candidate.currentCompany,
          location: candidate.location,
          searchSnippet: candidate.searchSnippet,
        },
      },
      {
        discover: async () => ({
          _request_id: 'no-results-test',
          choices: [
            {
              message: {
                content: 'No relevant public professional pages found.',
                executed_tools: [
                  { type: 'browser_search', search_results: [] },
                ],
              },
            },
          ],
        }),
        normalize: async () => {
          normalizeCalled = true
          return null
        },
      },
    ),
    /No supported public professional information was found/,
  )

  assert.equal(normalizeCalled, false)
  assert.equal(candidate.currentTitle, 'Backend Developer')
  assert.equal(candidate.currentCompany, 'Example Labs')
})

test('email discovery previews identity-verified public evidence and confirms an unsaved candidate', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Example Labs',
  })
  const session = createImportSession({ criteria, candidates: [candidate] })
  const preview = await previewCandidateEmailDiscovery(
    {
      action: 'preview',
      candidate: toEmailCandidate(candidate),
      importSessionId: session.id,
    },
    { discover: async () => buildEmailCompletion() },
  )

  assert.equal(preview.email, 'synthetic.developer@example.com')
  assert.equal(preview.verified, true)
  assert.equal(getImportSession(session.id).candidates[0].email, null)

  const confirmed = await confirmCandidateEmailDiscovery({
    action: 'confirm',
    previewId: preview.previewId,
  })
  assert.equal(confirmed.candidate.email, 'synthetic.developer@example.com')
  assert.equal(confirmed.candidate.isSaved, false)
  assert.equal(getImportSession(session.id).candidates[0].email, confirmed.email)
})

test('email discovery rejects a same-name person without a matching identity signal', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Example Labs',
  })

  await assert.rejects(
    previewCandidateEmailDiscovery(
      { action: 'preview', candidate: toEmailCandidate(candidate) },
      {
        discover: async () => buildEmailCompletion({
          identity: 'Dentist at Dental Practice',
          email: 'other.person@example.com',
        }),
      },
    ),
    /No verified professional email found/,
  )
})

test('email discovery rejects an email without sufficient identity evidence and no result', async () => {
  const candidate = buildImportedCandidate()

  await assert.rejects(
    previewCandidateEmailDiscovery(
      { action: 'preview', candidate: toEmailCandidate(candidate) },
      { discover: async () => buildEmailCompletion() },
    ),
    /No verified professional email found/,
  )

  await assert.rejects(
    previewCandidateEmailDiscovery(
      { action: 'preview', candidate: toEmailCandidate({ ...candidate, currentTitle: 'Backend Engineer' }) },
      {
        discover: async () => ({
          choices: [{ message: { executed_tools: [{ type: 'browser_search', search_results: [] }] } }],
        }),
      },
    ),
    /No verified professional email found/,
  )
})

test('email discovery requires confirmation to replace and persist a saved candidate email', async () => {
  const candidate = {
    ...buildImportedCandidate({
      id: '0d3a166c-d625-4540-b046-a714bd11fdcf',
      currentTitle: 'Senior Backend Engineer',
      currentCompany: 'Example Labs',
      email: 'old@example.com',
      isSaved: true,
      source: 'database',
    }),
  }
  let persisted = null
  const preview = await previewCandidateEmailDiscovery(
    { action: 'preview', candidate: toEmailCandidate(candidate) },
    {
      getSavedCandidate: async () => candidate,
      discover: async () => buildEmailCompletion(),
    },
  )

  assert.equal(preview.replacesExisting, true)
  assert.equal(persisted, null)
  const confirmed = await confirmCandidateEmailDiscovery(
    { action: 'confirm', previewId: preview.previewId },
    {
      updateSavedCandidate: async (_id, fields) => {
        persisted = fields
        return { ...candidate, ...fields }
      },
    },
  )
  assert.deepEqual(persisted, { email: 'synthetic.developer@example.com' })
  assert.equal(confirmed.candidate.email, persisted.email)
})

test('email provider failure preserves the candidate and import session', async () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Example Labs',
  })
  const session = createImportSession({ criteria, candidates: [candidate] })
  const before = getImportSession(session.id)

  await assert.rejects(
    previewCandidateEmailDiscovery(
      { action: 'preview', candidate: toEmailCandidate(candidate), importSessionId: session.id },
      { discover: async () => { throw new Error('Mock provider failure') } },
    ),
    /Mock provider failure/,
  )
  assert.deepEqual(getImportSession(session.id), before)
})

test('email discovery supports deterministic mock mode without a provider request', async () => {
  const previousMockMode = process.env.USE_MOCK_AI
  process.env.USE_MOCK_AI = 'true'

  try {
    const candidate = buildImportedCandidate({
      currentTitle: 'Senior Backend Engineer',
      currentCompany: 'Example Labs',
    })
    const preview = await previewCandidateEmailDiscovery({
      action: 'preview',
      candidate: toEmailCandidate(candidate),
    })

    assert.equal(preview.email, 'synthetic.developer@example.com')
    assert.equal(preview.sourceUrl, 'https://example.com/team/synthetic.developer')
  } finally {
    if (previousMockMode === undefined) delete process.env.USE_MOCK_AI
    else process.env.USE_MOCK_AI = previousMockMode
  }
})
