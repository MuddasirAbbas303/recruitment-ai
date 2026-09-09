import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const contentScript = readFileSync(
  new URL('../content.js', import.meta.url),
  'utf8',
)

function visibleText(text) {
  return {
    textContent: text,
    getClientRects: () => [{}],
  }
}

function resultAnchor({ href, title, snippet = '', visible = true }) {
  const heading = visibleText(title)
  const container = {
    querySelector(selector) {
      if (selector === 'h3') return heading
      if (selector === '.VwiC3b' && snippet) return visibleText(snippet)
      if (selector === 'cite') return visibleText(href)
      return null
    },
  }

  return {
    href,
    textContent: title,
    parentElement: container,
    getClientRects: () => (visible ? [{}] : []),
    querySelector: (selector) => (selector === 'h3' ? heading : null),
    closest: () => container,
  }
}

function loadScanner(anchors = []) {
  const context = vm.createContext({
    URL,
    console,
    window: {
      location: new URL('https://www.google.com/search?q=linkedin'),
      getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    },
    document: {
      querySelectorAll: () => anchors,
    },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
      },
    },
  })

  vm.runInContext(contentScript, context)
  return context.RecruitmentAiLinkedInScanner
}

test('normalizes regional and tracked LinkedIn profile URLs', () => {
  const scanner = loadScanner()

  assert.equal(
    scanner.normalizeLinkedInUrl(
      'https://lv.linkedin.com/in/John-Smith/?trk=google',
    ),
    'https://www.linkedin.com/in/john-smith',
  )
  assert.equal(
    scanner.normalizeLinkedInUrl(
      'https://www.google.com/url?q=https%3A%2F%2Fuk.linkedin.com%2Fin%2FJane-Doe%2F%3Ftrk%3Dsearch',
    ),
    'https://www.linkedin.com/in/jane-doe',
  )
  assert.equal(
    scanner.normalizeLinkedInUrl('https://linkedin.com/company/example'),
    null,
  )
})

test('keeps only visible LinkedIn profiles and deduplicates canonical URLs', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.linkedin.com/in/john-smith/?trk=first',
      title: 'John Smith - Backend Engineer | LinkedIn',
      snippet: 'Public professional snippet.',
    }),
    resultAnchor({
      href: 'https://lv.linkedin.com/in/john-smith',
      title: 'Duplicate John Smith',
    }),
    resultAnchor({
      href: 'https://example.com/john-smith',
      title: 'Non-LinkedIn result',
    }),
    resultAnchor({
      href: 'https://www.linkedin.com/in/hidden-person',
      title: 'Hidden Person',
      visible: false,
    }),
  ])
  const results = scanner.scanVisibleLinkedInResults()

  assert.equal(results.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(results[0])), {
    fullName: 'John Smith',
    displayTitle: 'John Smith - Backend Engineer | LinkedIn',
    linkedinUrl: 'https://www.linkedin.com/in/john-smith',
    searchSnippet: 'Public professional snippet.',
    secondaryText:
      'https://www.linkedin.com/in/john-smith/?trk=first',
    source: 'google-linkedin',
  })
})
