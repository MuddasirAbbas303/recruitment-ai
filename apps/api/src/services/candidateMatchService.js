import { z } from 'zod'
import {
  analyzeCandidate as analyzeCandidateWithAI,
  isMockAIEnabled,
} from './ai/aiService.js'
import { candidateMatchAnalysisSchema } from './groqService.js'

const jobMatchSchema = z.object({
  role: z.string().trim().default(''),
  requiredSkills: z.array(z.string().trim().min(1)).default([]),
  preferredSkills: z.array(z.string().trim().min(1)).default([]),
  minExperience: z.number().finite().nonnegative().optional(),
  maxExperience: z.number().finite().nonnegative().optional(),
  location: z.string().trim().default(''),
  keywords: z.array(z.string().trim().min(1)).default([]),
  excludeKeywords: z.array(z.string().trim().min(1)).default([]),
})

const candidateMatchInputSchema = z.object({
  fullName: z.string().trim().min(1),
  currentTitle: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  currentCompany: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  location: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  yearsOfExperience: z.number().finite().nonnegative().nullable().default(null),
  skills: z.array(z.string().trim().min(1)).default([]),
  summary: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
})

export function isMockCandidateMatchingEnabled() {
  return isMockAIEnabled()
}

export async function analyzeCandidate(job, candidate) {
  const validatedJob = jobMatchSchema.parse(job)
  const validatedCandidate = candidateMatchInputSchema.parse(candidate)
  const analysis = await analyzeCandidateWithAI(
    validatedJob,
    validatedCandidate,
  )

  return candidateMatchAnalysisSchema.parse(analysis)
}
