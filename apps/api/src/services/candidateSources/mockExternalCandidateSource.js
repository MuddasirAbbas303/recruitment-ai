import { CandidateSource } from './candidateSource.js'

const mockCandidates = [
  {
    externalId: 'external-maya-chen',
    fullName: 'Maya Chen',
    currentTitle: 'Senior Backend Engineer',
    currentCompany: 'Nimbus Labs',
    location: 'Riga, Latvia',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/maya-chen-backend',
    email: 'maya.chen@example.com',
    yearsOfExperience: 8,
    skills: ['Node.js', 'AWS', 'PostgreSQL', 'Docker', 'Redis'],
    summary:
      'Backend engineer focused on cloud-native Node.js services and reliable data platforms.',
  },
  {
    externalId: 'external-omar-haddad',
    fullName: 'Omar Haddad',
    currentTitle: 'Backend Developer',
    currentCompany: 'CloudForge',
    location: 'Berlin, Germany',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/omar-haddad-cloud',
    email: 'omar.haddad@example.com',
    yearsOfExperience: 5.5,
    skills: ['Node.js', 'AWS', 'Docker', 'MongoDB', 'TypeScript'],
    summary:
      'Backend developer building TypeScript APIs and containerized services for SaaS products.',
  },
  {
    externalId: 'external-sofia-marin',
    fullName: 'Sofia Marin',
    currentTitle: 'Full Stack Developer',
    currentCompany: 'ProductFlow',
    location: 'Madrid, Spain',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/sofia-marin-fullstack',
    email: 'sofia.marin@example.com',
    yearsOfExperience: 6,
    skills: ['React', 'Node.js', 'PostgreSQL', 'AWS', 'GraphQL'],
    summary:
      'Full stack developer experienced in React products, Node.js APIs, and PostgreSQL.',
  },
  {
    externalId: 'external-luka-petrov',
    fullName: 'Luka Petrov',
    currentTitle: 'DevOps Engineer',
    currentCompany: 'Baltic Systems',
    location: 'Tallinn, Estonia',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/luka-petrov-devops',
    email: 'luka.petrov@example.com',
    yearsOfExperience: 9,
    skills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'Linux'],
    summary:
      'DevOps engineer specializing in AWS infrastructure, Kubernetes, and delivery automation.',
  },
  {
    externalId: 'external-aisha-khan',
    fullName: 'Aisha Khan',
    currentTitle: 'Principal Software Engineer',
    currentCompany: 'FinCore',
    location: 'London, United Kingdom',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/aisha-khan-platforms',
    email: 'aisha.khan@example.com',
    yearsOfExperience: 12,
    skills: ['Java', 'AWS', 'Kafka', 'PostgreSQL', 'Architecture'],
    summary:
      'Principal engineer leading distributed financial platforms and event-driven architecture.',
  },
  {
    externalId: 'external-noah-williams',
    fullName: 'Noah Williams',
    currentTitle: 'Junior Backend Developer',
    currentCompany: 'RemoteStack',
    location: 'Remote, Europe',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/noah-williams-backend',
    email: 'noah.williams@example.com',
    yearsOfExperience: 2,
    skills: ['Node.js', 'Express', 'MongoDB', 'JavaScript'],
    summary:
      'Junior backend developer working with Express APIs and document databases.',
  },
  {
    externalId: 'external-elina-ozola',
    fullName: 'Elina Ozola',
    currentTitle: 'Data Engineer',
    currentCompany: 'DataNorth',
    location: 'Riga, Latvia',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/elina-ozola-data',
    email: 'elina.ozola@example.com',
    yearsOfExperience: 7,
    skills: ['Python', 'AWS', 'SQL', 'Airflow', 'dbt'],
    summary:
      'Data engineer creating cloud data pipelines, analytics models, and orchestration workflows.',
  },
  {
    externalId: 'external-marcus-lee',
    fullName: 'Marcus Lee',
    currentTitle: 'Frontend Engineer',
    currentCompany: 'DesignCloud',
    location: 'Amsterdam, Netherlands',
    region: 'Europe',
    linkedinUrl: 'https://www.linkedin.com/in/marcus-lee-frontend',
    email: 'marcus.lee@example.com',
    yearsOfExperience: 4,
    skills: ['React', 'TypeScript', 'CSS', 'GraphQL', 'Accessibility'],
    summary:
      'Frontend engineer building accessible React applications and reusable design systems.',
  },
]

const ignoredRoleWords = new Set([
  'senior',
  'junior',
  'lead',
  'principal',
  'staff',
])

function normalize(value) {
  return value?.trim().toLowerCase() ?? ''
}

function tokenizeRole(value) {
  return normalize(value)
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 2 && !ignoredRoleWords.has(word))
}

function getSearchableText(candidate) {
  return normalize(
    [
      candidate.fullName,
      candidate.currentTitle,
      candidate.currentCompany,
      candidate.location,
      candidate.skills.join(' '),
      candidate.summary,
    ].join(' '),
  )
}

function matchesRole(candidate, role) {
  if (!role) {
    return true
  }

  const normalizedRole = normalize(role)
  const normalizedTitle = normalize(candidate.currentTitle)

  if (
    normalizedTitle.includes(normalizedRole) ||
    normalizedRole.includes(normalizedTitle)
  ) {
    return true
  }

  const requestedTokens = tokenizeRole(role)
  const candidateTokens = new Set(tokenizeRole(candidate.currentTitle))

  return requestedTokens.some((token) => candidateTokens.has(token))
}

function matchesLocation(candidate, location) {
  if (!location) {
    return true
  }

  const normalizedLocation = normalize(location)

  return (
    normalize(candidate.location).includes(normalizedLocation) ||
    normalize(candidate.region) === normalizedLocation
  )
}

function matchesSkills(candidate, requiredSkills) {
  const candidateSkills = new Set(candidate.skills.map(normalize))
  return requiredSkills.every((skill) => candidateSkills.has(normalize(skill)))
}

function preferredSkillCount(candidate, preferredSkills) {
  const candidateSkills = new Set(candidate.skills.map(normalize))
  return preferredSkills.filter((skill) => candidateSkills.has(normalize(skill)))
    .length
}

export class MockExternalCandidateSource extends CandidateSource {
  constructor() {
    super('external')
  }

  async searchCandidates(criteria) {
    const candidates = mockCandidates
      .filter((candidate) => {
        const searchableText = getSearchableText(candidate)

        return (
          matchesRole(candidate, criteria.role) &&
          matchesSkills(candidate, criteria.requiredSkills) &&
          matchesLocation(candidate, criteria.location) &&
          (criteria.minExperience === undefined ||
            candidate.yearsOfExperience >= criteria.minExperience) &&
          (criteria.maxExperience === undefined ||
            candidate.yearsOfExperience <= criteria.maxExperience) &&
          criteria.keywords.every((keyword) =>
            searchableText.includes(normalize(keyword)),
          ) &&
          !criteria.excludeKeywords.some((keyword) =>
            searchableText.includes(normalize(keyword)),
          )
        )
      })
      .sort(
        (firstCandidate, secondCandidate) =>
          preferredSkillCount(secondCandidate, criteria.preferredSkills) -
          preferredSkillCount(firstCandidate, criteria.preferredSkills),
      )
      .map(({ region: _region, ...candidate }) => ({
        ...candidate,
        id: candidate.externalId,
        notes: '',
        isSaved: false,
      }))

    return this.normalizeCandidates(candidates)
  }
}
