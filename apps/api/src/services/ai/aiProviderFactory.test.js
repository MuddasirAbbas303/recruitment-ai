import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AIConfigurationError,
  AIServiceError,
  analyzeCandidate,
  analyzeResume,
  generateEmailOutreach,
  generateInterviewInvitation,
  generateLinkedInOutreach,
  searchPublicProfessionalWeb,
} from './aiService.js'
import {
  createAIProvider,
  getConfiguredAIProviderName,
} from './aiProviderFactory.js'
import { GroqProvider } from './groqProvider.js'
import { OpenAIProvider } from './openaiProvider.js'

const job = {
  title: 'Backend Developer',
  description: 'Build reliable Node.js services.',
  requiredSkills: ['Node.js'],
  preferredSkills: ['AWS'],
  minimumExperience: 3,
  location: 'Latvia',
}
const sourcingJob = {
  role: job.title,
  requiredSkills: job.requiredSkills,
  preferredSkills: job.preferredSkills,
  minExperience: job.minimumExperience,
  maxExperience: 10,
  location: job.location,
  keywords: [],
  excludeKeywords: [],
}
const candidate = {
  fullName: 'Alex Morgan',
  currentTitle: 'Backend Developer',
  currentCompany: 'Example Labs',
  location: 'Riga, Latvia',
  yearsOfExperience: 5,
  skills: ['Node.js', 'AWS'],
  summary: 'Builds backend services.',
}
const resumeAnalysis = {
  candidateName: candidate.fullName,
  currentTitle: candidate.currentTitle,
  overallScore: 90,
  requiredSkillsScore: 100,
  preferredSkillsScore: 80,
  experienceScore: 90,
  matchedSkills: ['Node.js', 'AWS'],
  missingSkills: [],
  strengths: ['Relevant backend work'],
  concerns: [],
  yearsOfExperience: 5,
  summary: 'Strong professional alignment.',
}
const candidateAnalysis = {
  overallScore: 90,
  requiredSkillsScore: 100,
  preferredSkillsScore: 80,
  experienceScore: 90,
  roleScore: 90,
  matchedSkills: ['Node.js', 'AWS'],
  missingSkills: [],
  strengths: ['Relevant backend work'],
  concerns: [],
  summary: 'Strong professional alignment.',
}

function preserveEnvironment(names) {
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]))

  return () => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  }
}

test('selects Groq by default and OpenAI when configured', () => {
  const restore = preserveEnvironment(['AI_PROVIDER'])

  try {
    delete process.env.AI_PROVIDER
    assert.equal(getConfiguredAIProviderName(), 'groq')
    assert.ok(createAIProvider() instanceof GroqProvider)

    process.env.AI_PROVIDER = 'openai'
    assert.equal(getConfiguredAIProviderName(), 'openai')
    assert.ok(createAIProvider() instanceof OpenAIProvider)
  } finally {
    restore()
  }
})

test('rejects an unsupported provider with a safe configuration error', () => {
  assert.throws(
    () => createAIProvider('unsupported'),
    (error) =>
      error instanceof AIConfigurationError &&
      error.message ===
        'Unsupported AI provider configuration. Use "groq" or "openai".',
  )
})

test('mock mode bypasses provider selection and all real provider clients', async () => {
  const restore = preserveEnvironment(['AI_PROVIDER', 'USE_MOCK_AI'])

  try {
    process.env.AI_PROVIDER = 'unsupported'
    process.env.USE_MOCK_AI = 'true'

    assert.equal(
      typeof (await analyzeResume(job, 'Alex Morgan\nBackend Developer')).overallScore,
      'number',
    )
    assert.equal(
      typeof (await analyzeCandidate(sourcingJob, candidate)).overallScore,
      'number',
    )
    assert.ok((await generateEmailOutreach(candidate, sourcingJob)).subject)
    assert.ok(
      (await generateLinkedInOutreach(
        candidate,
        sourcingJob,
        'linkedin-message',
      )).message,
    )
    assert.ok(
      (await generateInterviewInvitation(
        candidate,
        {
          title: 'Interview - Alex Morgan',
          date: '2030-01-02',
          time: '10:00',
          timezone: 'Europe/Riga',
          durationMinutes: 60,
          meetingType: 'Video Call',
          meetingLocation: null,
          notes: null,
        },
        sourcingJob,
      )).subject,
    )
    assert.throws(
      () => searchPublicProfessionalWeb('Find public professional information.'),
      (error) =>
        error instanceof AIServiceError && error.provider === 'mock',
    )
  } finally {
    restore()
  }
})

