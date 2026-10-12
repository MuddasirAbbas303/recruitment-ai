import assert from 'node:assert/strict'
import test from 'node:test'
import { getProjectAnalysisLabel, moveProjectCandidateLocally, projectToForm, projectToPayload } from './recruitmentProjects.js'

test('prepopulates sourcing fields from project requirements without mutating them', () => {
  const project = { title: 'Backend Engineer', description: 'Build APIs', requiredSkills: ['Node.js'], preferredSkills: ['AWS'], minimumExperience: 4, maximumExperience: null, location: 'Riga', keywords: [], excludeKeywords: [], status: 'ACTIVE' }
  const form = projectToForm(project)
  form.requiredSkills = 'Node.js, PostgreSQL'
  assert.deepEqual(project.requiredSkills, ['Node.js'])
  assert.equal(projectToPayload(form).minimumExperience, 4)
})

test('optimistically moves one card while retaining an untouched rollback snapshot', () => {
  const previous = [{ id: 'one', projectStatus: 'SOURCED' }, { id: 'two', projectStatus: 'INTERVIEW' }]
  const moved = moveProjectCandidateLocally(previous, 'one', 'CONTACTED')
  assert.equal(moved[0].projectStatus, 'CONTACTED')
  assert.equal(previous[0].projectStatus, 'SOURCED')
  assert.equal(moved[1], previous[1])
})

test('uses distinct analyze and re-analyze loading labels', () => {
  assert.equal(getProjectAnalysisLabel(false, false), 'Analyze for project')
  assert.equal(getProjectAnalysisLabel(false, true), 'Analyzing...')
  assert.equal(getProjectAnalysisLabel(true, false), 'Re-analyze')
  assert.equal(getProjectAnalysisLabel(true, true), 'Re-analyzing...')
})
