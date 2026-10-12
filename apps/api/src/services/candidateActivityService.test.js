import assert from 'node:assert/strict'
import test from 'node:test'
import Candidate from '../models/Candidate.js'
import CandidateActivity, {
  candidateActivityTypes,
} from '../models/CandidateActivity.js'
import {
  createCandidateActivity,
  getProjectStageForActivity,
  shouldUpdateCandidateToContacted,
  shouldUpdateCandidateToInterview,
} from './candidateActivityService.js'

test('registers candidate activity associations and supported types', () => {
  assert.equal(Candidate.associations.activities.target, CandidateActivity)
  assert.equal(CandidateActivity.associations.candidate.target, Candidate)
  assert.deepEqual(candidateActivityTypes, [
    'EMAIL_SENT',
    'LINKEDIN_MESSAGE_SENT',
    'LINKEDIN_CONNECT_SENT',
    'NOTE',
    'STATUS_CHANGED',
    'INTERVIEW_INVITED',
  ])
})

function dependencies(candidate, projectLinks = {}) {
  const created = []
  return {
    created,
    value: {
      now: new Date('2026-09-24T00:00:00.000Z'),
      database: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) },
      Candidate: { findByPk: async () => candidate },
      CandidateActivity: { create: async (activity) => { created.push(activity); return activity } },
      JobCandidate: { findOne: async ({ where }) => projectLinks[where.jobId] ?? null },
    },
  }
}

function record(status, extra = {}) {
  return { status, email: 'candidate@example.com', id: '33333333-3333-4333-8333-333333333333', update: async function (value) { Object.assign(this, value) }, ...extra }
}

test('project outreach updates only the selected project relationship', async () => {
  const candidate = record('SAVED')
  const projectA = record('SOURCED', { id: 'link-a' })
  const projectB = record('SOURCED', { id: 'link-b' })
  const deps = dependencies(candidate, { '11111111-1111-4111-8111-111111111111': projectA, '22222222-2222-4222-8222-222222222222': projectB })
  const result = await createCandidateActivity(candidate.id, { type: 'EMAIL_SENT', channel: 'email', metadata: {}, projectId: '11111111-1111-4111-8111-111111111111' }, deps.value)
  assert.equal(projectA.status, 'CONTACTED')
  assert.equal(projectB.status, 'SOURCED')
  assert.equal(result.activity.jobId, '11111111-1111-4111-8111-111111111111')
})

test('project interview updates only its link and does not downgrade hired', async () => {
  assert.equal(getProjectStageForActivity('HIRED', 'INTERVIEW_INVITED'), 'HIRED')
  assert.equal(getProjectStageForActivity('RESPONDED', 'INTERVIEW_INVITED'), 'INTERVIEW')
  assert.equal(getProjectStageForActivity('RESPONDED', 'EMAIL_SENT'), 'RESPONDED')
  assert.equal(getProjectStageForActivity('INTERVIEW', 'LINKEDIN_MESSAGE_SENT'), 'INTERVIEW')
})

test('interview invitation advances only the selected project to interview', async () => {
  const candidate = record('RESPONDED')
  const projectA = record('RESPONDED', { id: 'link-a' })
  const projectB = record('SHORTLISTED', { id: 'link-b' })
  const deps = dependencies(candidate, { '11111111-1111-4111-8111-111111111111': projectA, '22222222-2222-4222-8222-222222222222': projectB })
  await createCandidateActivity(candidate.id, {
    type: 'INTERVIEW_INVITED', channel: 'manual', projectId: '11111111-1111-4111-8111-111111111111',
    metadata: { interviewTitle: 'Backend interview', date: '2026-10-20', time: '14:00', timezone: 'Europe/Riga', durationMinutes: 60, meetingType: 'Video Call', meetingLocation: null },
  }, deps.value)
  assert.equal(projectA.status, 'INTERVIEW')
  assert.equal(projectB.status, 'SHORTLISTED')
})

test('project-independent outreach keeps working without accessing a project link', async () => {
  const candidate = record('SAVED')
  let projectLookup = false
  const deps = dependencies(candidate)
  deps.value.JobCandidate.findOne = async () => { projectLookup = true }
  const result = await createCandidateActivity(candidate.id, { type: 'EMAIL_SENT', channel: 'email', metadata: {} }, deps.value)
  assert.equal(projectLookup, false)
  assert.equal(candidate.status, 'CONTACTED')
  assert.equal(result.activity.jobId, null)
})

test('outreach moves early statuses to contacted without downgrading later statuses', () => {
  assert.equal(
    shouldUpdateCandidateToContacted('SAVED', 'EMAIL_SENT'),
    true,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('SHORTLISTED', 'LINKEDIN_MESSAGE_SENT'),
    true,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('RESPONDED', 'LINKEDIN_CONNECT_SENT'),
    false,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('INTERVIEW', 'EMAIL_SENT'),
    false,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('HIRED', 'EMAIL_SENT'),
    false,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('REJECTED', 'EMAIL_SENT'),
    false,
  )
  assert.equal(
    shouldUpdateCandidateToContacted('SAVED', 'NOTE'),
    false,
  )
})

test('interview invitation advances candidates except hired candidates', () => {
  assert.equal(
    shouldUpdateCandidateToInterview('SAVED', 'INTERVIEW_INVITED'),
    true,
  )
  assert.equal(
    shouldUpdateCandidateToInterview('RESPONDED', 'INTERVIEW_INVITED'),
    true,
  )
  assert.equal(
    shouldUpdateCandidateToInterview('HIRED', 'INTERVIEW_INVITED'),
    false,
  )
  assert.equal(
    shouldUpdateCandidateToInterview('SAVED', 'EMAIL_SENT'),
    false,
  )
})
