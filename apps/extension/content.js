const LINKEDIN_PROFILE_PATH = /^\/in\/([^/?#]+)/i

function isGoogleSearchPage() {
  return (
    window.location.hostname === 'www.google.com' &&
    window.location.pathname === '/search'
  )
}

function isVisible(element) {
  if (!element || element.getClientRects().length === 0) {
    return false
  }

  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function extractDestinationUrl(href) {
  try {
    const url = new URL(href, window.location.href)

    if (url.hostname === 'www.google.com' && url.pathname === '/url') {
      return url.searchParams.get('q') || url.searchParams.get('url') || ''
    }

    return url.href
  } catch {
    return ''
  }
}

function normalizeLinkedInUrl(href) {
  const destinationUrl = extractDestinationUrl(href)

  try {
    const url = new URL(destinationUrl)
    const hostname = url.hostname.toLowerCase()
    const profileMatch = url.pathname.match(LINKEDIN_PROFILE_PATH)

    if (
      !profileMatch ||
      (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com'))
    ) {
      return null
    }

    return `https://www.linkedin.com/in/${profileMatch[1].toLowerCase()}`
  } catch {
    return null
  }
}

function getVisibleText(element) {
  return isVisible(element) ? element.textContent.trim() : ''
}

function findResultContainer(anchor) {
  return (
    anchor.closest('div.MjjYud') ||
    anchor.closest('div.g') ||
    anchor.closest('[data-snhf]') ||
    anchor.parentElement
  )
}

function getDisplayTitle(anchor, container) {
  return (
    getVisibleText(anchor.querySelector('h3')) ||
    getVisibleText(container?.querySelector('h3')) ||
    getVisibleText(anchor)
  )
}

function getFullName(resultTitle) {
  return resultTitle.split(/\s(?:[-|–—]|·)\s/)[0].trim()
}

function getSearchSnippet(container) {
  const snippetSelectors = [
    '.VwiC3b',
    '.IsZvec',
    '[data-sncf]',
    '[data-content-feature="1"]',
  ]

  for (const selector of snippetSelectors) {
    const snippet = getVisibleText(container?.querySelector(selector))

    if (snippet) {
      return snippet
    }
  }

  return ''
}

function getVisibleSecondaryText(container, excludedText = []) {
  const selectors = [
    'cite',
    '.qLRx3b',
    '.byrV5b',
    '.VuuXrf',
    '.MUxGbd',
  ]
  const excludedValues = new Set(
    excludedText.map((value) => value.trim()).filter(Boolean),
  )
  const values = []

  for (const selector of selectors) {
    container?.querySelectorAll?.(selector).forEach((element) => {
      const value = getVisibleText(element)

      if (
        value &&
        !excludedValues.has(value) &&
        !values.includes(value)
      ) {
        values.push(value)
      }
    })

    const fallbackElement = container?.querySelector(selector)
    const fallbackValue = getVisibleText(fallbackElement)

    if (
      fallbackValue &&
      !excludedValues.has(fallbackValue) &&
      !values.includes(fallbackValue)
    ) {
      values.push(fallbackValue)
    }
  }

  return values.join(' · ').slice(0, 2_000)
}

function scanVisibleLinkedInResults() {
  const profilesByUrl = new Map()

  document.querySelectorAll('a[href]').forEach((anchor) => {
    if (!isVisible(anchor)) {
      return
    }

    const linkedinUrl = normalizeLinkedInUrl(anchor.href)

    if (!linkedinUrl || profilesByUrl.has(linkedinUrl)) {
      return
    }

    const container = findResultContainer(anchor)
    const resultTitle = getDisplayTitle(anchor, container)
    const fullName = getFullName(resultTitle)

    if (!fullName) {
      return
    }

    const searchSnippet = getSearchSnippet(container)

    profilesByUrl.set(linkedinUrl, {
      fullName,
      linkedinUrl,
      resultTitle,
      searchSnippet,
      visibleSecondaryText: getVisibleSecondaryText(container, [
        resultTitle,
        searchSnippet,
      ]),
      source: 'google-linkedin',
    })
  })

  return [...profilesByUrl.values()]
}

globalThis.RecruitmentAiLinkedInScanner = Object.freeze({
  normalizeLinkedInUrl,
  scanVisibleLinkedInResults,
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'SCAN_LINKEDIN_RESULTS') {
    return false
  }

  if (!isGoogleSearchPage()) {
    sendResponse({ supported: false, candidates: [] })
    return false
  }

  sendResponse({
    supported: true,
    candidates: scanVisibleLinkedInResults(),
  })
  return false
})
