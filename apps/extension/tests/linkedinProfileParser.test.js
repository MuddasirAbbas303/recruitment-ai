import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const script = readFileSync(
  new URL('../linkedinProfileParser.js', import.meta.url),
  'utf8',
)

function loadParser() {
  const context = vm.createContext({
    URL,
    window: { location: new URL('https://www.linkedin.com/in/stephan-r') },
    document: { querySelectorAll: () => [], querySelector: () => null },
    chrome: { runtime: { onMessage: { addListener() {} } } },
  })
  vm.runInContext(script, context)
  return context.RecruitmentAiLinkedInProfileParser
}

test('extracts visible current LinkedIn employment', () => {
  const parser = loadParser()
  const entry = parser.parseExperienceBlock(
    'Fullstack Consultant / Lead Fullstack Developer\nDog and Bone AI · Freelance\nJun 2026 – Present · 4 mos\nEngland, United Kingdom · Remote',
    'https://www.linkedin.com/in/stephan-r',
  )

  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    title: 'Fullstack Consultant / Lead Fullstack Developer',
    company: 'Dog and Bone AI',
    startDate: 'Jun 2026',
    endDate: 'Present',
    isCurrent: true,
    sourceUrl: 'https://www.linkedin.com/in/stephan-r',
  })
})

test('extracts completed employment and ignores blocks without dates', () => {
  const parser = loadParser()
  const entry = parser.parseExperienceBlock(
    'Software Development Lead\nidclear · Full-time\nMay 2025 – Nov 2025 · 7 mos',
    'https://www.linkedin.com/in/stephan-r',
  )

  assert.equal(entry.startDate, 'May 2025')
  assert.equal(entry.endDate, 'Nov 2025')
  assert.equal(entry.isCurrent, false)
  assert.equal(
    parser.parseExperienceBlock('Engineer\nExample Ltd\nDates unavailable', entry.sourceUrl),
    null,
  )
})

test('canonicalizes regional URLs and rejects non-profile URLs', () => {
  const parser = loadParser()
  assert.equal(
    parser.canonicalProfileUrl('https://lv.linkedin.com/in/Stephan-R/?trk=test'),
    'https://www.linkedin.com/in/stephan-r',
  )
  assert.equal(parser.canonicalProfileUrl('https://www.linkedin.com/company/test'), null)
})
