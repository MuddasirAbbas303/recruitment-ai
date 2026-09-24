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

function resultAnchor({
  href,
  title,
  snippet = '',
  snippetSelector = '.VwiC3b',
  secondaryText = '',
  metadataText = '',
  platformText = '',
  attributes = {},
  visible = true,
}) {
  const heading = visibleText(title)
  const container = {
    textContent: [title, snippet, secondaryText, metadataText, platformText]
      .filter(Boolean)
      .join(' '),
    querySelector(selector) {
      if (selector === 'h3') return heading
      if (selector === snippetSelector && snippet) return visibleText(snippet)
      if (selector === 'cite') return visibleText(href)
      if (selector === '.qLRx3b' && secondaryText) {
        return visibleText(secondaryText)
      }
      if (selector === '.YrbPuc' && metadataText) {
        return visibleText(metadataText)
      }
      return null
    },
    querySelectorAll(selector) {
      const element = this.querySelector(selector)
      return element ? [element] : []
    },
  }

  return {
    href,
    textContent: platformText || title,
    parentElement: container,
    getClientRects: () => (visible ? [{}] : []),
    querySelector: (selector) => (selector === 'h3' ? heading : null),
    getAttribute: (name) => attributes[name] ?? (name === 'href' ? href : null),
    closest: () => container,
  }
}

function loadScanner(
  anchors = [],
  pageUrl = 'https://www.google.com/search?q=linkedin',
) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    console,
    window: {
      location: new URL(pageUrl),
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

test('reads the exact search session associated with each Google tab', () => {
  const firstId = '11111111-1111-4111-8111-111111111111'
  const secondId = '22222222-2222-4222-8222-222222222222'
  const firstScanner = loadScanner(
    [],
    `https://www.google.com/search?q=node&recruitmentSearchSession=${firstId}`,
  )
  const secondScanner = loadScanner(
    [],
    `https://www.google.com/search?q=react&recruitmentSearchSession=${secondId}`,
  )

  assert.equal(firstScanner.getSearchSessionId(), firstId)
  assert.equal(secondScanner.getSearchSessionId(), secondId)
})

test('rejects missing or malformed Google search session IDs', () => {
  assert.equal(loadScanner().getSearchSessionId(), null)
  assert.equal(
    loadScanner(
      [],
      'https://www.google.com/search?q=node&recruitmentSearchSession=stale',
    ).getSearchSessionId(),
    null,
  )
})

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
      'https://www.google.com/goto?url=CAESVGh0dHBzOi8vZXhhbXBsZS5jb20',
    ),
    null,
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

test('reads alternate visible Google result layouts and merges duplicate evidence', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.google.com/url?url=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fjane-doe%2F',
      title: 'Jane Doe - Senior Backend Engineer | Node.js, AWS',
      snippet: 'Feb 2023 – Jan 2025 · 2 years',
      snippetSelector: '.IsZvec',
      secondaryText: 'Riga, Latvia · Senior Backend Engineer · Example Ltd',
    }),
    resultAnchor({
      href: 'https://www.linkedin.com/in/jane-doe/?trk=second',
      title: 'Jane Doe - Backend Engineer',
      snippet: 'Skills: PostgreSQL, Docker.',
    }),
  ])

  const [result] = scanner.scanVisibleLinkedInResults()

  assert.equal(result.linkedinUrl, 'https://www.linkedin.com/in/jane-doe')
  assert.match(result.searchSnippet, /Feb 2023 – Jan 2025/)
  assert.match(result.searchSnippet, /Skills: PostgreSQL, Docker\./)
  assert.match(result.visibleSecondaryText, /Riga, Latvia/)
})

