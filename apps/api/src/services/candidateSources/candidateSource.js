import { z } from 'zod'

export class CandidateSourceConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CandidateSourceConfigurationError'
  }
}

export class CandidateSourceRequestError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'CandidateSourceRequestError'
    this.statusCode = statusCode
  }
}

const candidateSourceResultSchema = z
  .object({
    externalId: z.string().trim().min(1),
    fullName: z.string().trim().min(1),
    currentTitle: z.string().trim().nullable(),
    currentCompany: z.string().trim().nullable(),
    location: z.string().trim().nullable(),
    linkedinUrl: z.string().trim().nullable(),
    email: z.string().trim().nullable(),
    yearsOfExperience: z.number().finite().nonnegative().nullable(),
    skills: z.array(z.string().trim().min(1)),
    summary: z.string().trim().nullable(),
    source: z.string().trim().min(1),
  })
  .passthrough()

export function normalizeCandidateSourceResult(candidate, source) {
  const yearsOfExperience =
    candidate.yearsOfExperience === null ||
    candidate.yearsOfExperience === undefined ||
    candidate.yearsOfExperience === ''
      ? null
      : Number(candidate.yearsOfExperience)

  return candidateSourceResultSchema.parse({
    ...candidate,
    externalId: candidate.externalId,
    fullName: candidate.fullName,
    currentTitle: candidate.currentTitle || null,
    currentCompany: candidate.currentCompany || null,
    location: candidate.location || null,
    linkedinUrl: candidate.linkedinUrl || null,
    email: candidate.email || null,
    yearsOfExperience,
    skills: candidate.skills ?? [],
    summary: candidate.summary || null,
    source,
  })
}

export class CandidateSource {
  constructor(source) {
    if (new.target === CandidateSource) {
      throw new TypeError('CandidateSource is an abstract source interface.')
    }

    this.source = source
  }

  normalizeCandidates(candidates) {
    return candidates.map((candidate) =>
      normalizeCandidateSourceResult(candidate, this.source),
    )
  }

  async searchCandidates(_criteria) {
    throw new Error('Candidate sources must implement searchCandidates().')
  }
}
