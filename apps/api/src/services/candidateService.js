import {
  Op,
  Sequelize,
  UniqueConstraintError,
} from 'sequelize'
import { z } from 'zod'
import database from '../config/database.js'
import Candidate from '../models/Candidate.js'

const optionalString = z
  .union([z.string().trim().max(255), z.null()])
  .optional()
const optionalText = z
  .union([z.string().trim().max(20_000), z.null()])
  .optional()
const optionalEmail = z
  .union([
    z.string().trim().email().max(255),
    z.literal(''),
    z.null(),
  ])
  .optional()

const candidateInputSchema = z.object({
  firstName: optionalString,
  lastName: optionalString,
  fullName: z.string().trim().min(1).max(255),
  currentTitle: optionalString,
  currentCompany: optionalString,
  location: optionalString,
  linkedinUrl: optionalString,
  email: optionalEmail,
  phone: optionalString,
  yearsOfExperience: z
    .union([z.number().finite().nonnegative(), z.null()])
    .optional(),
  skills: z
    .union([
      z.array(z.string().trim().min(1).max(255)).max(100),
      z.null(),
    ])
    .optional(),
  summary: optionalText,
  notes: optionalText,
  source: optionalString,
  status: optionalString,
})

const candidateStatuses = [
  'SAVED',
  'SHORTLISTED',
  'CONTACTED',
  'RESPONDED',
  'INTERVIEW',
  'REJECTED',
  'HIRED',
]

const optionalQueryString = z.string().trim().max(255).optional()
const optionalExperienceQuery = z.preprocess(
  (value) => {
    if (value === undefined || value === '') {
      return undefined
    }

    return typeof value === 'string' ? Number(value) : value
  },
  z.number().finite().nonnegative().optional(),
)
const candidateListQuerySchema = z
  .object({
    search: optionalQueryString,
    title: optionalQueryString,
    company: optionalQueryString,
    location: optionalQueryString,
    skills: z.string().trim().max(2_000).optional(),
    minExperience: optionalExperienceQuery,
    maxExperience: optionalExperienceQuery,
    source: optionalQueryString,
    status: z.enum(candidateStatuses).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.minExperience !== undefined &&
      query.maxExperience !== undefined &&
      query.minExperience > query.maxExperience
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maxExperience'],
        message: 'Maximum experience must be greater than or equal to minimum experience.',
      })
    }
  })

