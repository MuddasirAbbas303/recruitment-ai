const LINKEDIN_PROFILE_PATH = /^\/in\/([^/?#]+)/i

function isGoogleSearchPage() {
  return (
    window.location.hostname === 'www.google.com' &&
    window.location.pathname === '/search'
  )
}

function getSearchSessionId() {
  const value = new URLSearchParams(window.location.search).get(
    'recruitmentSearchSession',
  )

  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
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
    const hostname = url.hostname.toLowerCase()
    const isGoogleHost =
      hostname === 'google.com' || hostname.endsWith('.google.com')

    if (isGoogleHost) {
      // Google sometimes wraps result destinations in /url?q=... or /url?url=....
      // Other redirect formats (for example /goto?url=CAES...) are opaque tokens,
      // so we deliberately reject them instead of guessing their destination.
      if (url.pathname !== '/url') {
        return ''
      }

      const destination = url.searchParams.get('q') || url.searchParams.get('url')

      return destination || ''
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

function findVerifiedLinkedInUrl(anchor, container) {
  const candidateElements = [
    anchor,
    ...(container?.querySelectorAll?.(
      'a[href], [data-url], [data-href], [data-target-url]',
    ) ?? []),
  ]
  const attributeNames = [
    'href',
    'data-url',
    'data-href',
    'data-target-url',
    'ping',
  ]

  for (const element of candidateElements) {
    for (const attributeName of attributeNames) {
      const value =
        element === anchor && attributeName === 'href'
          ? anchor.href
          : element.getAttribute?.(attributeName)
      const linkedinUrl = normalizeLinkedInUrl(value)

      if (linkedinUrl) {
        return linkedinUrl
      }
    }
  }

  return null
}

function isVisibleLinkedInResult(anchor, container) {
  const visibleEvidence = [
    anchor.textContent,
    container?.textContent,
    ...['cite', '.VuuXrf', '.qLRx3b', '.byrV5b'].map(
      (selector) => container?.querySelector?.(selector)?.textContent,
    ),
  ]
    .filter(Boolean)
    .join(' ')

  return /(?:^|[\s·|])linkedin(?:$|[\s·|])/i.test(visibleEvidence)
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
    '.YrbPuc',
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

function mergeEvidenceText(...values) {
  const uniqueValues = []

  values.forEach((value) => {
    const normalizedValue = value?.replace(/\s+/g, ' ').trim()

    if (normalizedValue && !uniqueValues.includes(normalizedValue)) {
      uniqueValues.push(normalizedValue)
    }
  })

  return uniqueValues.join(' · ').slice(0, 20_000)
}

function mergeProfileEvidence(existingProfile, nextProfile) {
  const richerTitle =
    nextProfile.resultTitle.length > existingProfile.resultTitle.length
      ? nextProfile.resultTitle
      : existingProfile.resultTitle

  return {
    ...existingProfile,
    fullName:
      existingProfile.fullName,
    resultTitle: richerTitle,
    searchSnippet: mergeEvidenceText(
      existingProfile.searchSnippet,
      nextProfile.searchSnippet,
    ),
    visibleSecondaryText: mergeEvidenceText(
      existingProfile.visibleSecondaryText,
      normalizeLinkedInUrl(nextProfile.visibleSecondaryText)
        ? ''
        : nextProfile.visibleSecondaryText,
    ).slice(0, 2_000),
    sourceUrl: existingProfile.sourceUrl || nextProfile.sourceUrl || null,
  }
}

function scanVisibleLinkedInResults() {
  const profilesByIdentity = new Map()

  document.querySelectorAll('a[href]').forEach((anchor) => {
    if (!isVisible(anchor)) {
      return
    }

    const container = findResultContainer(anchor)
    const linkedinUrl = findVerifiedLinkedInUrl(anchor, container)

    if (!linkedinUrl && !isVisibleLinkedInResult(anchor, container)) {
      return
    }

    const resultTitle = getDisplayTitle(anchor, container)
    const fullName = getFullName(resultTitle)

    if (!fullName) {
      return
    }

    const searchSnippet = getSearchSnippet(container)

    const profile = {
      fullName,
      linkedinUrl,
      sourceUrl: normalizeLinkedInUrl(anchor.href)
        ? extractDestinationUrl(anchor.href)
        : linkedinUrl,
      requiresLinkedInUrl: !linkedinUrl,
      resultTitle,
      searchSnippet,
      visibleSecondaryText: getVisibleSecondaryText(container, [
        resultTitle,
        searchSnippet,
      ]),
      source: 'google-linkedin',
    }
    const identity = linkedinUrl || [
      'unverified',
      fullName.toLowerCase(),
      resultTitle.toLowerCase(),
    ].join(':')
    const existingProfile = profilesByIdentity.get(identity)

    profilesByIdentity.set(
      identity,
      existingProfile ? mergeProfileEvidence(existingProfile, profile) : profile,
    )
  })

  return [...profilesByIdentity.values()]
}

globalThis.RecruitmentAiLinkedInScanner = Object.freeze({
  getSearchSessionId,
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
    searchSessionId: getSearchSessionId(),
  })
  return false
})
