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

function getFullName(displayTitle) {
  return displayTitle.split(/\s(?:[-|–—]|·)\s/)[0].trim()
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

function getSecondaryText(container) {
  const selectors = ['cite', '.qLRx3b', '.byrV5b']

  for (const selector of selectors) {
    const secondaryText = getVisibleText(container?.querySelector(selector))

    if (secondaryText) {
      return secondaryText
    }
  }

  return ''
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
    const displayTitle = getDisplayTitle(anchor, container)
    const fullName = getFullName(displayTitle)

    if (!fullName) {
      return
    }

    profilesByUrl.set(linkedinUrl, {
      fullName,
      displayTitle,
      linkedinUrl,
      searchSnippet: getSearchSnippet(container),
      secondaryText: getSecondaryText(container),
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
