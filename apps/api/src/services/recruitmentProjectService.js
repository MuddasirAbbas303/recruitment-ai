import { z } from 'zod'
import Candidate from '../models/Candidate.js'
import CandidateActivity from '../models/CandidateActivity.js'
import Job from '../models/Job.js'
import JobCandidate, { projectStages } from '../models/JobCandidate.js'
import { saveCandidate } from './candidateService.js'
import { analyzeCandidateResults } from './candidateSearchService.js'

export class RecruitmentProjectValidationError extends Error {}
export class RecruitmentProjectNotFoundError extends Error {}

const stringList = z.array(z.string().trim().min(1).max(255)).max(100).default([])
const projectSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(20_000),
  requiredSkills: stringList,
  preferredSkills: stringList,
  minimumExperience: z.number().finite().nonnegative().nullable().default(null),
  maximumExperience: z.number().finite().nonnegative().nullable().default(null),
  location: z.string().trim().max(255).nullable().default(null),
  keywords: stringList,
  excludeKeywords: stringList,
  status: z.enum(['ACTIVE', 'CLOSED']).default('ACTIVE'),
}).strict().refine(
  (project) => project.maximumExperience === null || project.minimumExperience === null || project.maximumExperience >= project.minimumExperience,
  { message: 'Maximum experience must be greater than or equal to minimum experience.' },
)

const assignmentSchema = z.object({
  projectIds: z.array(z.string().uuid()).min(1).max(50),
  candidateIds: z.array(z.string().uuid()).max(100).default([]),
  candidateMatches: z.record(z.string(), z.object({
    originatingProjectId: z.string().uuid().nullable(),
    matchScore: z.number().finite().nullable(),
    matchAnalysis: z.unknown().nullable(),
  }).strict()).default({}),
  candidates: z.array(z.object({ candidate: z.record(z.string(), z.unknown()), originatingProjectId: z.string().uuid().nullable().optional() }).strict()).max(100).default([]),
}).strict().refine((value) => value.candidateIds.length + value.candidates.length > 0, {
  message: 'At least one candidate is required.',
})

function parse(schema, input, message) {
  const result = schema.safeParse(input)
  if (!result.success) throw new RecruitmentProjectValidationError(message)
  return result.data
}

function toCriteria(job) {
  return {
    role: job.title,
    requiredSkills: job.requiredSkills ?? [],
    preferredSkills: job.preferredSkills ?? [],
    ...(job.minimumExperience !== null && { minExperience: job.minimumExperience }),
    ...(job.maximumExperience !== null && { maxExperience: job.maximumExperience }),
    location: job.location ?? '',
    keywords: job.keywords ?? [],
    excludeKeywords: job.excludeKeywords ?? [],
    source: 'database',
  }
}

export async function createProject(input, models = { Job }) {
  return models.Job.create(parse(projectSchema, input, 'Invalid recruitment project.'))
}

export async function listProjects({ activeOnly = false } = {}, models = { Job }) {
  return models.Job.findAll({
    ...(activeOnly && { where: { status: 'ACTIVE' } }),
    order: [['createdAt', 'DESC']],
  })
}

export async function updateProject(id, input, models = { Job }) {
  const project = await models.Job.findByPk(id)
  if (!project) throw new RecruitmentProjectNotFoundError('Recruitment project not found.')
  await project.update(parse(projectSchema, input, 'Invalid recruitment project.'))
  return project
}

export async function getProjectBoard(id, models = { Job, JobCandidate, Candidate, CandidateActivity }) {
  const project = await models.Job.findByPk(id)
  if (!project) throw new RecruitmentProjectNotFoundError('Recruitment project not found.')
  const links = await models.JobCandidate.findAll({
    where: { jobId: id },
    include: [{
      model: models.Candidate,
      as: 'candidate',
      include: [{ model: models.CandidateActivity, as: 'activities', attributes: ['createdAt'], required: false }],
    }],
    order: [['createdAt', 'ASC']],
  })
  return {
    project,
    candidates: links.map((link) => ({
      id: link.id,
      projectStatus: link.status,
      matchScore: link.matchScore,
      matchAnalysis: link.matchAnalysis,
      candidate: link.candidate,
      lastActivityAt: (link.candidate?.activities ?? []).reduce(
        (latest, activity) => !latest || activity.createdAt > latest ? activity.createdAt : latest,
        null,
      ),
    })),
  }
}

export async function assignCandidatesToProjects(input, dependencies = {}) {
  const value = parse(assignmentSchema, input, 'Invalid project assignment.')
  const JobModel = dependencies.Job ?? Job
  const JobCandidateModel = dependencies.JobCandidate ?? JobCandidate
  const save = dependencies.saveCandidate ?? saveCandidate
  const projects = await JobModel.findAll({ where: { id: value.projectIds, status: 'ACTIVE' } })
  if (projects.length !== value.projectIds.length) {
    throw new RecruitmentProjectValidationError('Select active recruitment projects only.')
  }
  const savedCandidates = []
  for (const candidateId of value.candidateIds) {
    savedCandidates.push({ id: candidateId, originalId: candidateId, ...(value.candidateMatches[candidateId] ?? {}) })
  }
  for (const item of value.candidates) {
    const saved = await save(item.candidate)
    if (saved.possibleDuplicate) throw new RecruitmentProjectValidationError('A possible duplicate candidate requires recruiter review.')
    savedCandidates.push({
      id: saved.candidate.id,
      originalId: item.candidate.id,
      originatingProjectId: item.originatingProjectId ?? null,
      matchScore: item.candidate.matchScore,
      matchAnalysis: item.candidate.matchAnalysis,
    })
  }
  const links = []
  for (const projectId of value.projectIds) {
    for (const candidate of savedCandidates) {
      const [link, created] = await JobCandidateModel.findOrCreate({
        where: { jobId: projectId, candidateId: candidate.id },
        defaults: {
          status: 'SOURCED',
          ...(candidate.originatingProjectId === projectId && Number.isFinite(candidate.matchScore) && {
            matchScore: candidate.matchScore,
            matchAnalysis: candidate.matchAnalysis ?? null,
          }),
        },
      })
      links.push({ link, created })
    }
  }
  return { links, projectIds: value.projectIds, savedCandidates }
}

export async function moveProjectCandidate(projectId, linkId, status, models = { JobCandidate }) {
  if (!projectStages.includes(status)) throw new RecruitmentProjectValidationError('Invalid recruitment stage.')
  const link = await models.JobCandidate.findOne({ where: { id: linkId, jobId: projectId } })
  if (!link) throw new RecruitmentProjectNotFoundError('Project candidate not found.')
  await link.update({ status })
  return link
}

export async function analyzeProjectCandidate(projectId, linkId, dependencies = {}) {
  const JobModel = dependencies.Job ?? Job
  const JobCandidateModel = dependencies.JobCandidate ?? JobCandidate
  const analyzer = dependencies.analyzeCandidateResults ?? analyzeCandidateResults
  const project = await JobModel.findByPk(projectId)
  const link = await JobCandidateModel.findOne({ where: { id: linkId, jobId: projectId }, include: [{ model: Candidate, as: 'candidate' }] })
  if (!project || !link) throw new RecruitmentProjectNotFoundError('Project candidate not found.')
  const [analyzed] = await analyzer([link.candidate.toJSON?.() ?? link.candidate], toCriteria(project))
  await link.update({ matchScore: analyzed.matchScore, matchAnalysis: analyzed.matchAnalysis })
  return link
}

export { projectStages, toCriteria as projectToSearchCriteria }
