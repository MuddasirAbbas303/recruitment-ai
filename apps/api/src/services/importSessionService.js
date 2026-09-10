import { randomUUID } from 'node:crypto'

export const IMPORT_SESSION_TTL_MS = 30 * 60 * 1_000
export const MAX_IMPORT_SESSION_CANDIDATES = 50
export const MAX_ACTIVE_IMPORT_SESSIONS = 100

const CLEANUP_INTERVAL_MS = 5 * 60 * 1_000
const importSessions = new Map()

export class ImportSessionNotFoundError extends Error {
  constructor() {
    super('Import session not found or expired.')
    this.name = 'ImportSessionNotFoundError'
  }
}

function clone(value) {
  return structuredClone(value)
}

export function cleanupExpiredImportSessions(now = Date.now()) {
  for (const [sessionId, session] of importSessions) {
    if (session.expiresAt <= now) {
      importSessions.delete(sessionId)
    }
  }
}

function enforceSessionLimit() {
  while (importSessions.size >= MAX_ACTIVE_IMPORT_SESSIONS) {
    const oldestSessionId = importSessions.keys().next().value
    importSessions.delete(oldestSessionId)
  }
}

export function createImportSession(
  { criteria = null, candidates },
  now = Date.now(),
) {
  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    candidates.length > MAX_IMPORT_SESSION_CANDIDATES
  ) {
    throw new RangeError(
      `Import sessions require 1-${MAX_IMPORT_SESSION_CANDIDATES} candidates.`,
    )
  }

  cleanupExpiredImportSessions(now)
  enforceSessionLimit()

  const session = {
    id: randomUUID(),
    createdAt: new Date(now).toISOString(),
    criteria: clone(criteria),
    candidates: clone(candidates),
    expiresAt: now + IMPORT_SESSION_TTL_MS,
  }

  importSessions.set(session.id, session)
  return {
    id: session.id,
    createdAt: session.createdAt,
    criteria: clone(session.criteria),
    candidates: clone(session.candidates),
  }
}

export function getImportSession(sessionId, now = Date.now()) {
  cleanupExpiredImportSessions(now)
  const session = importSessions.get(sessionId)

  if (!session) {
    throw new ImportSessionNotFoundError()
  }

  return {
    id: session.id,
    createdAt: session.createdAt,
    criteria: clone(session.criteria),
    candidates: clone(session.candidates),
  }
}

export function updateImportSession(
  sessionId,
  { criteria, candidates },
  now = Date.now(),
) {
  cleanupExpiredImportSessions(now)
  const session = importSessions.get(sessionId)

  if (!session) {
    throw new ImportSessionNotFoundError()
  }

  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    candidates.length > MAX_IMPORT_SESSION_CANDIDATES
  ) {
    throw new RangeError(
      `Import sessions require 1-${MAX_IMPORT_SESSION_CANDIDATES} candidates.`,
    )
  }

  session.criteria = clone(criteria)
  session.candidates = clone(candidates)
  return getImportSession(sessionId, now)
}

const cleanupTimer = setInterval(
  cleanupExpiredImportSessions,
  CLEANUP_INTERVAL_MS,
)
cleanupTimer.unref()
