import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignCandidatesToProjects,
  createProject,
  moveProjectCandidate,
  projectToSearchCriteria,
  updateProject,
} from './recruitmentProjectService.js'

const projectInput = {
  title: 'Backend Engineer', description: 'Build reliable services.',
  requiredSkills: ['Node.js'], preferredSkills: ['AWS'],
  minimumExperience: 3, maximumExperience: 8, location: 'Riga',
  keywords: ['platform'], excludeKeywords: [], status: 'ACTIVE',
}

test('creates and edits a recruitment project with validated requirements', async () => {
  let created
  const Job = {
    create: async (value) => { created = value; return { id: 'project-1', ...value } },
    findByPk: async () => ({ update: async (value) => ({ ...value }) }),
  }
  const project = await createProject(projectInput, { Job })
  assert.equal(project.title, 'Backend Engineer')
  assert.deepEqual(created.requiredSkills, ['Node.js'])
  await updateProject('project-1', { ...projectInput, status: 'CLOSED' }, { Job })
})

test('maps exact project requirements to sourcing criteria', () => {
  const criteria = projectToSearchCriteria(projectInput)
  assert.equal(criteria.role, projectInput.title)
  assert.deepEqual(criteria.requiredSkills, ['Node.js'])
  assert.equal(criteria.minExperience, 3)
})

test('assigns one candidate to multiple projects without resetting existing links', async () => {
  const calls = []
  const Job = { findAll: async () => [{ id: '11111111-1111-4111-8111-111111111111' }, { id: '22222222-2222-4222-8222-222222222222' }] }
  const JobCandidate = { findOrCreate: async (options) => { calls.push(options); return [{ status: 'INTERVIEW' }, false] } }
  const result = await assignCandidatesToProjects({
    projectIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    candidateIds: ['33333333-3333-4333-8333-333333333333'],
    candidateMatches: {
      '33333333-3333-4333-8333-333333333333': {
        originatingProjectId: '11111111-1111-4111-8111-111111111111', matchScore: 91, matchAnalysis: { summary: 'Project one' },
      },
    },
    candidates: [],
  }, { Job, JobCandidate })
  assert.equal(result.links.length, 2)
  assert.equal(calls[0].defaults.matchScore, 91)
  assert.equal(calls[1].defaults.matchScore, undefined)
  assert.equal(calls[0].defaults.status, 'SOURCED')
})

test('bulk assignment deduplicates unsaved candidates through the existing save service', async () => {
  let saves = 0
  const Job = { findAll: async () => [{ id: '11111111-1111-4111-8111-111111111111' }] }
  const JobCandidate = { findOrCreate: async (options) => [options.defaults, true] }
  await assignCandidatesToProjects({
    projectIds: ['11111111-1111-4111-8111-111111111111'], candidateIds: [], candidateMatches: {},
    candidates: [{ candidate: { fullName: 'Alex', matchScore: 80 }, originatingProjectId: '11111111-1111-4111-8111-111111111111' }],
  }, { Job, JobCandidate, saveCandidate: async () => { saves += 1; return { candidate: { id: '33333333-3333-4333-8333-333333333333' }, duplicateDetected: true } } })
  assert.equal(saves, 1)
})

test('moves only the requested project relationship and preserves global status', async () => {
  const candidate = { status: 'RESPONDED' }
  const firstLink = { status: 'SOURCED', update: async (value) => { firstLink.status = value.status } }
  const JobCandidate = { findOne: async ({ where }) => where.jobId === 'project-one' ? firstLink : null }
  await moveProjectCandidate('project-one', 'link-one', 'HIRED', { JobCandidate })
  assert.equal(firstLink.status, 'HIRED')
  assert.equal(candidate.status, 'RESPONDED')
})