test('requires only the selected real provider key', async () => {
  const restore = preserveEnvironment([
    'AI_PROVIDER',
    'USE_MOCK_AI',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
  ])

  try {
    process.env.USE_MOCK_AI = 'false'
    process.env.AI_PROVIDER = 'groq'
    delete process.env.GROQ_API_KEY
    process.env.OPENAI_API_KEY = 'unused-openai-key'
    await assert.rejects(
      analyzeResume(job, 'Alex Morgan\nBackend Developer'),
      (error) =>
        error instanceof AIConfigurationError &&
        error.message === 'Groq API key is not configured.',
    )

    process.env.AI_PROVIDER = 'openai'
    delete process.env.OPENAI_API_KEY
    process.env.GROQ_API_KEY = 'unused-groq-key'
    await assert.rejects(
      analyzeResume(job, 'Alex Morgan\nBackend Developer'),
      (error) =>
        error instanceof AIConfigurationError &&
        error.message === 'OpenAI API key is not configured.',
    )
  } finally {
    restore()
  }
})

test('OpenAI provider preserves every existing structured application contract', async () => {
  const outputs = [
    resumeAnalysis,
    candidateAnalysis,
    { subject: 'Backend opportunity', body: 'Hi Alex,\n\nBest,\n[Recruiter]' },
    { message: 'Hi Alex, would you be open to discussing a backend role?' },
    { subject: 'Interview invitation', body: 'Your interview is scheduled.\n\nBest,\n[Recruiter]' },
    {
      candidates: [
        {
          externalId: 'alex-morgan',
          fullName: 'Alex Morgan',
          currentTitle: 'Backend Developer',
          currentCompany: null,
          location: 'Riga, Latvia',
          linkedinUrl: 'https://www.linkedin.com/in/alex-morgan',
          email: null,
          yearsOfExperience: null,
          skills: ['Node.js'],
          summary: null,
          source: 'groq-web',
        },
      ],
    },
    {
      candidate: {
        fullName: 'Alex Morgan',
        linkedinUrl: 'https://www.linkedin.com/in/alex-morgan',
        currentTitle: 'Backend Developer',
        currentCompany: null,
        location: 'Riga, Latvia',
        yearsOfExperience: null,
        skills: ['Node.js'],
        summary: 'Public professional summary.',
        githubUrl: 'https://github.com/alex-morgan',
        portfolioUrl: null,
        professionalUrls: ['https://github.com/alex-morgan'],
      },
      enrichment: {
        enriched: true,
        sources: [{ url: 'https://github.com/alex-morgan', type: 'github' }],
      },
    },
  ]
  const requests = []
  const provider = new OpenAIProvider({
    model: 'test-openai-model',
    client: {
      responses: {
        parse: async (request) => {
          requests.push(request)
          return { output_parsed: outputs.shift() }
        },
      },
    },
  })

  assert.deepEqual(
    await provider.analyzeResume(job, 'Alex Morgan\nBackend Developer'),
    resumeAnalysis,
  )
  assert.deepEqual(await provider.analyzeCandidate(sourcingJob, candidate), candidateAnalysis)
  assert.ok((await provider.generateEmailOutreach(candidate, sourcingJob)).subject)
  assert.ok(
    (await provider.generateLinkedInOutreach(
      candidate,
      sourcingJob,
      'linkedin-message',
    )).message,
  )
  assert.ok(
    (await provider.generateInterviewInvitation(
      candidate,
      { date: '2030-01-02', time: '10:00', timezone: 'Europe/Riga' },
      sourcingJob,
    )).subject,
  )
  assert.equal(
    (await provider.normalizeCandidateSearchResults({ content: 'evidence' }, 5))[0]
      .fullName,
    'Alex Morgan',
  )
  assert.equal(
    (await provider.normalizePublicCandidateEnrichment(
      candidate,
      { results: [{ url: 'https://github.com/alex-morgan' }] },
    )).candidate.fullName,
    'Alex Morgan',
  )
  assert.ok(requests.every((request) => request.model === 'test-openai-model'))
  assert.ok(requests.every((request) => request.text?.format))
  assert.equal(outputs.length, 0)
})

