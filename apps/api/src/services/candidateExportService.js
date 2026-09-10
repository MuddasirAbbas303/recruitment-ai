import ExcelJS from 'exceljs'
import { z } from 'zod'

export const MAX_EXPORT_CANDIDATES = 100

const optionalText = z.string().trim().max(20_000).nullable().optional()
const optionalNumber = z.number().finite().nonnegative().nullable().optional()
const stringList = z
  .array(z.string().trim().min(1).max(1_000))
  .max(200)
  .optional()
const matchAnalysisSchema = z
  .object({
    requiredSkillsScore: optionalNumber,
    preferredSkillsScore: optionalNumber,
    experienceScore: optionalNumber,
    roleScore: optionalNumber,
    matchedSkills: stringList,
    missingSkills: stringList,
    strengths: stringList,
    concerns: stringList,
    summary: optionalText,
  })
  .strict()
  .nullable()
  .optional()
const exportCandidateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255),
    currentTitle: optionalText,
    currentCompany: optionalText,
    location: optionalText,
    yearsOfExperience: optionalNumber,
    skills: stringList,
    matchScore: z.number().finite().min(0).max(100).nullable().optional(),
    matchAnalysis: matchAnalysisSchema,
    linkedinUrl: optionalText,
    email: optionalText,
    githubUrl: optionalText,
    portfolioUrl: optionalText,
    source: optionalText,
    isSaved: z.boolean().optional(),
    status: optionalText,
    notes: optionalText,
  })
  .strict()
const exportRequestSchema = z
  .object({
    candidates: z
      .array(exportCandidateSchema)
      .min(1)
      .max(MAX_EXPORT_CANDIDATES),
  })
  .strict()

const columns = [
  { header: 'Rank', key: 'rank', width: 8 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Current Title', key: 'currentTitle', width: 24 },
  { header: 'Current Company', key: 'currentCompany', width: 22 },
  { header: 'Location', key: 'location', width: 20 },
  { header: 'Years of Experience', key: 'yearsOfExperience', width: 19 },
  { header: 'Skills', key: 'skills', width: 34 },
  { header: 'Match Score', key: 'matchScore', width: 15 },
  {
    header: 'Match Recommendation',
    key: 'matchRecommendation',
    width: 22,
  },
  {
    header: 'Required Skills Score',
    key: 'requiredSkillsScore',
    width: 21,
  },
  {
    header: 'Preferred Skills Score',
    key: 'preferredSkillsScore',
    width: 22,
  },
  { header: 'Experience Score', key: 'experienceScore', width: 18 },
  { header: 'Role Score', key: 'roleScore', width: 14 },
  { header: 'Matched Skills', key: 'matchedSkills', width: 34 },
  { header: 'Missing Skills', key: 'missingSkills', width: 34 },
  { header: 'Strengths', key: 'strengths', width: 40 },
  { header: 'Concerns', key: 'concerns', width: 40 },
  { header: 'AI Summary', key: 'aiSummary', width: 48 },
  { header: 'LinkedIn URL', key: 'linkedinUrl', width: 38 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'GitHub URL', key: 'githubUrl', width: 34 },
  { header: 'Portfolio URL', key: 'portfolioUrl', width: 34 },
  { header: 'Source', key: 'source', width: 18 },
  { header: 'Saved', key: 'saved', width: 11 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Recruiter Notes', key: 'notes', width: 42 },
]

export class CandidateExportValidationError extends Error {
  constructor(details) {
    super('Invalid candidate export request.')
    this.name = 'CandidateExportValidationError'
    this.details = details
  }
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function displayList(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : '-'
}

export function getMatchRecommendation(score) {
  if (!Number.isFinite(score)) {
    return 'Score unavailable'
  }

  if (score >= 90) return 'Strong Match'
  if (score >= 75) return 'Good Match'
  if (score >= 60) return 'Potential Match'
  return 'Low Match'
}

function toWorksheetRow(candidate, index) {
  const analysis = candidate.matchAnalysis ?? {}

  return {
    rank: index + 1,
    name: candidate.fullName,
    currentTitle: displayValue(candidate.currentTitle),
    currentCompany: displayValue(candidate.currentCompany),
    location: displayValue(candidate.location),
    yearsOfExperience: displayValue(candidate.yearsOfExperience),
    skills: displayList(candidate.skills),
    matchScore: displayValue(candidate.matchScore),
    matchRecommendation: getMatchRecommendation(candidate.matchScore),
    requiredSkillsScore: displayValue(analysis.requiredSkillsScore),
    preferredSkillsScore: displayValue(analysis.preferredSkillsScore),
    experienceScore: displayValue(analysis.experienceScore),
    roleScore: displayValue(analysis.roleScore),
    matchedSkills: displayList(analysis.matchedSkills),
    missingSkills: displayList(analysis.missingSkills),
    strengths: displayList(analysis.strengths),
    concerns: displayList(analysis.concerns),
    aiSummary: displayValue(analysis.summary),
    linkedinUrl: displayValue(candidate.linkedinUrl),
    email: displayValue(candidate.email),
    githubUrl: displayValue(candidate.githubUrl),
    portfolioUrl: displayValue(candidate.portfolioUrl),
    source: displayValue(candidate.source),
    saved: candidate.isSaved ? 'Yes' : 'No',
    status: displayValue(candidate.status),
    notes: displayValue(candidate.notes),
  }
}

function toHyperlink(value) {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return { text: value, hyperlink: value }
  } catch {
    return null
  }
}

function applyHyperlinks(worksheet, candidates) {
  const hyperlinkColumns = [
    ['linkedinUrl', 'linkedinUrl'],
    ['githubUrl', 'githubUrl'],
    ['portfolioUrl', 'portfolioUrl'],
  ]

  candidates.forEach((candidate, index) => {
    const row = worksheet.getRow(index + 2)

    for (const [columnKey, candidateKey] of hyperlinkColumns) {
      const hyperlink = toHyperlink(candidate[candidateKey])
      if (!hyperlink) continue

      const cell = row.getCell(columnKey)
      cell.value = hyperlink
      cell.font = { color: { argb: 'FF2563EB' }, underline: true }
    }
  })
}

export function validateCandidateExportRequest(input) {
  const validation = exportRequestSchema.safeParse(input)

  if (!validation.success) {
    throw new CandidateExportValidationError(
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }

  return validation.data
}

export async function generateCandidateWorkbook(input) {
  const { candidates } = validateCandidateExportRequest(input)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Recruitment AI'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('Candidates', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  })

  worksheet.columns = columns
  worksheet.addRows(candidates.map(toWorksheetRow))
  worksheet.autoFilter = `A1:Z${worksheet.rowCount}`

  const headerRow = worksheet.getRow(1)
  headerRow.height = 30
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' },
  }
  headerRow.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  }

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'top', wrapText: true }
    }
  })
  applyHyperlinks(worksheet, candidates)

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export function getCandidateExportFilename(date = new Date()) {
  return `recruitment-candidates-${date.toISOString().slice(0, 10)}.xlsx`
}
