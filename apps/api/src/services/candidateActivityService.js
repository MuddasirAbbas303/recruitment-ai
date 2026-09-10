import { z } from 'zod'
import database from '../config/database.js'
import Candidate from '../models/Candidate.js'
import CandidateActivity, {
  candidateActivityTypes,
} from '../models/CandidateActivity.js'
import {
  CandidateNotFoundError,
  CandidateValidationError,
} from './candidateService.js'
import {
  interviewDetailsSchema,
  zonedDateTimeToUtc,
} from './candidateInterviewService.js'

const outreachActivityTypes = new Set([
  'EMAIL_SENT',
  'LINKEDIN_MESSAGE_SENT',
  'LINKEDIN_CONNECT_SENT',
])
const statusesThatMustNotBecomeContacted = new Set([
  'CONTACTED',
  'RESPONDED',
  'INTERVIEW',
  'REJECTED',
  'HIRED',
])
const candidateIdSchema = z.string().uuid()
const activityInputSchema = z
  .object({
    type: z.enum(candidateActivityTypes),
    channel: z.string().trim().min(1).max(50).nullable().optional(),
    message: z.string().trim().max(50_000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
const interviewActivityMetadataSchema = z
  .object({
    interviewTitle: interviewDetailsSchema.shape.title,
    date: interviewDetailsSchema.shape.date,
    time: interviewDetailsSchema.shape.time,
    timezone: interviewDetailsSchema.shape.timezone,
    durationMinutes: interviewDetailsSchema.shape.durationMinutes,
    meetingType: interviewDetailsSchema.shape.meetingType,
    meetingLocation: interviewDetailsSchema.shape.meetingLocation,
  })
  .strict()

function validationDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

function validateCandidateId(candidateId) {
  const validation = candidateIdSchema.safeParse(candidateId)

  if (!validation.success) {
    throw new CandidateValidationError('Invalid candidate ID.')
  }

  return validation.data
}

function validateActivityInput(input, now) {
  const validation = activityInputSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate activity.',
      validationDetails(validation.error),
    )
  }

  const metadataBytes = Buffer.byteLength(
    JSON.stringify(validation.data.metadata),
    'utf8',
  )

  if (metadataBytes > 20_000) {
    throw new CandidateValidationError('Invalid candidate activity.', [
      { path: 'metadata', message: 'Metadata is too large.' },
    ])
  }

  if (validation.data.type === 'INTERVIEW_INVITED') {
    const interviewValidation = interviewActivityMetadataSchema.safeParse(
      validation.data.metadata,
    )

    if (!interviewValidation.success) {
      throw new CandidateValidationError(
        'Invalid candidate activity.',
        getValidationDetails(interviewValidation.error, 'metadata'),
      )
    }

    let startsAt

    try {
      startsAt = zonedDateTimeToUtc(
        interviewValidation.data.date,
        interviewValidation.data.time,
        interviewValidation.data.timezone,
      )
    } catch {
      throw new CandidateValidationError('Invalid candidate activity.', [
        {
          path: 'metadata.timezone',
          message: 'Date, time, or timezone is invalid.',
        },
      ])
    }

    if (startsAt.getTime() <= now.getTime()) {
      throw new CandidateValidationError('Invalid candidate activity.', [
        {
          path: 'metadata.date',
          message: 'Interview time must be in the future.',
        },
      ])
    }

    validation.data.metadata = interviewValidation.data
  }

  return validation.data
}

function getValidationDetails(error, prefix) {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path].filter(Boolean).join('.'),
    message: issue.message,
  }))
}

export function shouldUpdateCandidateToContacted(status, activityType) {
  return (
    outreachActivityTypes.has(activityType) &&
    !statusesThatMustNotBecomeContacted.has(status)
  )
}

export function shouldUpdateCandidateToInterview(status, activityType) {
  return activityType === 'INTERVIEW_INVITED' && status !== 'HIRED'
}

export async function listCandidateActivities(candidateId) {
  const validatedId = validateCandidateId(candidateId)
  const candidate = await Candidate.findByPk(validatedId, {
    attributes: ['id'],
  })

  if (!candidate) {
    throw new CandidateNotFoundError('Candidate not found.')
  }

  return CandidateActivity.findAll({
    where: { candidateId: validatedId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
  })
}

export async function createCandidateActivity(
  candidateId,
  input,
  dependencies = {},
) {
  const validatedId = validateCandidateId(candidateId)
  const validatedActivity = validateActivityInput(
    input,
    dependencies.now ?? new Date(),
  )

  return database.transaction(async (transaction) => {
    const candidate = await Candidate.findByPk(validatedId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    })

    if (!candidate) {
      throw new CandidateNotFoundError('Candidate not found.')
    }

    if (validatedActivity.type === 'INTERVIEW_INVITED' && !candidate.email) {
      throw new CandidateValidationError(
        'Candidate email is required for an interview invitation.',
      )
    }

    const activity = await CandidateActivity.create(
      {
        candidateId: candidate.id,
        ...validatedActivity,
      },
      { transaction },
    )

    if (shouldUpdateCandidateToContacted(candidate.status, activity.type)) {
      await candidate.update({ status: 'CONTACTED' }, { transaction })
    } else if (
      shouldUpdateCandidateToInterview(candidate.status, activity.type)
    ) {
      await candidate.update({ status: 'INTERVIEW' }, { transaction })
    }

    return { activity, candidate }
  })
}
