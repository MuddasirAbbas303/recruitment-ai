import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { generateInterviewInvitation as generateInterviewInvitationWithAI } from './ai/aiService.js'
import { interviewInvitationSchema } from './groqService.js'

const optionalText = (maximum) =>
  z.string().trim().max(maximum).nullable().optional()

export const interviewDetailsSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().trim().min(1).max(100),
    durationMinutes: z.union([
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(90),
    ]),
    meetingType: z.enum(['Video Call', 'Phone', 'On-site']),
    meetingLocation: optionalText(2_000),
    notes: optionalText(10_000),
  })
  .strict()

const candidateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255),
    email: z.string().trim().email().max(320),
    currentTitle: optionalText(255),
  })
  .strict()

const jobSchema = z
  .object({
    role: z.string().trim().max(255).default(''),
    requiredSkills: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .default([]),
    preferredSkills: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .default([]),
    location: z.string().trim().max(255).default(''),
    description: z.string().trim().max(10_000).default(''),
  })
  .strict()

const invitationRequestSchema = z
  .object({
    candidate: candidateSchema,
    interview: interviewDetailsSchema,
    job: jobSchema.optional(),
  })
  .strict()

const calendarRequestSchema = z
  .object({
    candidate: candidateSchema,
    interview: interviewDetailsSchema,
    description: z.string().trim().max(10_000).optional(),
  })
  .strict()

export class InterviewInvitationValidationError extends Error {
  constructor(details = []) {
    super('Invalid interview invitation.')
    this.details = details
  }
}

export class InterviewInvitationGenerationError extends Error {
  constructor() {
    super('Unable to generate interview invitation.')
  }
}

function getValidationDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

function getTimeZoneParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function getTimeZoneOffsetMs(date, timezone) {
  const parts = getTimeZoneParts(date, timezone)
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - date.getTime()
  )
}

export function zonedDateTimeToUtc(dateValue, timeValue, timezone) {
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  const wallTimeUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  const initialOffset = getTimeZoneOffsetMs(new Date(wallTimeUtc), timezone)
  let result = new Date(wallTimeUtc - initialOffset)
  const adjustedOffset = getTimeZoneOffsetMs(result, timezone)

  if (adjustedOffset !== initialOffset) {
    result = new Date(wallTimeUtc - adjustedOffset)
  }

  const resultParts = getTimeZoneParts(result, timezone)
  const matchesRequestedWallTime =
    resultParts.year === year &&
    resultParts.month === month &&
    resultParts.day === day &&
    resultParts.hour === hour &&
    resultParts.minute === minute

  if (!matchesRequestedWallTime) {
    throw new RangeError('The interview time is invalid in this timezone.')
  }

  return result
}

function validateAndNormalizeRequest(schema, input, now) {
  const validation = schema.safeParse(input)

  if (!validation.success) {
    throw new InterviewInvitationValidationError(
      getValidationDetails(validation.error),
    )
  }

  let startsAt

  try {
    startsAt = zonedDateTimeToUtc(
      validation.data.interview.date,
      validation.data.interview.time,
      validation.data.interview.timezone,
    )
  } catch {
    throw new InterviewInvitationValidationError([
      {
        path: 'interview.timezone',
        message: 'Date, time, or timezone is invalid.',
      },
    ])
  }

  if (startsAt.getTime() <= now.getTime()) {
    throw new InterviewInvitationValidationError([
      {
        path: 'interview.date',
        message: 'Interview time must be in the future.',
      },
    ])
  }

  return {
    ...validation.data,
    interview: {
      ...validation.data.interview,
      meetingLocation: validation.data.interview.meetingLocation || null,
      notes: validation.data.interview.notes || null,
    },
    startsAt,
  }
}

export function validateInterviewInvitation(input, now = new Date()) {
  return validateAndNormalizeRequest(invitationRequestSchema, input, now)
}

function containsDisallowedLanguage(invitation) {
  const text = `${invitation.subject}\n${invitation.body}`

  return (
    /\b(?:ai|match|candidate)\s+score\b/i.test(text) ||
    /\b(?:scored|ranked|ranking)\b/i.test(text) ||
    /\b(?:strong|good|potential|low)\s+match\b/i.test(text) ||
    /\b\d{1,3}\s*%\b/.test(text)
  )
}

export async function generateInterviewInvitation(input, dependencies = {}) {
  const validated = validateInterviewInvitation(
    input,
    dependencies.now ?? new Date(),
  )
  const providerCandidate = {
    fullName: validated.candidate.fullName,
    currentTitle: validated.candidate.currentTitle || null,
  }
  const generator =
    dependencies.generator ?? generateInterviewInvitationWithAI
  const generated = await generator(
    providerCandidate,
    validated.interview,
    validated.job ?? null,
  )
  const outputValidation = interviewInvitationSchema.safeParse(generated)

  if (
    !outputValidation.success ||
    containsDisallowedLanguage(outputValidation.data)
  ) {
    throw new InterviewInvitationGenerationError()
  }

  return outputValidation.data
}

function formatIcsTimestamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldIcsLine(line) {
  const folded = []
  let remaining = line
  let maximumBytes = 75

  while (Buffer.byteLength(remaining, 'utf8') > maximumBytes) {
    let segment = ''

    for (const character of remaining) {
      if (Buffer.byteLength(segment + character, 'utf8') > maximumBytes) {
        break
      }

      segment += character
    }

    folded.push(segment)
    remaining = remaining.slice(segment.length)
    maximumBytes = 74
  }

  folded.push(remaining)
  return folded.join('\r\n ')
}

export function generateInterviewCalendar(
  input,
  dependencies = {},
) {
  const now = dependencies.now ?? new Date()
  const validated = validateAndNormalizeRequest(
    calendarRequestSchema,
    input,
    now,
  )
  const endsAt = new Date(
    validated.startsAt.getTime() +
      validated.interview.durationMinutes * 60_000,
  )
  const description =
    validated.description ||
    validated.interview.notes ||
    `Interview invitation for ${validated.candidate.fullName}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Recruitment AI//Interview Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${dependencies.uid ?? `${randomUUID()}@recruitment-ai.local`}`,
    `DTSTAMP:${formatIcsTimestamp(now)}`,
    `DTSTART:${formatIcsTimestamp(validated.startsAt)}`,
    `DTEND:${formatIcsTimestamp(endsAt)}`,
    `SUMMARY:${escapeIcsText(validated.interview.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(validated.interview.meetingLocation
      ? [
          `LOCATION:${escapeIcsText(validated.interview.meetingLocation)}`,
        ]
      : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return Buffer.from(
    `${lines.map(foldIcsLine).join('\r\n')}\r\n`,
    'utf8',
  )
}

export function getInterviewCalendarFilename(candidate, interview) {
  const candidateName = candidate.fullName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'candidate'

  return `interview-${candidateName}-${interview.date}.ics`
}