test('captures the result-local metadata layout observed on Google', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://lv.linkedin.com/in/mlipn',
      title: 'Mareks Ļipņickis - Software Engineer | Node.js | TypeScript',
      snippet:
        'Mareks Ļipņickis. Software Engineer | Node.js | TypeScript | AWS.',
      metadataText: 'Riga, Latvia · Software Engineer · Accenture Baltics',
    }),
    resultAnchor({
      href: 'https://lv.linkedin.com/in/sergejsrupainis',
      title: 'Sergejs Rupainis - Node.js · TypeScript · AWS · Kafka',
      snippet:
        'Senior Software Engineer with 14+ years of experience, focused on backend development with Node.js, TypeScript, React, Kafka and PostgreSQL.',
      metadataText:
        'Riga, Latvia · Senior Software Engineer · Ness Digital Engineering Riga',
    }),
  ])
  const [mareks, sergejs] = scanner.scanVisibleLinkedInResults()

  assert.equal(mareks.sourceUrl, 'https://lv.linkedin.com/in/mlipn')
  assert.match(mareks.visibleSecondaryText, /Accenture Baltics/)
  assert.match(sergejs.visibleSecondaryText, /Ness Digital Engineering Riga/)
  assert.doesNotMatch(mareks.visibleSecondaryText, /Ness Digital/)
  assert.doesNotMatch(sergejs.visibleSecondaryText, /Accenture/)
})

test('does not borrow metadata from another or misleading result', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.linkedin.com/in/complete-person',
      title: 'Complete Person - Backend Engineer',
      metadataText: 'Riga, Latvia · Backend Engineer · Example Ltd',
    }),
    resultAnchor({
      href: 'https://www.linkedin.com/in/sparse-person',
      title: 'Sparse Person - Software Engineer',
      snippet: 'Search results mention Node.js roles in Riga.',
    }),
  ])
  const sparse = scanner
    .scanVisibleLinkedInResults()
    .find((candidate) => candidate.fullName === 'Sparse Person')

  assert.doesNotMatch(sparse.visibleSecondaryText, /Example Ltd|Riga, Latvia/)
  assert.equal(sparse.searchSnippet, 'Search results mention Node.js roles in Riga.')
})

test('uses a verifiable LinkedIn URL exposed in an opaque result attribute', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.google.com/goto?url=opaque-token',
      attributes: {
        'data-url': 'https://lv.linkedin.com/in/jane-doe/?trk=google',
      },
      title: 'Jane Doe - Backend Engineer | Node.js',
      platformText: 'Jane Doe - Backend Engineer LinkedIn · Jane Doe',
      snippet: 'Riga, Latvia · Backend Engineer · Example Ltd',
    }),
  ])

  const [result] = scanner.scanVisibleLinkedInResults()

  assert.equal(result.linkedinUrl, 'https://www.linkedin.com/in/jane-doe')
  assert.equal(result.requiresLinkedInUrl, false)
})

test('retains Google evidence when an opaque LinkedIn URL cannot be verified', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.google.com/goto?url=CAESopaque',
      title: 'Jane Doe - Senior Backend Engineer | Node.js, AWS',
      platformText:
        'Jane Doe - Senior Backend Engineer | Node.js, AWS LinkedIn · Jane Doe',
      snippet: 'Feb 2023 – Jan 2025 · 2 years',
      secondaryText: 'Riga, Latvia · Senior Backend Engineer · Example Ltd',
    }),
  ])

  const [result] = scanner.scanVisibleLinkedInResults()

  assert.equal(result.linkedinUrl, null)
  assert.equal(result.requiresLinkedInUrl, true)
  assert.equal(result.fullName, 'Jane Doe')
  assert.match(result.resultTitle, /Senior Backend Engineer/)
  assert.match(result.searchSnippet, /Feb 2023 – Jan 2025/)
  assert.match(result.visibleSecondaryText, /Example Ltd/)
})

test('keeps only visible LinkedIn profiles and deduplicates canonical URLs', () => {
  const scanner = loadScanner([
    resultAnchor({
      href: 'https://www.linkedin.com/in/john-smith/?trk=first',
      title: 'John Smith - Backend Engineer | LinkedIn',
      snippet: 'Public professional snippet.',
      secondaryText: 'Riga, Latvia',
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
    linkedinUrl: 'https://www.linkedin.com/in/john-smith',
    sourceUrl: 'https://www.linkedin.com/in/john-smith/?trk=first',
    requiresLinkedInUrl: false,
    resultTitle: 'John Smith - Backend Engineer | LinkedIn',
    searchSnippet: 'Public professional snippet.',
    visibleSecondaryText:
      'https://www.linkedin.com/in/john-smith/?trk=first · Riga, Latvia',
    source: 'google-linkedin',
  })
})
