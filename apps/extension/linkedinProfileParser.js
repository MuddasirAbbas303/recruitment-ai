const LINKEDIN_DATE_RANGE = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\s*(?:-|–|—|to)\s*(Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/i

function canonicalProfileUrl(value) {
  try {
    const url = new URL(value)
    const match = url.pathname.match(/^\/in\/([^/?#]+)/i)
    if (!match || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return null
    return `https://www.linkedin.com/in/${match[1].toLowerCase()}`
  } catch {
    return null
  }
}

function cleanLine(value) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function parseExperienceBlock(text, sourceUrl) {
  const lines = String(text)
    .split('\n')
    .map(cleanLine)
    .filter(Boolean)
  const dateIndex = lines.findIndex((line) => LINKEDIN_DATE_RANGE.test(line))
  if (dateIndex < 2) return null

  const dateMatch = lines[dateIndex].match(LINKEDIN_DATE_RANGE)
  const title = lines[0]
  const company = lines[1]
    .replace(/\s*·\s*(?:Full-time|Part-time|Contract|Freelance|Internship|Self-employed).*$/i, '')
    .trim()
  if (!title || !company || !dateMatch) return null

  const endDate = /^(?:present|current)$/i.test(dateMatch[2])
    ? 'Present'
    : dateMatch[2]
  return {
    title,
    company,
    startDate: dateMatch[1],
    endDate,
    isCurrent: endDate === 'Present',
    sourceUrl,
  }
}

function findExperienceSection() {
  const headings = [...document.querySelectorAll('h2, h3, span')]
  const heading = headings.find(
    (element) => cleanLine(element.textContent).toLowerCase() === 'experience',
  )
  return heading?.closest('section') ?? null
}

function parseVisibleLinkedInProfile() {
  const linkedinUrl = canonicalProfileUrl(window.location.href)
  if (!linkedinUrl) return null

  const fullName = cleanLine(
    document.querySelector('main a[href*="/in/"] h1, main a[href*="/in/"] h2')
      ?.textContent ||
      document.querySelector('main h1')?.textContent ||
      document.querySelector('h1')?.textContent,
  )
  const section = findExperienceSection()
  const blocks = section
    ? [...section.querySelectorAll('li')]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => parseExperienceBlock(element.innerText, linkedinUrl))
        .filter(Boolean)
    : []
  const unique = new Map(
    blocks.map((entry) => [
      [entry.title, entry.company, entry.startDate, entry.endDate]
        .join('|')
        .toLowerCase(),
      entry,
    ]),
  )

  return {
    fullName: fullName || 'LinkedIn candidate',
    linkedinUrl,
    employmentHistory: [...unique.values()],
  }
}

globalThis.RecruitmentAiLinkedInProfileParser = Object.freeze({
  canonicalProfileUrl,
  parseExperienceBlock,
  parseVisibleLinkedInProfile,
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'READ_LINKEDIN_EXPERIENCE') return false
  sendResponse({
    supported: Boolean(canonicalProfileUrl(window.location.href)),
    candidate: parseVisibleLinkedInProfile(),
  })
  return false
})
