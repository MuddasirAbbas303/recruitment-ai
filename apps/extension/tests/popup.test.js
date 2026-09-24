import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const popupScript = readFileSync(
  new URL('../popup.js', import.meta.url),
  'utf8',
)

function stubElement() {
  return {
    dataset: {},
    disabled: false,
    hidden: false,
    textContent: '',
    addEventListener() {},
    querySelectorAll() { return [] },
    replaceChildren() {},
  }
}

function loadPopup() {
  const elements = new Map(
    [
      '#status',
      '#count',
      '#profiles',
      '#selection-actions',
      '#select-all',
      '#clear',
      '#import-selected',
    ].map((selector) => [selector, stubElement()]),
  )
  const context = vm.createContext({
    URL,
    console,
    document: {
      querySelector: (selector) => elements.get(selector),
      createElement: () => stubElement(),
    },
    chrome: {
      tabs: {
        query: async () => [{ id: 1, url: 'about:blank' }],
        sendMessage: async () => ({ supported: false, candidates: [] }),
      },
      runtime: { sendMessage: async () => ({ ok: true, result: { results: [] } }) },
    },
  })

  vm.runInContext(popupScript, context)
  return context.RecruitmentAiPopup
}

test('normalizes manually supplied LinkedIn profile URLs', () => {
  const popup = loadPopup()

  assert.equal(
    popup.normalizeManualLinkedInUrl(
      'https://lv.linkedin.com/in/Jane-Doe/?trk=manual',
    ),
    'https://www.linkedin.com/in/jane-doe',
  )
})

test('rejects invalid manually supplied URLs', () => {
  const popup = loadPopup()

  assert.equal(
    popup.normalizeManualLinkedInUrl('https://linkedin.com/company/example'),
    null,
  )
  assert.equal(
    popup.normalizeManualLinkedInUrl('https://example.com/in/jane-doe'),
    null,
  )
  assert.equal(popup.normalizeManualLinkedInUrl('not a URL'), null)
})

test('deduplicates manual profiles and merges complementary evidence', () => {
  const popup = loadPopup()
  const candidates = popup.mergeCandidatesForImport([
    {
      fullName: 'Jane Doe',
      linkedinUrl: 'https://www.linkedin.com/in/jane-doe/',
      resultTitle: 'Jane Doe - Backend Engineer',
      searchSnippet: 'Riga, Latvia.',
      visibleSecondaryText: '',
    },
    {
      fullName: 'Jane Doe',
      linkedinUrl: 'https://lv.linkedin.com/in/JANE-DOE?trk=second',
      resultTitle: 'Jane Doe - Senior Backend Engineer | Node.js',
      searchSnippet: 'Feb 2023 – Jan 2025.',
      visibleSecondaryText: 'Example Ltd',
    },
  ])

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].linkedinUrl, 'https://www.linkedin.com/in/jane-doe')
  assert.match(candidates[0].searchSnippet, /Riga, Latvia/)
  assert.match(candidates[0].searchSnippet, /Feb 2023 – Jan 2025/)
  assert.match(candidates[0].visibleSecondaryText, /Example Ltd/)
})
