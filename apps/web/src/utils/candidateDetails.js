const monthIndexes = new Map(
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .map((month, index) => [month, index]),
)

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function parseMonth(value, now = new Date()) {
  if (/^(present|current)$/i.test(value ?? '')) {
    return now.getUTCFullYear() * 12 + now.getUTCMonth()
  }
  const match = String(value ?? '').trim().match(/^([A-Za-z]{3,9})\s+(\d{4})$/)
  if (!match) return null
  const month = monthIndexes.get(match[1].slice(0, 3).toLowerCase())
  return month === undefined ? null : Number(match[2]) * 12 + month
}

export function formatEmploymentDuration(entry, now = new Date()) {
  const start = parseMonth(entry.startDate, now)
  const end = parseMonth(entry.endDate, now)
  if (start === null || end === null || end < start) return 'Unknown duration'
  const months = end - start + 1
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  return [
    years > 0 ? `${years} ${years === 1 ? 'year' : 'years'}` : '',
    remainingMonths > 0
      ? `${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`
      : '',
  ].filter(Boolean).join(' ') || 'Less than 1 month'
}

export function calculateEmploymentYears(entries, now = new Date()) {
  if (!entries.length) return null
  const ranges = entries.map((entry) => {
    const start = parseMonth(entry.startDate, now)
    const end = parseMonth(entry.isCurrent ? 'Present' : entry.endDate, now)
    return start === null || end === null || end < start ? null : [start, end + 1]
  })
  if (ranges.some((range) => range === null)) return null
  ranges.sort((first, second) => first[0] - second[0])
  const merged = []
  for (const range of ranges) {
    const previous = merged.at(-1)
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1])
    else merged.push([...range])
  }
  const months = merged.reduce((total, [start, end]) => total + end - start, 0)
  return Math.round((months / 12) * 10) / 10
}

export function createCandidateDetailsDraft(candidate) {
  return {
    fullName: candidate.fullName ?? '',
    currentTitle: candidate.currentTitle ?? '',
    currentCompany: candidate.currentCompany ?? '',
    location: candidate.location ?? '',
    email: candidate.email ?? '',
    skills: (candidate.skills ?? []).join(', '),
    summary: candidate.summary ?? '',
    yearsOfExperience: candidate.yearsOfExperience ?? '',
    employmentHistory: (candidate.employmentHistory ?? []).map((entry) => ({
      title: entry.title || entry.jobTitle || '',
      company: entry.company ?? '',
      startDate: entry.startDate ?? '',
      endDate: entry.endDate ?? '',
      isCurrent: Boolean(entry.isCurrent || /present|current/i.test(entry.endDate)),
      sourceUrl: entry.sourceUrl ?? null,
    })),
  }
}

export function getMatchRecommendation(score) {
  if (!Number.isFinite(score)) return 'Insufficient information'
  if (score >= 90) return 'Strong Match'
  if (score >= 75) return 'Good Match'
  if (score >= 60) return 'Potential Match'
  return 'Low Match'
}

export function buildCandidateDetails(candidate) {
  const analysis = candidate.matchAnalysis ?? null
  const coverage = analysis?.evidenceCoverage ?? null
  const missing = [
    !hasText(candidate.currentTitle) && 'Current title',
    !hasText(candidate.currentCompany) && 'Company',
    !hasText(candidate.location) && 'Location',
    !hasText(candidate.email) && 'Email',
    !hasText(candidate.linkedinUrl) && 'LinkedIn URL',
    !(candidate.skills?.length > 0) && 'Skills',
    !hasText(candidate.summary) && 'Professional summary',
    !Number.isFinite(candidate.yearsOfExperience) && 'Verified experience',
  ].filter(Boolean)
  const sourceUrls = new Set()
  for (const source of candidate.enrichment?.sources ?? []) {
    if (hasText(source?.url)) sourceUrls.add(source.url)
  }
  for (const urls of Object.values(candidate.enrichment?.fieldSources ?? {})) {
    if (Array.isArray(urls)) urls.forEach((url) => sourceUrls.add(url))
    else if (urls && typeof urls === 'object') {
      Object.values(urls).flat().forEach((url) => sourceUrls.add(url))
    }
  }
  for (const entry of candidate.employmentHistory ?? []) {
    if (hasText(entry.sourceUrl)) sourceUrls.add(entry.sourceUrl)
  }

  return {
    analysis,
    coverage,
    recommendation: getMatchRecommendation(candidate.matchScore),
    assessmentStatus:
      Number.isFinite(candidate.matchScore) &&
      coverage?.percentage === 100 &&
      coverage?.unknownFields?.length === 0
        ? 'Verified evidence coverage'
        : Number.isFinite(candidate.matchScore)
          ? 'Provisional — incomplete evidence'
          : 'Insufficient information',
    missing,
    confirmedConcerns: (analysis?.concerns ?? []).filter(
      (concern) => !/unavailable|unknown|unverified|without evidence/i.test(concern),
    ),
    evidenceUrls: [...sourceUrls],
    actions: {
      addProfileDetails: true,
      enrich: !candidate.isSaved && candidate.source === 'google-linkedin' && Boolean(candidate.linkedinUrl),
      findEmail: true,
      viewLinkedIn: Boolean(candidate.linkedinUrl),
      save: !candidate.isSaved,
      email: Boolean(candidate.email),
      linkedinMessage: Boolean(candidate.linkedinUrl),
      connect: Boolean(candidate.linkedinUrl),
      inviteInterview: Boolean(candidate.isSaved && candidate.email),
    },
  }
}
