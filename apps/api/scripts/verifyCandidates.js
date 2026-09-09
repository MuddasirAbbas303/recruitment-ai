import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Op } from 'sequelize'
import database from '../src/config/database.js'
import Candidate from '../src/models/Candidate.js'

const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000'
const marker = randomUUID()
const verificationName = `Step 20 Verification ${marker}`

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json()

  return { response, body }
}

try {
  const missingName = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({ currentTitle: 'Engineer' }),
  })
  assert.equal(missingName.response.status, 400)

  const created = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName} LinkedIn`,
      currentTitle: 'Senior Backend Engineer',
      currentCompany: 'Verification Company',
      linkedinUrl: `http://www.linkedin.com/in/${marker}?trk=verification`,
      email: `PRIMARY-${marker}@EXAMPLE.INVALID`,
      skills: ['Node.js', 'PostgreSQL'],
      notes: 'Keep this note',
      source: 'manual',
    }),
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.body.created, true)
  assert.equal(created.body.duplicateDetected, false)
  assert.equal(
    created.body.candidate.linkedinUrl,
    `https://www.linkedin.com/in/${marker}`,
  )
  assert.equal(
    created.body.candidate.email,
    `primary-${marker}@example.invalid`,
  )

  const linkedInDuplicate = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName} LinkedIn Updated`,
      currentTitle: 'Principal Backend Engineer',
      currentCompany: 'Verification Company',
      linkedinUrl: `https://linkedin.com/in/${marker}/`,
      location: 'Riga',
      skills: [],
      notes: '',
    }),
  })
  assert.equal(linkedInDuplicate.response.status, 200)
  assert.equal(linkedInDuplicate.body.created, false)
  assert.equal(linkedInDuplicate.body.duplicateDetected, true)
  assert.equal(
    linkedInDuplicate.body.candidate.id,
    created.body.candidate.id,
  )
  assert.equal(
    linkedInDuplicate.body.candidate.currentTitle,
    'Principal Backend Engineer',
  )
  assert.equal(linkedInDuplicate.body.candidate.location, 'Riga')
  assert.deepEqual(linkedInDuplicate.body.candidate.skills, [
    'Node.js',
    'PostgreSQL',
  ])
  assert.equal(linkedInDuplicate.body.candidate.notes, 'Keep this note')

  const emailCreated = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName} Email`,
      email: `email-${marker}@example.invalid`,
      currentTitle: 'Software Engineer',
    }),
  })
  assert.equal(emailCreated.response.status, 201)

  const emailDuplicate = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName} Email Updated`,
      email: `  EMAIL-${marker}@EXAMPLE.INVALID  `,
      currentCompany: 'Updated By Email',
    }),
  })
  assert.equal(emailDuplicate.response.status, 200)
  assert.equal(emailDuplicate.body.created, false)
  assert.equal(emailDuplicate.body.duplicateDetected, true)
  assert.equal(
    emailDuplicate.body.candidate.id,
    emailCreated.body.candidate.id,
  )
  assert.equal(
    emailDuplicate.body.candidate.currentCompany,
    'Updated By Email',
  )

  const fallbackCreated = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName} Fallback`,
      currentCompany: 'Fallback Company',
      currentTitle: 'Platform Engineer',
    }),
  })
  assert.equal(fallbackCreated.response.status, 201)

  const fallbackDuplicate = await apiRequest('/api/candidates', {
    method: 'POST',
    body: JSON.stringify({
      fullName: `${verificationName.toUpperCase()} FALLBACK`,
      currentCompany: 'fallback company',
      currentTitle: 'platform engineer',
      location: 'Must not be merged',
    }),
  })
  assert.equal(fallbackDuplicate.response.status, 409)
  assert.equal(fallbackDuplicate.body.success, false)
  assert.equal(fallbackDuplicate.body.possibleDuplicate, true)
  assert.equal(
    fallbackDuplicate.body.candidate.id,
    fallbackCreated.body.candidate.id,
  )

  const allCandidates = await apiRequest('/api/candidates')
  assert.equal(allCandidates.response.status, 200)
  assert.ok(Array.isArray(allCandidates.body.candidates))
  assert.ok(
    allCandidates.body.candidates.some(
      (candidate) => candidate.id === created.body.candidate.id,
    ),
  )
  const createdTimes = allCandidates.body.candidates.map((candidate) =>
    new Date(candidate.createdAt).getTime(),
  )
  assert.deepEqual(createdTimes, [...createdTimes].sort((a, b) => b - a))

  const candidateById = await apiRequest(
    `/api/candidates/${created.body.candidate.id}`,
  )
  assert.equal(candidateById.response.status, 200)
  assert.equal(candidateById.body.candidate.id, created.body.candidate.id)

  const invalidId = await apiRequest('/api/candidates/not-a-uuid')
  assert.equal(invalidId.response.status, 400)

  const missingCandidate = await apiRequest(
    `/api/candidates/${randomUUID()}`,
  )
  assert.equal(missingCandidate.response.status, 404)

  console.log(
    JSON.stringify(
      {
        success: true,
        verified: [
          'new candidate creation',
          'LinkedIn normalization and deduplication',
          'email normalization and deduplication without LinkedIn',
          'safe field updates',
          'blank-value preservation',
          'fallback possible duplicate',
          'newest-first candidate listing',
          'candidate lookup by ID',
          'invalid and missing candidate IDs',
          'required fullName validation',
        ],
      },
      null,
      2,
    ),
  )
} finally {
  await Candidate.destroy({
    where: {
      fullName: {
        [Op.iLike]: `Step 20 Verification ${marker}%`,
      },
    },
  })
  await database.close()
}
