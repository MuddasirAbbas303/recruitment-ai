import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPublicEnrichmentPrompt,
  buildPublicEnrichmentQueries,
  enrichPublicCandidate,
} from './candidateEnrichmentService.js'
import {
  createImportSession,
  getImportSession,
} from './importSessionService.js'

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
            'Synthetic Developer is a Senior Backend Developer at Example Labs in Riga, Latvia. The public GitHub profile shows Node.js and TypeScript projects and 8 years of experience.',
          executed_tools: [
            {
              type: 'browser_search',
              search_results: [
                {
                  url: 'https://github.com/synthetic-developer',
                  title: 'Synthetic Developer on GitHub',
                  snippet:
                    'Senior Backend Developer at Example Labs in Riga, Latvia. Node.js and TypeScript. 8 years of experience.',
                },
                {
                  url: 'https://synthetic.example.dev/',
                  title: 'Synthetic Developer portfolio',
                  snippet: 'Backend engineering projects and conference talks.',
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

test('public enrichment queries exclude LinkedIn and personal social sites', () => {
  const candidate = buildImportedCandidate({
    currentTitle: 'Backend Developer',
    currentCompany: 'Example Labs',
  })
  const queries = buildPublicEnrichmentQueries(candidate)
  const prompt = buildPublicEnrichmentPrompt(candidate)

  assert.ok(queries.length <= 5)
  assert.ok(queries.every((query) => query.includes('-site:linkedin.com')))
  assert.ok(queries.some((query) => query.includes('GitHub')))
  assert.match(prompt, /Do not open, browse, or use LinkedIn profile pages/)
})

test('enrichment uses supported public evidence, updates the session, and re-ranks', async () => {
  const candidate = buildImportedCandidate()
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
            skills: ['Node.js', 'TypeScript', 'Rust'],
            summary: 'Backend engineer focused on public Node.js projects.',
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
  assert.deepEqual(result.candidate.skills, ['Node.js', 'TypeScript'])
  assert.equal(result.candidate.githubUrl, 'https://github.com/synthetic-developer')
  assert.equal(result.candidate.portfolioUrl, 'https://synthetic.example.dev/')
  assert.equal(result.candidate.enrichment.sources.length, 2)
  assert.equal(result.candidate.isSaved, false)
  assert.equal(result.matchScore, 95)

  const updatedSession = getImportSession(session.id)
  assert.equal(updatedSession.candidates[0].id, candidate.id)
  assert.equal(updatedSession.candidates[0].matchScore, 95)
  assert.equal(updatedSession.candidates[0].enrichment.enriched, true)
})

test('unsupported normalized fields remain empty', async () => {
  const candidate = buildImportedCandidate()

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

  assert.equal(result.candidate.currentTitle, null)
  assert.equal(result.candidate.currentCompany, null)
  assert.equal(result.candidate.location, null)
  assert.equal(result.candidate.yearsOfExperience, null)
  assert.deepEqual(result.candidate.skills, [])
  assert.equal(result.candidate.isSaved, undefined)
})