const candidateUpdateSchema = z
  .object({
    notes: z
      .union([z.string().trim().max(20_000), z.null()])
      .optional(),
    status: z.enum(candidateStatuses).optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, {
    message: 'At least one of notes or status is required.',
  })

export class CandidateValidationError extends Error {
  constructor(message, details = []) {
    super(message)
    this.details = details
  }
}

export class CandidateNotFoundError extends Error {}

function hasUsefulValue(value) {
  if (typeof value === 'string') {
    return value.trim() !== ''
  }

  if (Array.isArray(value)) {
    return value.length > 0
  }

  return value !== null && value !== undefined
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

export function normalizeLinkedInUrl(linkedinUrl) {
  const trimmedUrl = linkedinUrl.trim()

  if (!trimmedUrl) {
    return undefined
  }

  let parsedUrl

  try {
    parsedUrl = new URL(
      /^https?:\/\//i.test(trimmedUrl)
        ? trimmedUrl
        : `https://${trimmedUrl}`,
    )
  } catch {
    throw new CandidateValidationError(
      'linkedinUrl must be a valid LinkedIn profile URL.',
    )
  }

  const hostname = parsedUrl.hostname.toLowerCase()
  const isLinkedInHostname =
    hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
  const profileSlug = pathSegments[1]?.toLowerCase()

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    !isLinkedInHostname ||
    pathSegments[0]?.toLowerCase() !== 'in' ||
    !profileSlug
  ) {
    throw new CandidateValidationError(
      'linkedinUrl must be a valid LinkedIn profile URL.',
    )
  }

  return `https://www.linkedin.com/in/${profileSlug}`
}

function normalizeCandidateInput(input) {
  const validation = candidateInputSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate data.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  const normalizedCandidate = {}

  for (const [field, value] of Object.entries(validation.data)) {
    if (!hasUsefulValue(value)) {
      continue
    }

    if (field === 'linkedinUrl') {
      normalizedCandidate.linkedinUrl = normalizeLinkedInUrl(value)
    } else if (field === 'email') {
      normalizedCandidate.email = normalizeEmail(value)
    } else if (field === 'skills') {
      normalizedCandidate.skills = [
        ...new Set(value.map((skill) => skill.trim()).filter(Boolean)),
      ]
    } else if (typeof value === 'string') {
      normalizedCandidate[field] = value.trim()
    } else {
      normalizedCandidate[field] = value
    }
  }

  return normalizedCandidate
}

function normalizedStringCondition(field, value) {
  return Sequelize.where(
    Sequelize.fn(
      'LOWER',
      Sequelize.fn('TRIM', Sequelize.col(field)),
    ),
    value.trim().toLowerCase(),
  )
}

function validateCandidateListQuery(query) {
  const validation = candidateListQuerySchema.safeParse(query)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate filters.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return {
    ...validation.data,
    skills: validation.data.skills
      ? [
          ...new Set(
            validation.data.skills
              .split(',')
              .map((skill) => skill.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]
      : [],
  }
}

function partialMatch(value) {
  return { [Op.iLike]: `%${value}%` }
}

function buildCandidateWhere(filters) {
  const conditions = []

  if (filters.search) {
    conditions.push({
      [Op.or]: [
        'fullName',
        'currentTitle',
        'currentCompany',
        'location',
        'email',
      ].map((field) => ({ [field]: partialMatch(filters.search) })),
    })
  }

  if (filters.title) {
    conditions.push({ currentTitle: partialMatch(filters.title) })
  }

  if (filters.company) {
    conditions.push({ currentCompany: partialMatch(filters.company) })
  }

  if (filters.location) {
    conditions.push({ location: partialMatch(filters.location) })
  }

  if (filters.source) {
    conditions.push(normalizedStringCondition('source', filters.source))
  }

  if (filters.status) {
    conditions.push({ status: filters.status })
  }

  if (
    filters.minExperience !== undefined ||
    filters.maxExperience !== undefined
  ) {
    const experienceCondition = {}

    if (filters.minExperience !== undefined) {
      experienceCondition[Op.gte] = filters.minExperience
    }

    if (filters.maxExperience !== undefined) {
      experienceCondition[Op.lte] = filters.maxExperience
    }

    conditions.push({ yearsOfExperience: experienceCondition })
  }

  return conditions.length > 0 ? { [Op.and]: conditions } : undefined
}

async function findCandidateMatch(candidate, transaction) {
  const lockOptions = {
    transaction,
    lock: transaction.LOCK.UPDATE,
  }

  if (candidate.linkedinUrl) {
    const linkedInMatch = await Candidate.findOne({
      where: { linkedinUrl: candidate.linkedinUrl },
      ...lockOptions,
    })

    if (linkedInMatch) {
      return { candidate: linkedInMatch, matchType: 'linkedin' }
    }
  } else if (candidate.email) {
    const emailMatch = await Candidate.findOne({
      where: normalizedStringCondition('email', candidate.email),
      ...lockOptions,
    })

    if (emailMatch) {
      return { candidate: emailMatch, matchType: 'email' }
    }
  }

  if (
    candidate.fullName &&
    candidate.currentCompany &&
    candidate.currentTitle
  ) {
    const possibleDuplicate = await Candidate.findOne({
      where: {
        [Op.and]: [
          normalizedStringCondition('fullName', candidate.fullName),
          normalizedStringCondition(
            'currentCompany',
            candidate.currentCompany,
          ),
          normalizedStringCondition(
            'currentTitle',
            candidate.currentTitle,
          ),
        ],
      },
      ...lockOptions,
    })

    if (possibleDuplicate) {
      return {
        candidate: possibleDuplicate,
        matchType: 'possible_duplicate',
      }
    }
  }

  return null
}

async function updateMatchedCandidate(existingCandidate, candidate, transaction) {
  await existingCandidate.update(candidate, { transaction })
  return existingCandidate
}

async function saveCandidateInTransaction(candidate) {
  return database.transaction(async (transaction) => {
    const match = await findCandidateMatch(candidate, transaction)

    if (match?.matchType === 'possible_duplicate') {
      return {
        candidate: match.candidate,
        created: false,
        duplicateDetected: false,
        possibleDuplicate: true,
      }
    }

    if (match) {
      const updatedCandidate = await updateMatchedCandidate(
        match.candidate,
        candidate,
        transaction,
      )

      return {
        candidate: updatedCandidate,
        created: false,
        duplicateDetected: true,
        possibleDuplicate: false,
      }
    }

    const createdCandidate = await Candidate.create(candidate, {
      transaction,
    })

    return {
      candidate: createdCandidate,
      created: true,
      duplicateDetected: false,
      possibleDuplicate: false,
    }
  })
}

export async function saveCandidate(input) {
  const candidate = normalizeCandidateInput(input)

  try {
    return await saveCandidateInTransaction(candidate)
  } catch (error) {
    if (error instanceof UniqueConstraintError && candidate.linkedinUrl) {
      return database.transaction(async (transaction) => {
        const existingCandidate = await Candidate.findOne({
          where: { linkedinUrl: candidate.linkedinUrl },
          transaction,
          lock: transaction.LOCK.UPDATE,
        })

        if (!existingCandidate) {
          throw error
        }

        const updatedCandidate = await updateMatchedCandidate(
          existingCandidate,
          candidate,
          transaction,
        )

        return {
          candidate: updatedCandidate,
          created: false,
          duplicateDetected: true,
          possibleDuplicate: false,
        }
      })
    }

    throw error
  }
}

export async function listCandidates(query = {}) {
  const filters = validateCandidateListQuery(query)
  const candidates = await Candidate.findAll({
    where: buildCandidateWhere(filters),
    order: [['createdAt', 'DESC']],
  })

  if (filters.skills.length === 0) {
    return candidates
  }

  return candidates.filter((candidate) => {
    const candidateSkills = new Set(
      candidate.skills.map((skill) => skill.trim().toLowerCase()),
    )

    return filters.skills.every((skill) => candidateSkills.has(skill))
  })
}

export async function getCandidateById(id) {
  const validation = z.string().uuid().safeParse(id)

  if (!validation.success) {
    throw new CandidateValidationError('Invalid candidate ID.')
  }

  const candidate = await Candidate.findByPk(validation.data)

  if (!candidate) {
    throw new CandidateNotFoundError('Candidate not found.')
  }

  return candidate
}

export async function updateCandidate(id, input) {
  const candidate = await getCandidateById(id)
  const validation = candidateUpdateSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateValidationError(
      'Invalid candidate update.',
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  await candidate.update(validation.data)
  return candidate
}
