import {
  analyzeResume as analyzeResumeWithGroq,
  analyzeSourcingCandidateWithGroq,
  generateCandidateOutreachWithGroq,
  generateInterviewInvitationWithGroq,
  generateLinkedInOutreachWithGroq,
  extractManualCandidateProfileWithGroq,
  GroqConfigurationError,
  GroqServiceError,
  normalizePublicCandidateEnrichment as normalizePublicCandidateEnrichmentWithGroq,
  normalizeWebCandidateResults as normalizeWebCandidateResultsWithGroq,
  searchPublicProfessionalWeb as searchPublicProfessionalWebWithGroq,
  testGroqConnection,
} from '../groqService.js'
import { AIConfigurationError, AIServiceError } from './aiErrors.js'

async function translateGroqErrors(operation) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof GroqConfigurationError) {
      throw new AIConfigurationError(error.message, 'groq')
    }

    if (error instanceof GroqServiceError) {
      throw new AIServiceError(
        error.message,
        error.statusCode,
        'groq',
      )
    }

    throw error
  }
}

export class GroqProvider {
  name = 'groq'

  testConnection() {
    return translateGroqErrors(() => testGroqConnection())
  }

  analyzeResume(job, resumeText) {
    return translateGroqErrors(() =>
      analyzeResumeWithGroq(job, resumeText),
    )
  }

  analyzeCandidate(job, candidate) {
    return translateGroqErrors(() =>
      analyzeSourcingCandidateWithGroq(job, candidate),
    )
  }

  extractManualCandidateProfile(profileText) {
    return translateGroqErrors(() =>
      extractManualCandidateProfileWithGroq(profileText),
    )
  }

  generateEmailOutreach(candidate, job) {
    return translateGroqErrors(() =>
      generateCandidateOutreachWithGroq(candidate, job),
    )
  }

  generateLinkedInOutreach(candidate, job, type) {
    return translateGroqErrors(() =>
      generateLinkedInOutreachWithGroq(type, candidate, job),
    )
  }

  generateInterviewInvitation(candidate, interview, job) {
    return translateGroqErrors(() =>
      generateInterviewInvitationWithGroq(candidate, interview, job),
    )
  }

  normalizeCandidateSearchResults(evidence, resultLimit, timeoutMs) {
    return translateGroqErrors(() =>
      normalizeWebCandidateResultsWithGroq(
        evidence,
        resultLimit,
        timeoutMs,
      ),
    )
  }

  normalizePublicCandidateEnrichment(candidate, evidence, timeoutMs) {
    return translateGroqErrors(() =>
      normalizePublicCandidateEnrichmentWithGroq(
        candidate,
        evidence,
        timeoutMs,
      ),
    )
  }

  searchPublicProfessionalWeb(prompt, timeoutMs) {
    return translateGroqErrors(() =>
      searchPublicProfessionalWebWithGroq(prompt, timeoutMs),
    )
  }
}

export function createGroqProvider() {
  return new GroqProvider()
}
