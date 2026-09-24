const statusElement = document.querySelector('#status')
const countElement = document.querySelector('#count')
const profilesElement = document.querySelector('#profiles')
const selectionActionsElement = document.querySelector('#selection-actions')
const selectAllButton = document.querySelector('#select-all')
const clearButton = document.querySelector('#clear')
const importButton = document.querySelector('#import-selected')

let candidates = []
let searchSessionId = null
let pageMode = 'google'

function normalizeManualLinkedInUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    const profileMatch = url.pathname.match(/^\/in\/([^/?#]+)/i)

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

function mergeEvidenceText(...values) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))]
    .join(' · ')
}

function mergeCandidatesForImport(selected) {
  const candidatesByUrl = new Map()

  selected.forEach((candidate) => {
    const linkedinUrl = normalizeManualLinkedInUrl(candidate.linkedinUrl)

    if (!linkedinUrl) {
      return
    }

    const normalizedCandidate = { ...candidate, linkedinUrl }
    const existingCandidate = candidatesByUrl.get(linkedinUrl)

    candidatesByUrl.set(
      linkedinUrl,
      existingCandidate
        ? {
            ...existingCandidate,
            resultTitle:
              normalizedCandidate.resultTitle.length >
              existingCandidate.resultTitle.length
                ? normalizedCandidate.resultTitle
                : existingCandidate.resultTitle,
            searchSnippet: mergeEvidenceText(
              existingCandidate.searchSnippet,
              normalizedCandidate.searchSnippet,
            ),
            visibleSecondaryText: mergeEvidenceText(
              existingCandidate.visibleSecondaryText,
              normalizedCandidate.visibleSecondaryText,
            ),
          }
        : normalizedCandidate,
    )
  })

  return [...candidatesByUrl.values()]
}

function setStatus(message, state = '') {
  statusElement.textContent = message
  statusElement.dataset.state = state
}

function selectedCandidates() {
  const selectedIndexes = [...profilesElement.querySelectorAll('input:checked')]
    .map((input) => Number(input.value))

  return selectedIndexes.map((index) => candidates[index])
}

function updateImportButton() {
  const selected = selectedCandidates()
  importButton.disabled =
    selected.length === 0 || selected.some((candidate) => !candidate.linkedinUrl)
}

function formatLinkedInUrl(linkedinUrl) {
  return linkedinUrl.replace(/^https?:\/\/(www\.)?/i, '')
}

function renderCandidates() {
  profilesElement.replaceChildren()
  countElement.hidden = false
  countElement.textContent = `LinkedIn profiles found: ${candidates.length}`
  selectionActionsElement.hidden = candidates.length === 0

  candidates.forEach((candidate, index) => {
    const label = document.createElement('label')
    label.className = 'profile'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = String(index)
    checkbox.addEventListener('change', updateImportButton)

    const details = document.createElement('span')
    details.className = 'profile-details'

    const name = document.createElement('strong')
    name.textContent = candidate.fullName

    const url = document.createElement('span')

    if (candidate.linkedinUrl) {
      url.textContent = formatLinkedInUrl(candidate.linkedinUrl)
    } else {
      url.textContent = 'LinkedIn URL required'
      url.className = 'url-required'
    }

    details.append(name, url)

    if (!candidate.linkedinUrl) {
      const urlInput = document.createElement('input')
      urlInput.type = 'url'
      urlInput.placeholder = 'https://www.linkedin.com/in/profile'
      urlInput.setAttribute(
        'aria-label',
        `LinkedIn profile URL for ${candidate.fullName}`,
      )
      const validationMessage = document.createElement('small')
      validationMessage.className = 'url-validation'
      urlInput.addEventListener('input', () => {
        const normalizedUrl = normalizeManualLinkedInUrl(urlInput.value)
        candidate.linkedinUrl = normalizedUrl
        candidate.requiresLinkedInUrl = !normalizedUrl
        validationMessage.textContent =
          urlInput.value.trim() && !normalizedUrl
            ? 'Enter a valid LinkedIn profile URL'
            : ''
        url.textContent = normalizedUrl
          ? formatLinkedInUrl(normalizedUrl)
          : 'LinkedIn URL required'
        updateImportButton()
      })
      details.append(urlInput, validationMessage)
    }

    label.append(checkbox, details)
    profilesElement.append(label)
  })

  updateImportButton()
}

