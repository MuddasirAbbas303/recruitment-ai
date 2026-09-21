const statusElement = document.querySelector('#status')
const countElement = document.querySelector('#count')
const profilesElement = document.querySelector('#profiles')
const selectionActionsElement = document.querySelector('#selection-actions')
const selectAllButton = document.querySelector('#select-all')
const clearButton = document.querySelector('#clear')
const importButton = document.querySelector('#import-selected')

let candidates = []

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
  importButton.disabled = selectedCandidates().length === 0
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
    url.textContent = formatLinkedInUrl(candidate.linkedinUrl)

    details.append(name, url)
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
  const selected = selectedCandidates()

  if (selected.length === 0) {
    return
  }

  setStatus('Importing...')
  importButton.disabled = true

  const response = await chrome.runtime.sendMessage({
    type: 'IMPORT_CANDIDATES',
    candidates: selected.map((candidate) => ({
      fullName: candidate.fullName,
      linkedinUrl: candidate.linkedinUrl,
      resultTitle: candidate.resultTitle,
      searchSnippet: candidate.searchSnippet,
      visibleSecondaryText: candidate.visibleSecondaryText,
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
