import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CandidateOutreachGenerationError,
  CandidateOutreachValidationError,
  generateLinkedInOutreach,
  generateCandidateOutreach,
  LINKEDIN_CONNECTION_MAX_LENGTH,
} from './candidateOutreachService.js'

function buildRequest(overrides = {}) {
  return {
    candidate: {
      fullName: 'Jordan Lee',
      currentTitle: 'Backend Engineer',
      currentCompany: 'Example Ltd',
      location: 'Riga, Latvia',
      email: 'jordan@example.com',
      skills: ['Node.js', 'AWS'],
      summary: 'Builds reliable backend services.',
      matchScore: 96,
      matchAnalysis: { summary: 'Internal analysis must stay private.' },
    },
    job: {
      role: 'Senior Backend Developer',
      requiredSkills: ['Node.js', 'AWS'],
      preferredSkills: ['Docker'],
      location: 'Latvia',
      description: 'Build reliable backend services.',
    },
    ...overrides,
  }
}

function buildLinkedInRequest(type = 'linkedin-message', overrides = {}) {
  return {
    type,
    candidate: {
      fullName: 'Jordan Lee',
      currentTitle: 'Backend Engineer',
      currentCompany: 'Example Ltd',
      location: 'Riga, Latvia',
      linkedinUrl: 'https://www.linkedin.com/in/jordan-lee',
      skills: ['Node.js', 'AWS'],
      summary: 'Builds reliable backend services.',
      matchAnalysis: { summary: 'Internal analysis must stay private.' },
    },
    job: {
      role: 'Senior Backend Developer',
      requiredSkills: ['Node.js', 'AWS'],
      preferredSkills: ['Docker'],
      location: 'Latvia',
      description: 'Build reliable backend services.',
    },
    ...overrides,
  }
}

test('mock outreach is deterministic and omits internal scores', async () => {
  const previousMockSetting = process.env.USE_MOCK_AI
  process.env.USE_MOCK_AI = 'true'

  try {
    const first = await generateCandidateOutreach(buildRequest())
    const second = await generateCandidateOutreach(buildRequest())
    const combined = `${first.subject}\n${first.body}`

    assert.deepEqual(first, second)
    assert.match(first.body, /Hi Jordan,/)
    assert.match(first.body, /Best,\n\[Recruiter\]$/)
    assert.doesNotMatch(combined, /\b96\b|score|internal analysis/i)
  } finally {
    if (previousMockSetting === undefined) {
      delete process.env.USE_MOCK_AI
    } else {
      process.env.USE_MOCK_AI = previousMockSetting
    }
  }
})

test('real-provider input excludes email, scores, and match analysis', async () => {
  let providerCandidate

  const result = await generateCandidateOutreach(buildRequest(), {
    generator(candidate) {
      providerCandidate = candidate
      return {
        subject: 'Backend opportunity',
        body: 'Hi Jordan,\n\nWould you be open to a short conversation?\n\nBest,\n[Recruiter]',
      }
    },
  })

  assert.equal(result.subject, 'Backend opportunity')
  assert.equal(providerCandidate.email, undefined)
  assert.equal(providerCandidate.matchScore, undefined)
  assert.equal(providerCandidate.matchAnalysis, undefined)
})

test('rejects malformed requests before calling a provider', async () => {
  let providerCalled = false

  await assert.rejects(
    generateCandidateOutreach(
      buildRequest({ candidate: { fullName: '', skills: [] } }),
      {
        generator() {
          providerCalled = true
        },
      },
    ),
    CandidateOutreachValidationError,
  )
  assert.equal(providerCalled, false)
})

test('rejects generated text that exposes scoring language', async () => {
  await assert.rejects(
    generateCandidateOutreach(buildRequest(), {
      generator() {
        return {
          subject: 'A strong match',
          body: 'Your match score is 96%.\n\nBest,\n[Recruiter]',
        }
      },
    }),
    CandidateOutreachGenerationError,
  )
})

test('mock LinkedIn message and connection note are deterministic and score-free', async () => {
  const previousMockSetting = process.env.USE_MOCK_AI
  process.env.USE_MOCK_AI = 'true'

  try {
    const directMessage = await generateLinkedInOutreach(
      buildLinkedInRequest('linkedin-message'),
    )
    const repeatedMessage = await generateLinkedInOutreach(
      buildLinkedInRequest('linkedin-message'),
    )
    const connectionNote = await generateLinkedInOutreach(
      buildLinkedInRequest('linkedin-connect'),
    )

    assert.deepEqual(directMessage, repeatedMessage)
    assert.match(directMessage.message, /Hi Jordan,/)
    assert.match(connectionNote.message, /Hi Jordan,/)
    assert.ok(
      connectionNote.message.length <= LINKEDIN_CONNECTION_MAX_LENGTH,
    )
    assert.doesNotMatch(
      `${directMessage.message}\n${connectionNote.message}`,
      /score|internal analysis|\b\d{1,3}%\b/i,
    )
  } finally {
    if (previousMockSetting === undefined) {
      delete process.env.USE_MOCK_AI
    } else {
      process.env.USE_MOCK_AI = previousMockSetting
    }
  }
})

test('LinkedIn provider input excludes profile URL and match analysis', async () => {
  let providerType
  let providerCandidate

  const result = await generateLinkedInOutreach(
    buildLinkedInRequest('linkedin-message'),
    {
      generator(type, candidate) {
        providerType = type
        providerCandidate = candidate
        return { message: 'Hi Jordan, would you be open to connecting?' }
      },
    },
  )

  assert.equal(result.message, 'Hi Jordan, would you be open to connecting?')
  assert.equal(providerType, 'linkedin-message')
  assert.equal(providerCandidate.linkedinUrl, undefined)
  assert.equal(providerCandidate.matchAnalysis, undefined)
})

test('rejects invalid LinkedIn requests and oversized connection notes', async () => {
  await assert.rejects(
    generateLinkedInOutreach(
      buildLinkedInRequest('linkedin-message', {
        candidate: {
          fullName: 'Jordan Lee',
          linkedinUrl: '',
          skills: [],
        },
      }),
    ),
    CandidateOutreachValidationError,
  )

  await assert.rejects(
    generateLinkedInOutreach(buildLinkedInRequest('linkedin-connect'), {
      generator() {
        return {
          message: 'x'.repeat(LINKEDIN_CONNECTION_MAX_LENGTH + 1),
        }
      },
    }),
    CandidateOutreachGenerationError,
  )
})
