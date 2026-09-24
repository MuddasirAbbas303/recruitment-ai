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

function extractManualCandidateProfileWithMock(profileText) {
  const combined = [profileText.about, profileText.workExperience, profileText.skills]
    .filter(Boolean)
    .join('\n')
  const skills = profileText.skills
    .split(/[,\n|•]+/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 100)
  const experienceLines = profileText.workExperience
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const employmentHistory = experienceLines.flatMap((line) => {
    const match = line.match(
      /^(.+?)\s+(?:at|@)\s+(.+?)\s*[|,]\s*([A-Za-z]+\s+\d{4})\s*(?:-|–|—|to)\s*(Present|Current|[A-Za-z]+\s+\d{4})$/i,
    )
    return match
      ? [{ jobTitle: match[1].trim(), company: match[2].trim(), startDate: match[3].trim(), endDate: /^(present|current)$/i.test(match[4]) ? 'Present' : match[4].trim() }]
      : []
  })
  const titleCompany = employmentHistory[0] ?? null
  const location = combined.match(/(?:^|\n)\s*Location:\s*([^\n]+)/i)?.[1]?.trim() || null

  return Promise.resolve({
    currentTitle: titleCompany?.jobTitle ?? null,
    currentCompany: titleCompany?.company ?? null,
    location,
    skills,
    summary: profileText.about.trim() || null,
    employmentHistory,
  })
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

export function extractManualCandidateProfile(profileText) {
  return isMockAIEnabled()
    ? extractManualCandidateProfileWithMock(profileText)
    : getRealProvider().extractManualCandidateProfile(profileText)
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

export function searchPublicProfessionalEmail(prompt, candidate, timeoutMs) {
  if (!isMockAIEnabled()) {
    return getRealProvider().searchPublicProfessionalWeb(prompt, timeoutMs)
  }

  const slug = candidate.fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '') || 'candidate'
  const email = `${slug}@example.com`
  const identity = [
    candidate.fullName,
    candidate.currentTitle,
    candidate.currentCompany,
    email,
  ].filter(Boolean).join(' · ')

  return Promise.resolve({
    _request_id: 'mock-email-discovery',
    choices: [{
      message: {
        content: identity,
        executed_tools: [{
          type: 'browser_search',
          search_results: [{
            url: `https://example.com/team/${slug}`,
            title: `${candidate.fullName} professional profile`,
            snippet: identity,
          }],
        }],
      },
    }],
  })
}
