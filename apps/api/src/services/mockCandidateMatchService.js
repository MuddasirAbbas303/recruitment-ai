const ignoredRoleWords = new Set([
  'senior',
  'junior',
  'lead',
  'principal',
  'staff',
])
const europeanLocationMarkers = [
  'albania',
  'austria',
  'belgium',
  'bulgaria',
  'croatia',
  'cyprus',
  'czech',
  'denmark',
  'estonia',
  'europe',
  'finland',
  'france',
  'germany',
  'greece',
  'hungary',
  'iceland',
  'ireland',
  'italy',
  'latvia',
  'lithuania',
  'luxembourg',
  'malta',
  'netherlands',
  'norway',
  'poland',
  'portugal',
  'romania',
  'serbia',
  'slovakia',
  'slovenia',
  'spain',
  'sweden',
  'switzerland',
  'uk',
  'united kingdom',
]

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSkill(value) {
  return normalize(value).replace(/[^a-z0-9+#]/g, '')
}

function unique(values) {
  return [...new Set(values)]
}

function scoreSkills(requestedSkills, candidateSkills) {
  if (requestedSkills.length === 0) {
    return { matched: [], missing: [], score: 100 }
  }

  const normalizedCandidateSkills = new Set(
    candidateSkills.map(normalizeSkill),
  )
  const matched = requestedSkills.filter((skill) =>
    normalizedCandidateSkills.has(normalizeSkill(skill)),
  )
  const missing = requestedSkills.filter(
    (skill) => !normalizedCandidateSkills.has(normalizeSkill(skill)),
  )

  return {
    matched,
    missing,
    score: clampScore((matched.length / requestedSkills.length) * 100),
  }
}

function roleTokens(value) {
  return normalize(value)
    .split(' ')
    .filter(
      (token) => token.length > 2 && !ignoredRoleWords.has(token),
    )
    .map((token) => (token === 'developer' ? 'engineer' : token))
}

function scoreRole(requestedRole, candidateTitle) {
  if (!requestedRole) {
    return 100
  }

  const normalizedRole = normalize(requestedRole)
  const normalizedTitle = normalize(candidateTitle)

  if (!normalizedTitle) {
    return 0
  }

  if (
    normalizedRole.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedRole)
  ) {
    return 100
  }

  const requestedTokens = roleTokens(requestedRole)
  const titleTokens = roleTokens(candidateTitle)

  if (requestedTokens.length === 0 || titleTokens.length === 0) {
    return 0
  }

  const titleTokenSet = new Set(titleTokens)
  const overlap = requestedTokens.filter((token) =>
    titleTokenSet.has(token),
  ).length

  return clampScore(
    (2 * overlap * 100) /
      (requestedTokens.length + titleTokens.length),
  )
}

function scoreExperience(yearsOfExperience, minExperience, maxExperience) {
  if (minExperience === undefined && maxExperience === undefined) {
    return 100
  }

  if (yearsOfExperience === null) {
    return 0
  }

  if (
    minExperience !== undefined &&
    yearsOfExperience < minExperience
  ) {
    return minExperience === 0
      ? 100
      : clampScore((yearsOfExperience / minExperience) * 100)
  }

  if (
    maxExperience !== undefined &&
    yearsOfExperience > maxExperience
  ) {
    return clampScore(100 - (yearsOfExperience - maxExperience) * 5)
  }

  return 100
}

function isEuropeanLocation(candidateLocation) {
  const normalizedLocation = normalize(candidateLocation)
  return europeanLocationMarkers.some((marker) =>
    normalizedLocation.includes(marker),
  )
}

function scoreLocation(requestedLocation, candidateLocation) {
  if (!requestedLocation) {
    return 100
  }

  const normalizedRequestedLocation = normalize(requestedLocation)
  const normalizedCandidateLocation = normalize(candidateLocation)

  if (!normalizedCandidateLocation) {
    return 0
  }

  if (
    normalizedCandidateLocation.includes(normalizedRequestedLocation) ||
    normalizedRequestedLocation.includes(normalizedCandidateLocation)
  ) {
    return 100
  }

  if (
    normalizedRequestedLocation === 'europe' &&
    isEuropeanLocation(candidateLocation)
  ) {
    return 100
  }

  return 0
}

function candidateProfessionalText(candidate) {
  return normalize(
    [
      candidate.currentTitle,
      candidate.currentCompany,
      candidate.location,
      candidate.skills.join(' '),
      candidate.summary,
    ].join(' '),
  )
}

export async function analyzeCandidateWithMock(job, candidate) {
  const requiredSkills = scoreSkills(
    job.requiredSkills,
    candidate.skills,
  )
  const preferredSkills = scoreSkills(
    job.preferredSkills,
    candidate.skills,
  )
  const experienceScore = scoreExperience(
    candidate.yearsOfExperience,
    job.minExperience,
    job.maxExperience,
  )
  const roleScore = scoreRole(job.role, candidate.currentTitle)
  const locationScore = scoreLocation(job.location, candidate.location)
  const professionalText = candidateProfessionalText(candidate)
  const matchedKeywords = job.keywords.filter((keyword) =>
    professionalText.includes(normalize(keyword)),
  )
  const missingKeywords = job.keywords.filter(
    (keyword) => !professionalText.includes(normalize(keyword)),
  )
  const excludedKeywordMatches = job.excludeKeywords.filter((keyword) =>
    professionalText.includes(normalize(keyword)),
  )
  const keywordAdjustment =
    matchedKeywords.length * 2 -
    missingKeywords.length * 5 -
    excludedKeywordMatches.length * 15
  const overallScore = clampScore(
    requiredSkills.score * 0.35 +
      preferredSkills.score * 0.15 +
      experienceScore * 0.2 +
      roleScore * 0.2 +
      locationScore * 0.1 +
      keywordAdjustment,
  )
  const strengths = []
  const concerns = []

  if (requiredSkills.matched.length > 0) {
    strengths.push(
      `Matches ${requiredSkills.matched.length} required skill${requiredSkills.matched.length === 1 ? '' : 's'}.`,
    )
  }

  if (preferredSkills.matched.length > 0) {
    strengths.push(
      `Includes ${preferredSkills.matched.length} preferred skill${preferredSkills.matched.length === 1 ? '' : 's'}.`,
    )
  }

  if (experienceScore === 100) {
    strengths.push('Experience is within the requested range.')
  }

  if (roleScore >= 75) {
    strengths.push('Current title is strongly aligned with the requested role.')
  }

  if (job.location && locationScore === 100) {
    strengths.push('Location aligns with the sourcing requirement.')
  }

  if (requiredSkills.missing.length > 0) {
    concerns.push(
      `Missing explicit evidence for: ${requiredSkills.missing.join(', ')}.`,
    )
  }

  if (experienceScore < 100) {
    concerns.push('Experience falls outside the requested range.')
  }

  if (job.role && roleScore < 60) {
    concerns.push('Current title has limited overlap with the requested role.')
  }

  if (job.location && locationScore === 0) {
    concerns.push('Location does not match the stated sourcing location.')
  }

  if (missingKeywords.length > 0) {
    concerns.push(
      `Missing requested keyword evidence: ${missingKeywords.join(', ')}.`,
    )
  }

  if (excludedKeywordMatches.length > 0) {
    concerns.push(
      `Contains excluded keyword evidence: ${excludedKeywordMatches.join(', ')}.`,
    )
  }

  if (strengths.length === 0) {
    strengths.push('No strong job-relevant match was identified.')
  }

  if (concerns.length === 0) {
    concerns.push('No material job-related concerns were identified.')
  }

  return {
    overallScore,
    requiredSkillsScore: requiredSkills.score,
    preferredSkillsScore: preferredSkills.score,
    experienceScore,
    roleScore,
    matchedSkills: unique([
      ...requiredSkills.matched,
      ...preferredSkills.matched,
    ]),
    missingSkills: requiredSkills.missing,
    strengths,
    concerns,
    summary: `${candidate.fullName} received a deterministic ${overallScore}% match score against the supplied sourcing criteria. This is development-only recruiter decision support and does not make an employment decision.`,
  }
}
