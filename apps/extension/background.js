const recruitmentApiUrl =
  'http://localhost:3000/api/candidates/import-search-results'
const recruitmentAppUrl = 'http://localhost:5173/'

async function openRecruitmentApp(importSessionId) {
  const appUrl = new URL(recruitmentAppUrl)
  appUrl.searchParams.set('importSession', importSessionId)
  const [existingAppTab] = await chrome.tabs.query({
    url: 'http://localhost:5173/*',
  })

  if (existingAppTab) {
    await chrome.tabs.update(existingAppTab.id, {
      active: true,
      url: appUrl.href,
    })

    if (existingAppTab.windowId !== undefined) {
      await chrome.windows.update(existingAppTab.windowId, { focused: true })
    }

    return
  }

  await chrome.tabs.create({ url: appUrl.href })
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!['IMPORT_CANDIDATES', 'IMPORT_LINKEDIN_EXPERIENCE'].includes(message?.type)) {
    return false
  }

  if (message.type === 'IMPORT_LINKEDIN_EXPERIENCE') {
    chrome.storage.local.get('latestImportSessionId').then(async (stored) => {
      if (!stored.latestImportSessionId) {
        throw new Error('No active Recruitment AI import session')
      }
      const response = await fetch(
        `http://localhost:3000/api/candidates/import-sessions/${stored.latestImportSessionId}/linkedin-experience`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate: message.candidate }),
        },
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Experience import failed')
      await openRecruitmentApp(stored.latestImportSessionId)
      sendResponse({ ok: true, result })
    }).catch((error) => sendResponse({
      ok: false,
      error: error.message || 'Unable to update candidate experience.',
    }))
    return true
  }

  fetch(recruitmentApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidates: message.candidates,
      ...(message.searchSessionId && {
        searchSessionId: message.searchSessionId,
      }),
    }),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Import failed')
      }

      if (!result.importSessionId) {
        throw new Error('Import session was not created')
      }

      await chrome.storage.local.set({
        latestImportSessionId: result.importSessionId,
      })
      await openRecruitmentApp(result.importSessionId)
      sendResponse({ ok: true, result })
    })
    .catch(() => {
      sendResponse({
        ok: false,
        error: 'Unable to import candidates into Recruitment AI.',
      })
    })

  return true
})
