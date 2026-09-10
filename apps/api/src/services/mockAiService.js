const FALLBACK_NAMES = [
  'Mock Candidate One',
  'Mock Candidate Two',
  'Mock Candidate Three',
  'Mock Candidate Four',
]

const KNOWN_TITLES = [
  'Principal Software Engineer',
  'Senior Software Engineer',
  'Senior Backend Engineer',
  'Senior Backend Developer',
  'Full Stack Developer',
  'Full Stack Engineer',
  'Frontend Developer',
  'Frontend Engineer',
  'Backend Developer',
  'Backend Engineer',
  'Software Developer',
  'Software Engineer',
  'DevOps Engineer',
  'Data Engineer',
  'Engineering Manager',
]

const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

function stableHash(value) {
  let hash = 0

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return hash
}

function normalizeForMatching(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsSkill(resumeText, skill) {
  const normalizedResume = normalizeForMatching(resumeText)
  const normalizedSkill = normalizeForMatching(skill)

  if (!normalizedSkill) {
    return false
  }

  return (
    normalizedResume.includes(normalizedSkill) ||
    normalizedResume.replace(/[^a-z0-9+#]/g, '').includes(
      normalizedSkill.replace(/[^a-z0-9+#]/g, ''),
    )
  )
}

function getCandidateName(resumeText) {
  const nameMatch = resumeText.match(
    /^([A-Z][A-Za-z'-]+\s+[A-Z][A-Za-z'-]+)/,
  )

  if (nameMatch) {
    return nameMatch[1]
  }

  return FALLBACK_NAMES[stableHash(resumeText) % FALLBACK_NAMES.length]
}

function getCurrentTitle(resumeText) {
  const normalizedResume = resumeText.toLowerCase()
  const matchingTitle = KNOWN_TITLES.find((title) =>
    normalizedResume.includes(title.toLowerCase()),
  )

  return matchingTitle || 'Current title not provided'
}

function getYearsOfExperience(resumeText) {
  const numericMatch = resumeText.match(
    /\b(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i,
  )

  if (numericMatch) {
    return Number(numericMatch[1])
  }

  const wordMatch = resumeText.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+years?\b/i,
  )

  return wordMatch ? NUMBER_WORDS[wordMatch[1].toLowerCase()] : 0
}

function scoreMatches(matches, requestedSkills) {
  if (requestedSkills.length === 0) {
    return 100
  }

  return Math.round((matches.length / requestedSkills.length) * 100)
}

function unique(values) {
  return [...new Set(values)]
}

export async function analyzeResumeWithMock(job, resumeText) {
  const matchedRequiredSkills = job.requiredSkills.filter((skill) =>
    containsSkill(resumeText, skill),
  )
  const matchedPreferredSkills = job.preferredSkills.filter((skill) =>
    containsSkill(resumeText, skill),
  )
  const missingSkills = job.requiredSkills.filter(
    (skill) => !matchedRequiredSkills.includes(skill),
  )
  const yearsOfExperience = getYearsOfExperience(resumeText)
  const requiredSkillsScore = scoreMatches(
    matchedRequiredSkills,
    job.requiredSkills,
  )
  const preferredSkillsScore = scoreMatches(
    matchedPreferredSkills,
    job.preferredSkills,
  )
  const experienceScore =
    job.minimumExperience === 0
      ? 100
      : Math.min(
          100,
          Math.round((yearsOfExperience / job.minimumExperience) * 100),
        )
  const overallScore = Math.round(
    requiredSkillsScore * 0.55 +
      preferredSkillsScore * 0.2 +
      experienceScore * 0.25,
  )
  const candidateName = getCandidateName(resumeText)
  const matchedSkills = unique([
    ...matchedRequiredSkills,
    ...matchedPreferredSkills,
  ])
  const strengths = []
  const concerns = []

  if (matchedRequiredSkills.length > 0) {
    strengths.push(
      `Resume evidence matches ${matchedRequiredSkills.length} required skill${matchedRequiredSkills.length === 1 ? '' : 's'}.`,
    )
  }

  if (matchedPreferredSkills.length > 0) {
    strengths.push(
      `Resume evidence includes ${matchedPreferredSkills.length} preferred skill${matchedPreferredSkills.length === 1 ? '' : 's'}.`,
    )
  }

  if (yearsOfExperience >= job.minimumExperience) {
    strengths.push('Stated experience meets the minimum requirement.')
  }

  if (missingSkills.length > 0) {
    concerns.push(
      `The resume does not explicitly mention: ${missingSkills.join(', ')}.`,
    )
  }

  if (yearsOfExperience < job.minimumExperience) {
    concerns.push(
      `Stated experience is below the ${job.minimumExperience}-year minimum.`,
    )
  }

  if (strengths.length === 0) {
    strengths.push('No strong job-relevant match was identified in the resume.')
  }

  if (concerns.length === 0) {
    concerns.push('No material job-related concerns were identified in the resume.')
  }

  return {
    candidateName,
    currentTitle: getCurrentTitle(resumeText),
    overallScore,
    requiredSkillsScore,
    preferredSkillsScore,
    experienceScore,
    matchedSkills,
    missingSkills,
    strengths,
    concerns,
    yearsOfExperience,
    summary: `${candidateName} received a deterministic mock score of ${overallScore}% against the supplied ${job.title} requirements. This is development-only decision support and requires recruiter review.`,
  }
}

function firstNameFromFullName(fullName) {
  return fullName.trim().split(/\s+/)[0] || 'there'
}

function getRelevantOutreachSkills(candidateSkills, job) {
  const candidateSkillMap = new Map(
    candidateSkills.map((skill) => [skill.trim().toLowerCase(), skill.trim()]),
  )

  return unique([...job.requiredSkills, ...job.preferredSkills])
    .map((skill) => candidateSkillMap.get(skill.trim().toLowerCase()))
    .filter(Boolean)
    .slice(0, 2)
}

export async function generateCandidateOutreachWithMock(candidate, job) {
  const firstName = firstNameFromFullName(candidate.fullName)
  const relevantSkills = getRelevantOutreachSkills(candidate.skills, job)
  const background = candidate.currentTitle
    ? `your ${candidate.currentTitle} background`
    : 'your professional background'
  const companyContext = candidate.currentCompany
    ? ` at ${candidate.currentCompany}`
    : ''
  const skillContext =
    relevantSkills.length > 0
      ? ` Your experience with ${relevantSkills.join(' and ')} stood out.`
      : ''
  const role = job.role ? `a ${job.role} role` : 'a role on our team'
  const locationContext = job.location ? ` in ${job.location}` : ''

  return {
    subject: job.role ? `${job.role} opportunity` : 'Opportunity to connect',
    body: [
      `Hi ${firstName},`,
      '',
      `I came across ${background}${companyContext}.${skillContext}`,
      '',
      `We are currently hiring for ${role}${locationContext}, and your professional experience appears relevant to what the team is looking for.`,
      '',
      'Would you be open to a short conversation?',
      '',
      'Best,',
      '[Recruiter]',
    ].join('\n'),
  }
}

export async function generateLinkedInOutreachWithMock(
  type,
  candidate,
  job,
) {
  const firstName = firstNameFromFullName(candidate.fullName)
  const relevantSkills = getRelevantOutreachSkills(candidate.skills, job)
  const skillContext =
    relevantSkills.length > 0
      ? `your ${relevantSkills.join(' and ')} background`
      : candidate.currentTitle
        ? `your ${candidate.currentTitle} background`
        : 'your professional background'
  const roleContext = job.role ? `the ${job.role} role` : 'a role on our team'

  if (type === 'linkedin-connect') {
    return {
      message: `Hi ${firstName}, ${skillContext} caught my attention. We are hiring for ${roleContext}, and I would be happy to connect and share more.`,
    }
  }

  const companyContext = candidate.currentCompany
    ? ` at ${candidate.currentCompany}`
    : ''

  return {
    message: [
      `Hi ${firstName},`,
      '',
      `I came across ${skillContext}${companyContext}, and it stood out as relevant to ${roleContext}.`,
      '',
      'Would you be open to a short conversation to hear more?',
    ].join('\n'),
  }
}

export async function generateInterviewInvitationWithMock(
  candidate,
  interview,
  job,
) {
  const firstName = firstNameFromFullName(candidate.fullName)
  const roleContext = job?.role ? ` for the ${job.role} role` : ''
  const locationLine = interview.meetingLocation
    ? `\n${interview.meetingType}: ${interview.meetingLocation}`
    : `\nMeeting type: ${interview.meetingType}`

  return {
    subject: interview.title,
    body: [
      `Hi ${firstName},`,
      '',
      `We would like to invite you to an interview${roleContext}.`,
      '',
      `Date: ${interview.date}`,
      `Time: ${interview.time} (${interview.timezone})`,
      `Duration: ${interview.durationMinutes} minutes`,
      locationLine.trimStart(),
      interview.notes ? `Additional notes: ${interview.notes}` : null,
      '',
      'Please let us know whether this time works for you.',
      '',
      'Best,',
      '[Recruiter]',
    ]
      .filter((line) => line !== null)
      .join('\n'),
  }
}
