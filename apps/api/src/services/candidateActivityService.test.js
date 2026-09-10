import assert from 'node:assert/strict'
import test from 'node:test'
import Candidate from '../models/Candidate.js'
import CandidateActivity, {
  candidateActivityTypes,
} from '../models/CandidateActivity.js'
import {
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