test('OpenAI web discovery uses web_search and returns common evidence shape', async () => {
  let requestBody
  let requestOptions
  const provider = new OpenAIProvider({
    model: 'test-openai-model',
    client: {
      responses: {
        create: async (body, options) => {
          requestBody = body
          requestOptions = options
          return {
            id: 'resp_test',
            output_text: 'Alex Morgan has a public GitHub profile.',
            output: [
              { type: 'web_search_call', id: 'search_test', status: 'completed' },
              {
                type: 'message',
                content: [
                  {
                    type: 'output_text',
                    text: 'Alex Morgan has a public GitHub profile.',
                    annotations: [
                      {
                        type: 'url_citation',
                        url: 'https://github.com/alex-morgan',
                        title: 'Alex Morgan on GitHub',
                      },
                    ],
                  },
                ],
              },
            ],
          }
        },
      },
    },
  })

  const result = await provider.searchPublicProfessionalWeb('Find Alex Morgan')

  assert.deepEqual(requestBody.tools, [
    { type: 'web_search', search_context_size: 'low' },
  ])
  assert.equal(requestBody.tool_choice, 'required')
  assert.equal(requestOptions.timeout, 120_000)
  assert.equal(
    result.choices[0].message.executed_tools[0].type,
    'browser_search',
  )
  assert.deepEqual(result.choices[0].message.citations, [
    'https://github.com/alex-morgan',
  ])
})

test('OpenAI provider returns safe structured-output and model errors', async () => {
  const invalidProvider = new OpenAIProvider({
    client: {
      responses: {
        parse: async () => ({ output_parsed: { unexpected: true } }),
      },
    },
  })

  await assert.rejects(
    invalidProvider.analyzeResume(job, 'Alex Morgan\nBackend Developer'),
    (error) =>
      error instanceof AIServiceError &&
      error.message === 'OpenAI returned an invalid structured response.' &&
      error.code === 'invalid_structured_output',
  )

  const unavailableModelProvider = new OpenAIProvider({
    client: {
      responses: {
        parse: async () => {
          const error = new Error('Sensitive provider detail')
          error.status = 404
          error.code = 'model_not_found'
          throw error
        },
      },
    },
  })

  await assert.rejects(
    unavailableModelProvider.analyzeResume(
      job,
      'Alex Morgan\nBackend Developer',
    ),
    (error) =>
      error instanceof AIServiceError &&
      error.message === 'Configured OpenAI model is unavailable.' &&
      !error.message.includes('Sensitive provider detail'),
  )
})

test('OpenAI provider retries only temporary rate limits with a bounded attempt count', async () => {
  let attempts = 0
  const provider = new OpenAIProvider({
    client: {
      responses: {
        parse: async () => {
          attempts += 1

          if (attempts < 3) {
            const error = new Error('Sensitive provider detail')
            error.status = 429
            error.type = 'rate_limit_error'
            error.code = 'rate_limit_exceeded'
            error.headers = new Headers({ 'retry-after': '0' })
            throw error
          }

          return { output_parsed: resumeAnalysis }
        },
      },
    },
  })

  assert.deepEqual(
    await provider.analyzeResume(job, 'Alex Morgan\nBackend Developer'),
    resumeAnalysis,
  )
  assert.equal(attempts, 3)
})
