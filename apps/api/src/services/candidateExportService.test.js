import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import {
  CandidateExportValidationError,
  generateCandidateWorkbook,
  getCandidateExportFilename,
  getMatchRecommendation,
  MAX_EXPORT_CANDIDATES,
} from './candidateExportService.js'

function buildCandidate(overrides = {}) {
  return {
    fullName: 'Candidate',
    currentTitle: null,
    currentCompany: null,
    location: null,
    yearsOfExperience: null,
    skills: [],
    matchScore: null,
    matchAnalysis: null,
    linkedinUrl: null,
    email: null,
    githubUrl: null,
    portfolioUrl: null,
    source: 'google-linkedin',
    isSaved: false,
    status: null,
    notes: '',
    ...overrides,
  }
}

test('creates a styled Candidates workbook in supplied candidate order', async () => {
  const candidates = [
    buildCandidate({
      fullName: 'Saved Candidate',
      matchScore: 94,
      isSaved: true,
      status: 'SHORTLISTED',
      notes: 'Persisted recruiter note',
      linkedinUrl: 'https://www.linkedin.com/in/saved-candidate',
      matchAnalysis: {
        requiredSkillsScore: 100,
        preferredSkillsScore: 80,
        experienceScore: 95,
        roleScore: 95,
        matchedSkills: ['Node.js', 'AWS'],
        missingSkills: ['Redis'],
        strengths: ['Relevant backend work'],
        concerns: [],
        summary: 'Strong match for the role.',
      },
    }),
    buildCandidate({
      fullName: 'Unsaved Candidate',
      matchScore: 78,
      notes: 'Temporary frontend note',
    }),
    buildCandidate({
      fullName: 'Enriched Candidate',
      currentTitle: 'Backend Engineer',
      yearsOfExperience: 7,
      skills: ['Node.js', 'PostgreSQL'],
      matchScore: 67,
      githubUrl: 'https://github.com/enriched-candidate',
      portfolioUrl: 'https://enriched.example.com',
      notes: 'Review public projects',
    }),
    buildCandidate({ fullName: 'Unscored Candidate' }),
  ]
  const buffer = await generateCandidateWorkbook({ candidates })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.getWorksheet('Candidates')

  assert.ok(Buffer.isBuffer(buffer))
  assert.ok(buffer.length > 0)
  assert.equal(workbook.worksheets.length, 1)
  assert.equal(worksheet.columnCount, 26)
  assert.equal(worksheet.rowCount, 5)
  assert.equal(worksheet.getCell('A1').value, 'Rank')
  assert.equal(worksheet.getCell('Z1').value, 'Recruiter Notes')
  assert.deepEqual(
    [2, 3, 4, 5].map((row) => worksheet.getCell(`B${row}`).value),
    candidates.map((candidate) => candidate.fullName),
  )
  assert.equal(worksheet.getCell('Z2').value, 'Persisted recruiter note')
  assert.equal(worksheet.getCell('Z3').value, 'Temporary frontend note')
  assert.equal(worksheet.getCell('I5').value, 'Score unavailable')
  assert.equal(worksheet.getCell('C5').value, '-')
  assert.equal(worksheet.getCell('S2').value.hyperlink, candidates[0].linkedinUrl)
  assert.equal(worksheet.getCell('U4').value.hyperlink, candidates[2].githubUrl)
  assert.equal(
    worksheet.getCell('V4').value.hyperlink,
    candidates[2].portfolioUrl,
  )
  assert.equal(worksheet.views[0].ySplit, 1)
  assert.equal(worksheet.autoFilter, 'A1:Z5')
  assert.equal(worksheet.getRow(1).font.bold, true)
})

test('applies all match recommendation boundaries', () => {
  assert.equal(getMatchRecommendation(100), 'Strong Match')
  assert.equal(getMatchRecommendation(90), 'Strong Match')
  assert.equal(getMatchRecommendation(89), 'Good Match')
  assert.equal(getMatchRecommendation(75), 'Good Match')
  assert.equal(getMatchRecommendation(74), 'Potential Match')
  assert.equal(getMatchRecommendation(60), 'Potential Match')
  assert.equal(getMatchRecommendation(59), 'Low Match')
  assert.equal(getMatchRecommendation(null), 'Score unavailable')
})

test('rejects empty and oversized exports', async () => {
  await assert.rejects(
    generateCandidateWorkbook({ candidates: [] }),
    CandidateExportValidationError,
  )
  await assert.rejects(
    generateCandidateWorkbook({
      candidates: Array.from(
        { length: MAX_EXPORT_CANDIDATES + 1 },
        (_, index) => buildCandidate({ fullName: `Candidate ${index + 1}` }),
      ),
    }),
    CandidateExportValidationError,
  )
})

test('uses a dynamically generated ISO date in the filename', () => {
  assert.equal(
    getCandidateExportFilename(new Date('2026-09-09T12:00:00.000Z')),
    'recruitment-candidates-2026-09-09.xlsx',
  )
})
