import { z } from 'zod'

export const candidateEvidenceFieldSchema = z.enum([
  'title',
  'skills',
  'experience',
  'location',
])

export const candidateEvidenceCoverageSchema = z
  .object({
    percentage: z.number().min(0).max(100),
    availableFields: z.array(candidateEvidenceFieldSchema),
    unknownFields: z.array(candidateEvidenceFieldSchema),
    sufficientForScoring: z.boolean(),
  })
  .strict()

const nullableScoreSchema = z.number().min(0).max(100).nullable()

export const candidateMatchAnalysisSchema = z
  .object({
    overallScore: nullableScoreSchema,
    requiredSkillsScore: nullableScoreSchema,
    preferredSkillsScore: nullableScoreSchema,
    experienceScore: nullableScoreSchema,
    roleScore: nullableScoreSchema,
    matchedSkills: z.array(z.string()),
    missingSkills: z.array(z.string()),
    strengths: z.array(z.string()),
    concerns: z.array(z.string()),
    summary: z.string(),
    evidenceCoverage: candidateEvidenceCoverageSchema,
  })
  .strict()

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const EXPERIENCE_CLAIM_PATTERN = /\b(?:experience|experienced|years?)\b/i
const EXPERIENCE_REQUIREMENT_CLAIM_PATTERN =
  /\b(?:meets?|satisf(?:y|ies|ied)|fulfills?|exceeds?)\b[^.!?]{0,80}\b(?:experience|years?)\b|\b(?:experience|years?)\b[^.!?]{0,80}\b(?:requirement|minimum|meets?|satisf(?:y|ies|ied)|fulfills?|exceeds?)\b/i
const SPECIFIC_YEARS_PATTERN =
  /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\+)?\s+years?\b/i

function removeUnsupportedExperienceSentences(value) {
  if (!hasText(value)) return ''

  return value
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        !SPECIFIC_YEARS_PATTERN.test(sentence) &&
        !EXPERIENCE_REQUIREMENT_CLAIM_PATTERN.test(sentence),
    )
    .join(' ')
    .trim()
}

export function getCandidateEvidenceCoverage(job, candidate) {
  const fields = {
    title: hasText(candidate.currentTitle),
    skills: Array.isArray(candidate.skills) && candidate.skills.length > 0,
    experience: Number.isFinite(candidate.yearsOfExperience),
    location: hasText(candidate.location),
  }
  const relevantFields = [
    ...(hasText(job.role) ? ['title'] : []),
    ...(job.requiredSkills?.length > 0 || job.preferredSkills?.length > 0
      ? ['skills']
      : []),
    ...(job.minExperience !== undefined || job.maxExperience !== undefined
      ? ['experience']
      : []),
    ...(hasText(job.location) ? ['location'] : []),
  ]
  const availableFields = relevantFields.filter((field) => fields[field])
  const unknownFields = relevantFields.filter((field) => !fields[field])
  const percentage = relevantFields.length === 0
    ? 0
    : Math.round((availableFields.length / relevantFields.length) * 100)
  const sufficientForScoring =
    (relevantFields.length === 1 &&
      relevantFields[0] !== 'skills' &&
      availableFields.length === 1) ||
    (relevantFields.length >= 2 &&
      availableFields.length >= 2 &&
      percentage >= 50)

  return {
    percentage,
    availableFields,
    unknownFields,
    sufficientForScoring,
  }
}

export function applyCandidateEvidenceRules(job, candidate, analysis) {
  const evidenceCoverage = getCandidateEvidenceCoverage(job, candidate)
  const unknownFieldPatterns = {
    title: /\b(?:title|role)\b/i,
    skills: /\bskills?\b/i,
    experience: /\b(?:experience|years?)\b/i,
    location: /\b(?:location|located|region|country|city)\b/i,
  }
  const referencesUnknownEvidence = (statement) =>
    evidenceCoverage.unknownFields.some((field) =>
      unknownFieldPatterns[field].test(statement),
    )
  const result = {
    ...analysis,
    evidenceCoverage,
    strengths: analysis.strengths.filter(
      (strength) => !referencesUnknownEvidence(strength),
    ),
    concerns: analysis.concerns.filter(
      (concern) => !referencesUnknownEvidence(concern),
    ),
  }

  if (evidenceCoverage.unknownFields.includes('title')) {
    result.roleScore = null
  }

  if (evidenceCoverage.unknownFields.includes('skills')) {
    result.requiredSkillsScore = null
    result.preferredSkillsScore = null
    result.matchedSkills = []
    result.missingSkills = []
  }

  if (evidenceCoverage.unknownFields.includes('experience')) {
    result.experienceScore = null
    result.strengths = result.strengths.filter(
      (strength) => !EXPERIENCE_CLAIM_PATTERN.test(strength),
    )
    result.concerns = result.concerns.filter(
      (concern) => !EXPERIENCE_CLAIM_PATTERN.test(concern),
    )
    result.summary = removeUnsupportedExperienceSentences(result.summary)
    result.concerns.push(
      'Professional experience is unverified because reliable duration evidence is unavailable.',
    )
  }

  if (!evidenceCoverage.sufficientForScoring) {
    result.overallScore = null
    result.summary = `Insufficient information to calculate a meaningful match score. Evidence coverage is ${evidenceCoverage.percentage}%.`
  }

  if (
    result.overallScore !== null &&
    evidenceCoverage.unknownFields.length > 0
  ) {
    const caveat = `This is a provisional match assessment based on ${evidenceCoverage.percentage}% evidence coverage; unknown qualifications were not scored as confirmed matches or mismatches.`
    result.summary = hasText(result.summary)
      ? `${result.summary} ${caveat}`
      : caveat
  }

  if (evidenceCoverage.unknownFields.length > 0) {
    result.concerns.push(
      `Information unavailable for: ${evidenceCoverage.unknownFields.join(', ')}.`,
    )
  }

  return candidateMatchAnalysisSchema.parse(result)
}
