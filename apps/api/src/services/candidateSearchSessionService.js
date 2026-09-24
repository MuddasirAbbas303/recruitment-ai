import { randomUUID } from 'node:crypto'

export const CANDIDATE_SEARCH_SESSION_TTL_MS = 30 * 60 * 1_000
export const MAX_ACTIVE_CANDIDATE_SEARCH_SESSIONS = 100

const CLEANUP_INTERVAL_MS = 5 * 60 * 1_000
const searchSessions = new Map()

export class CandidateSearchSessionNotFoundError extends Error {
  constructor() {
    super('Candidate search session not found or expired.')
    this.name = 'CandidateSearchSessionNotFoundError'
  }
}

function clone(value) {
  return structuredClone(value)
}

export function cleanupExpiredCandidateSearchSessions(now = Date.now()) {
  for (const [sessionId, session] of searchSessions) {
    if (session.expiresAt <= now) {
      searchSessions.delete(sessionId)
    }
  }
}

function enforceSessionLimit() {
  while (searchSessions.size >= MAX_ACTIVE_CANDIDATE_SEARCH_SESSIONS) {
    searchSessions.delete(searchSessions.keys().next().value)
  }
}

export function createCandidateSearchSession(criteria, now = Date.now()) {
  cleanupExpiredCandidateSearchSessions(now)
  enforceSessionLimit()

  const session = {
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
    criteria: clone(criteria),
    expiresAt: now + CANDIDATE_SEARCH_SESSION_TTL_MS,
  }

  searchSessions.set(session.id, session)
  return {
    id: session.id,
    createdAt: session.createdAt,
    criteria: clone(session.criteria),
  }
}

export function getCandidateSearchSession(sessionId, now = Date.now()) {
  cleanupExpiredCandidateSearchSessions(now)
  const session = searchSessions.get(sessionId)

  if (!session) {
    throw new CandidateSearchSessionNotFoundError()
  }

  return {
    id: session.id,
    createdAt: session.createdAt,
    criteria: clone(session.criteria),
  }
}

const cleanupTimer = setInterval(
  cleanupExpiredCandidateSearchSessions,
  CLEANUP_INTERVAL_MS,
)
cleanupTimer.unref()
