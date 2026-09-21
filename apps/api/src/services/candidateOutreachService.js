import { z } from 'zod'
import {
  candidateOutreachSchema,
  linkedinOutreachSchema,
} from './groqService.js'
import {
  generateEmailOutreach as generateEmailOutreachWithAI,
  generateLinkedInOutreach as generateLinkedInOutreachWithAI,
} from './ai/aiService.js'

export const LINKEDIN_CONNECTION_MAX_LENGTH = 250
export const outreachTypeSchema = z.enum([
  'email',
  'linkedin-message',
  'linkedin-connect',
])

const optionalText = (maximum) =>
  z.string().trim().max(maximum).nullable().optional()
const professionalSkillsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100)
  .default([])

export const candidateOutreachRequestSchema = z
  .object({
    type: z.literal('email').default('email'),
    candidate: z
      .object({
        fullName: z.string().trim().min(1).max(255),
        currentTitle: optionalText(255),
        currentCompany: optionalText(255),
        location: optionalText(255),
        email: z.string().trim().email().max(320).nullable().optional(),
        skills: professionalSkillsSchema,
        summary: optionalText(5_000),
        matchScore: z.number().min(0).max(100).nullable().optional(),
        matchAnalysis: z.unknown().nullable().optional(),
      })
      .strict(),
    job: z
      .object({
        role: z.string().trim().max(255).default(''),
        requiredSkills: professionalSkillsSchema,
        preferredSkills: professionalSkillsSchema,
        location: z.string().trim().max(255).default(''),
        description: z.string().trim().max(10_000).default(''),
      })
      .strict(),
  })
  .strict()

export const linkedinOutreachRequestSchema = z
  .object({
    type: z.enum(['linkedin-message', 'linkedin-connect']),
    candidate: z
      .object({
        fullName: z.string().trim().min(1).max(255),
        currentTitle: optionalText(255),
        currentCompany: optionalText(255),
        location: optionalText(255),
        linkedinUrl: z.string().trim().url().max(2_048),
        skills: professionalSkillsSchema,
        summary: optionalText(5_000),
        matchAnalysis: z.unknown().nullable().optional(),
      })
      .strict(),
    job: z
      .object({
        role: z.string().trim().max(255).default(''),
        requiredSkills: professionalSkillsSchema,
        preferredSkills: professionalSkillsSchema,
        location: z.string().trim().max(255).default(''),
        description: z.string().trim().max(10_000).default(''),
      })
      .strict(),
  })
  .strict()

export class CandidateOutreachValidationError extends Error {
  constructor(details) {
    super('Invalid outreach request.')
    this.details = details
  }
}

export class CandidateOutreachGenerationError extends Error {
  constructor(message = 'Unable to generate outreach.') {
    super(message)
  }
}

function cleanOptionalText(value) {
  return value || null
}

function toProfessionalProviderInput(candidate, job) {
  return {
    candidate: {
      fullName: candidate.fullName,
      currentTitle: cleanOptionalText(candidate.currentTitle),
      currentCompany: cleanOptionalText(candidate.currentCompany),
      location: cleanOptionalText(candidate.location),
      skills: candidate.skills,
      summary: cleanOptionalText(candidate.summary),
    },
    job: {
      role: job.role,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      location: job.location,
      description: job.description,
    },
  }
}

function containsInternalScoringLanguage(outreach) {
  const text = Object.values(outreach).join('\n')

  return (
    /\b(?:ai|match|candidate)\s+score\b/i.test(text) ||
    /\b(?:scored|ranked|ranking)\b/i.test(text) ||
    /\b(?:strong|good|potential|low)\s+match\b/i.test(text) ||
    /\b\d{1,3}\s*%\b/.test(text)
  )
}

function getValidationDetails(validationError) {
  return validationError.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

export async function generateCandidateOutreach(
  input,
  dependencies = {},
) {
  const validation = candidateOutreachRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateOutreachValidationError(
      getValidationDetails(validation.error),
    )
  }

  const { candidate, job } = toProfessionalProviderInput(
    validation.data.candidate,
    validation.data.job,
  )
  const generator =
    dependencies.generator ?? generateEmailOutreachWithAI
  const generatedOutreach = await generator(candidate, job)
  const outputValidation = candidateOutreachSchema.safeParse(generatedOutreach)

  if (
    !outputValidation.success ||
    containsInternalScoringLanguage(outputValidation.data)
  ) {
    throw new CandidateOutreachGenerationError()
  }

  return outputValidation.data
}

export async function generateLinkedInOutreach(
  input,
  dependencies = {},
) {
  const validation = linkedinOutreachRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateOutreachValidationError(
      getValidationDetails(validation.error),
    )
  }

  const { type } = validation.data
  const { candidate, job } = toProfessionalProviderInput(
    validation.data.candidate,
    validation.data.job,
  )
  const generatedOutreach = dependencies.generator
    ? await dependencies.generator(type, candidate, job)
    : await generateLinkedInOutreachWithAI(candidate, job, type)
  const outputValidation = linkedinOutreachSchema.safeParse(generatedOutreach)

  if (
    !outputValidation.success ||
    containsInternalScoringLanguage(outputValidation.data) ||
    (type === 'linkedin-connect' &&
      outputValidation.data.message.length > LINKEDIN_CONNECTION_MAX_LENGTH)
  ) {
    throw new CandidateOutreachGenerationError(
      'Unable to generate LinkedIn outreach.',
    )
  }

  return outputValidation.data
}