async function scanCurrentPage() {
  setStatus('Scanning...')

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })

  const isLinkedInProfile = /^https:\/\/([a-z]+\.)?linkedin\.com\/in\//i.test(
    activeTab?.url ?? '',
  )

  if (isLinkedInProfile) {
    try {
      const result = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'READ_LINKEDIN_EXPERIENCE',
      })
      if (!result?.candidate) throw new Error('Profile unavailable')
      pageMode = 'linkedin'
      candidates = [result.candidate]
      renderCandidates()
      profilesElement.querySelector('input')?.click()
      importButton.textContent = 'Update Candidate Experience'
      setStatus(
        result.candidate.employmentHistory.length > 0
          ? `${result.candidate.employmentHistory.length} experience entries found`
          : 'No complete visible experience entries found',
        result.candidate.employmentHistory.length > 0 ? 'success' : 'empty',
      )
      importButton.disabled = result.candidate.employmentHistory.length === 0
      return
    } catch {
      setStatus('Unable to read this LinkedIn profile. Reload it and try again.', 'error')
      return
    }
  }

  if (!activeTab?.url?.startsWith('https://www.google.com/search')) {
    setStatus('Not on a supported Google search page', 'error')
    return
  }

  try {
    const result = await chrome.tabs.sendMessage(activeTab.id, {
      type: 'SCAN_LINKEDIN_RESULTS',
    })

    if (!result?.supported) {
      setStatus('Not on a supported Google search page', 'error')
      return
    }

    candidates = result.candidates ?? []
    searchSessionId = result.searchSessionId ?? null
    renderCandidates()
    setStatus(
      candidates.length === 0
        ? 'No LinkedIn profiles found'
        : `${candidates.length} profiles found`,
      candidates.length === 0 ? 'empty' : 'success',
    )
  } catch {
    setStatus('Unable to scan this page. Reload it and try again.', 'error')
  }
}

selectAllButton.addEventListener('click', () => {
  profilesElement.querySelectorAll('input').forEach((input) => {
    input.checked = true
  })
  updateImportButton()
})

clearButton.addEventListener('click', () => {
  profilesElement.querySelectorAll('input').forEach((input) => {
    input.checked = false
  })
  updateImportButton()
})

importButton.addEventListener('click', async () => {
  if (pageMode === 'linkedin') {
    const [candidate] = candidates
    setStatus('Updating candidate experience...')
    importButton.disabled = true
    const response = await chrome.runtime.sendMessage({
      type: 'IMPORT_LINKEDIN_EXPERIENCE',
      candidate,
    })
    setStatus(
      response?.ok
        ? 'Candidate experience updated in Recruitment AI'
        : response?.error || 'Experience update failed',
      response?.ok ? 'success' : 'error',
    )
    importButton.disabled = false
    return
  }

  const selected = mergeCandidatesForImport(selectedCandidates())

  if (selected.length === 0) {
    return
  }

  setStatus('Importing...')
  importButton.disabled = true

  const response = await chrome.runtime.sendMessage({
    type: 'IMPORT_CANDIDATES',
    searchSessionId,
    candidates: selected.map((candidate) => ({
      fullName: candidate.fullName,
      linkedinUrl: candidate.linkedinUrl,
      resultTitle: candidate.resultTitle,
      searchSnippet: candidate.searchSnippet,
      visibleSecondaryText: candidate.visibleSecondaryText,
      sourceUrl: candidate.sourceUrl,
      source: 'google-linkedin',
    })),
  })

  if (!response?.ok) {
    setStatus('Import failed', 'error')
    updateImportButton()
    return
  }

  const importedResults = response.result.results ?? []
  const alreadySaved = importedResults.filter(
    (candidate) => candidate.isSaved,
  ).length
  setStatus(
    `Import successful — ${importedResults.length} profiles ready, ${alreadySaved} already saved`,
    'success',
  )
  updateImportButton()
})

scanCurrentPage()

globalThis.RecruitmentAiPopup = Object.freeze({
  mergeCandidatesForImport,
  normalizeManualLinkedInUrl,
})
