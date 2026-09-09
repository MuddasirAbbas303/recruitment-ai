import {
  normalizeWebCandidateResults,
  normalizedWebCandidatesSchema,
} from '../src/services/groqService.js'
import {
  CandidateSourceConfigurationError,
  CandidateSourceRequestError,
} from '../src/services/candidateSources/candidateSource.js'
import { createCandidateSource } from '../src/services/candidateSources/candidateSourceFactory.js'
import {
  buildGroqWebSearchPrompt,
  didBrowserSearchExecute,
  GroqWebCandidateSource,
} from '../src/services/candidateSources/groqWebCandidateSource.js'
import { deduplicateCandidateResults } from '../src/services/candidateSearchService.js'
import { analyzeCandidate } from '../src/services/candidateMatchService.js'

const criteria = {
  role: 'Backend Developer',
  requiredSkills: ['Node.js'],
  preferredSkills: ['PostgreSQL'],
  minExperience: 3,
  maxExperience: 10,
  location: 'Latvia',
  keywords: ['API'],
  excludeKeywords: ['intern'],
  source: 'external',
}
const publicProfileUrl = 'https://www.linkedin.com/in/jane-doe-backend'
const evidenceContent = [
  'Jane Doe — Backend Developer at Example Cloud in Riga, Latvia.',
  'Jane has 7 years of experience building Node.js APIs.',
  publicProfileUrl,
].join(' ')
const normalizedCandidate = {
  externalId: null,
  fullName: 'Jane Doe',
  currentTitle: 'Backend Developer',
  currentCompany: 'Example Cloud',
  location: 'Riga, Latvia',
  linkedinUrl: `${publicProfileUrl}/?trk=public_profile`,
  email: null,
  yearsOfExperience: 7,
  skills: ['Node.js', 'Unverified Skill'],
  summary: 'Backend developer building Node.js APIs.',
  source: 'groq-web',
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function createCompletion() {
  return {
    _request_id: 'search-request-id',
    choices: [
      {
        message: {
          content: evidenceContent,
          citations: [publicProfileUrl],
          executed_tools: [
            {
              type: 'browser_search',
              search_results: {
                results: [
                  {
                    title: 'Jane Doe - Backend Developer',
                    url: publicProfileUrl,
                    content:
                      'Backend Developer at Example Cloud in Riga, Latvia. 7 years of experience. Node.js APIs.',
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  }
}

function createStructuredResponse(value) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-normalize-test',
      object: 'chat.completion',
      created: 1,
      model: 'openai/gpt-oss-20b',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: JSON.stringify(value),
          },
        },
      ],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'normalization-request-id',
      },
    },
  )
}

function ensureStrictObject(schema) {
  ensure(schema.type === 'object', 'Schema must describe an object.')
  ensure(
    schema.additionalProperties === false,
    'Strict schema must reject additional properties.',
  )
  ensure(
    schema.required.length === Object.keys(schema.properties).length,
    'All strict object properties must be required.',
  )
}

const originalEnvironment = {
  EXTERNAL_CANDIDATE_PROVIDER: process.env.EXTERNAL_CANDIDATE_PROVIDER,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_NORMALIZATION_MODEL: process.env.GROQ_NORMALIZATION_MODEL,
  USE_MOCK_AI: process.env.USE_MOCK_AI,
}
const originalFetch = globalThis.fetch

try {
  process.env.EXTERNAL_CANDIDATE_PROVIDER = 'groq-web'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.USE_MOCK_AI = 'true'

  ensure(
    createCandidateSource('external') instanceof GroqWebCandidateSource,
    'Factory did not resolve the groq-web provider.',
  )

  const prompt = buildGroqWebSearchPrompt(criteria, 5)
  ensure(prompt.includes('Backend Developer'), 'Role was omitted from query.')
  ensure(prompt.includes('Node.js'), 'Required skills were omitted from query.')
  ensure(prompt.includes('Latvia'), 'Location was omitted from query.')

  let discoveryRequest
  let normalizationCalls = 0
  const fakeClient = {
    chat: {
      completions: {
        create: async (request) => {
          discoveryRequest = request
          return createCompletion()
        },
      },
    },
  }
  const source = new GroqWebCandidateSource({
    client: fakeClient,
    resultLimit: 5,
    normalizer: async () => {
      normalizationCalls += 1
      return [
        normalizedCandidate,
        {
          ...normalizedCandidate,
          fullName: 'Fabricated Person',
          linkedinUrl: 'https://www.linkedin.com/in/fabricated-person',
        },
      ]
    },
  })
  const candidates = await source.searchCandidates(criteria)

  ensure(
    discoveryRequest.model === 'openai/gpt-oss-20b',
    'Default Groq browser-search model was not used.',
  )
  ensure(
    discoveryRequest.tool_choice === 'required' &&
      discoveryRequest.tools.length === 1 &&
      discoveryRequest.tools[0].type === 'browser_search',
    'Required browser_search tool was not requested.',
  )
  ensure(
    discoveryRequest.response_format === undefined,
    'Discovery and structured normalization were combined.',
  )
  ensure(
    discoveryRequest.search_settings === undefined,
    'Compound search settings were retained in browser discovery.',
  )
  ensure(
    didBrowserSearchExecute(createCompletion()),
    'Browser search execution was not detected.',
  )
  ensure(normalizationCalls === 1, 'Normalization was not a separate stage.')
  ensure(candidates.length === 1, 'Unsupported fabricated profile was retained.')
  ensure(
    candidates[0].linkedinUrl === publicProfileUrl,
    'Discovered LinkedIn URL was not retained canonically.',
  )
  ensure(
    candidates[0].skills.length === 1 && candidates[0].skills[0] === 'Node.js',
    'Skills without discovery evidence were retained.',
  )
  ensure(
    candidates[0].isSaved === false,
    'External candidates must not be saved automatically.',
  )

  process.env.GROQ_NORMALIZATION_MODEL = 'openai/gpt-oss-20b'
  let normalizationRequest
  globalThis.fetch = async (_url, options) => {
    normalizationRequest = JSON.parse(options.body)
    return createStructuredResponse({ candidates: [normalizedCandidate] })
  }
  const normalized = await normalizeWebCandidateResults(
    { content: evidenceContent, searchResults: [], citations: [publicProfileUrl] },
    5,
  )
  normalizedWebCandidatesSchema.parse({ candidates: normalized })
  ensure(
    normalizationRequest.model === 'openai/gpt-oss-20b',
    'Configured normalization model was not used.',
  )
  ensure(
    normalizationRequest.response_format.type === 'json_schema' &&
      normalizationRequest.response_format.json_schema.strict === true,
    'Normalization did not use strict Structured Outputs.',
  )
  const rootSchema = normalizationRequest.response_format.json_schema.schema
  ensureStrictObject(rootSchema)
  ensureStrictObject(rootSchema.properties.candidates.items)

  const duplicateDatabaseCandidate = {
    ...candidates[0],
    id: 'database-candidate-id',
    externalId: 'database-candidate-id',
    source: 'database',
    isSaved: true,
  }
  ensure(
    deduplicateCandidateResults([
      duplicateDatabaseCandidate,
      candidates[0],
    ]).length === 1,
    'Cross-source LinkedIn deduplication failed.',
  )

  const matchAnalysis = await analyzeCandidate(criteria, candidates[0])
  ensure(
    Number.isFinite(matchAnalysis.overallScore),
    'Mock candidate scoring did not return a score.',
  )

  let missingKeyWasSafe = false
  try {
    await new GroqWebCandidateSource({ apiKey: '' }).searchCandidates(criteria)
  } catch (error) {
    missingKeyWasSafe =
      error instanceof CandidateSourceConfigurationError &&
      error.message === 'Groq API key is not configured.'
  }
  ensure(missingKeyWasSafe, 'Missing key did not fail safely.')

  let rateLimitWasSafe = false
  try {
    await new GroqWebCandidateSource({
      client: {
        chat: {
          completions: {
            create: async () => {
              const error = new Error('Sensitive provider response')
              error.status = 429
              error.request_id = 'rate-limit-request-id'
              throw error
            },
          },
        },
      },
    }).searchCandidates(criteria)
  } catch (error) {
    rateLimitWasSafe =
      error instanceof CandidateSourceRequestError &&
      error.message === 'Groq browser search rate limit exceeded.'
  }
  ensure(rateLimitWasSafe, 'Rate limit did not fail safely.')

  console.log(
    JSON.stringify({
      providerFactory: 'groq-web',
      twoStagePipeline: true,
      discoveryModel: discoveryRequest.model,
      browserSearchRequired: true,
      normalizedCandidates: candidates.length,
      evidenceGuard: true,
      strictNormalizationSchema: true,
      deduplication: true,
      mockScoring: true,
      automaticSave: false,
      missingKeyWasSafe,
      rateLimitWasSafe,
    }),
  )
} finally {
  globalThis.fetch = originalFetch

  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
}
