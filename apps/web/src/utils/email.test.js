import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGmailComposeUrl, openGmailCompose } from './email.js'

test('encodes recipient, subject, multiline body, and special characters', () => {
  const composeUrl = buildGmailComposeUrl({
    to: 'john+jobs@example.com',
    subject: 'Senior Backend Developer — Riga & Remote',
    body: 'Hi John,\n\nNode.js + AWS? Let’s talk.\nBest,\nRecruiter',
  })
  const url = new URL(composeUrl)

  assert.equal(url.origin, 'https://mail.google.com')
  assert.equal(url.pathname, '/mail/')
  assert.equal(url.searchParams.get('view'), 'cm')
  assert.equal(url.searchParams.get('fs'), '1')
  assert.equal(url.searchParams.get('to'), 'john+jobs@example.com')
  assert.equal(url.searchParams.get('su'), 'Senior Backend Developer — Riga & Remote')
  assert.equal(
    url.searchParams.get('body'),
    'Hi John,\n\nNode.js + AWS? Let’s talk.\nBest,\nRecruiter',
  )
})

test('outreach opens Gmail with the recruiter current edited values', () => {
  let opened
  const openWindow = (...arguments_) => {
    opened = arguments_
    return {}
  }

  assert.equal(
    openGmailCompose(
      {
        to: 'candidate@example.com',
        subject: 'Recruiter-edited subject',
        body: 'Recruiter-edited outreach message',
      },
      openWindow,
    ),
    true,
  )

  const url = new URL(opened[0])
  assert.equal(url.searchParams.get('su'), 'Recruiter-edited subject')
  assert.equal(url.searchParams.get('body'), 'Recruiter-edited outreach message')
  assert.deepEqual(opened.slice(1), ['_blank', 'noopener,noreferrer'])
})

test('interview invitation uses the final editable subject and body', () => {
  let openedUrl
  openGmailCompose(
    {
      to: 'candidate@example.com',
      subject: 'Updated interview time',
      body: 'The final invitation body edited by the recruiter.',
    },
    (url) => {
      openedUrl = url
      return {}
    },
  )

  const url = new URL(openedUrl)
  assert.equal(url.searchParams.get('su'), 'Updated interview time')
  assert.equal(
    url.searchParams.get('body'),
    'The final invitation body edited by the recruiter.',
  )
})

test('missing email prevents Gmail from opening', () => {
  let openCount = 0
  const opened = openGmailCompose({ to: '', subject: 'Hello', body: 'Hi' }, () => {
    openCount += 1
    return {}
  })

  assert.equal(opened, false)
  assert.equal(openCount, 0)
})

test('opening Gmail has no activity or candidate-status side effects', () => {
  const candidate = { email: 'candidate@example.com', status: 'SOURCED' }
  const originalCandidate = structuredClone(candidate)
  let activityCount = 0

  const opened = openGmailCompose({ to: candidate.email }, () => {
    return {}
  })

  assert.equal(opened, true)
  assert.deepEqual(candidate, originalCandidate)
  assert.equal(activityCount, 0)
})

test('reports popup failure without changing application state', () => {
  assert.equal(
    openGmailCompose({ to: 'candidate@example.com' }, () => null),
    false,
  )
})
