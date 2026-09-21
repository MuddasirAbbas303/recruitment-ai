import {
  analyzeResumeWithMock,
  generateCandidateOutreachWithMock,
  generateInterviewInvitationWithMock,
  generateLinkedInOutreachWithMock,
} from '../mockAiService.js'
import { analyzeCandidateWithMock } from '../mockCandidateMatchService.js'
import { AIServiceError } from './aiErrors.js'
import { createAIProvider } from './aiProviderFactory.js'

export { AIConfigurationError, AIServiceError } from './aiErrors.js'
export { createAIProvider, getConfiguredAIProviderName } from './aiProviderFactory.js'

export function isMockAIEnabled() {
  return process.env.USE_MOCK_AI?.trim().toLowerCase() === 'true'
}

function getRealProvider() {
  return createAIProvider()
}

export async function testAIConnection() {
  if (isMockAIEnabled()) {
    return {
      status: 'connected',
      message: 'Mock AI connection successful',
    }
  }

  return getRealProvider().testConnection()
}

export function analyzeResume(job, resumeText) {
  return isMockAIEnabled()
    ? analyzeResumeWithMock(job, resumeText)
    : getRealProvider().analyzeResume(job, resumeText)
}

export function analyzeCandidate(job, candidate) {
  return isMockAIEnabled()
    ? analyzeCandidateWithMock(job, candidate)
    : getRealProvider().analyzeCandidate(job, candidate)
}

export function generateEmailOutreach(candidate, job) {
  return isMockAIEnabled()
    ? generateCandidateOutreachWithMock(candidate, job)
    : getRealProvider().generateEmailOutreach(candidate, job)
}

export function generateLinkedInOutreach(candidate, job, type) {
  return isMockAIEnabled()
    ? generateLinkedInOutreachWithMock(type, candidate, job)
    : getRealProvider().generateLinkedInOutreach(candidate, job, type)
}

export function generateInterviewInvitation(candidate, interview, job) {
  return isMockAIEnabled()
    ? generateInterviewInvitationWithMock(candidate, interview, job)
    : getRealProvider().generateInterviewInvitation(candidate, interview, job)
}

function requireRealAIForWebTask() {
  if (isMockAIEnabled()) {
    throw new AIServiceError(
      'Public web search is unavailable in mock AI mode.',
      503,
      'mock',
      'web_search_unavailable',
    )
  }

  return getRealProvider()
}

export function normalizeCandidateSearchResults(evidence, resultLimit, timeoutMs) {
  return requireRealAIForWebTask().normalizeCandidateSearchResults(
    evidence,
    resultLimit,
    timeoutMs,
  )
}

export function normalizePublicCandidateEnrichment(candidate, evidence, timeoutMs) {
  return requireRealAIForWebTask().normalizePublicCandidateEnrichment(
    candidate,
    evidence,
    timeoutMs,
  )
}

export function searchPublicProfessionalWeb(prompt, timeoutMs) {
  return requireRealAIForWebTask().searchPublicProfessionalWeb(
    prompt,
    timeoutMs,
  )
}
