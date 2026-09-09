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
  if (message?.type !== 'IMPORT_CANDIDATES') {
    return false
  }

  fetch(recruitmentApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      candidates: message.candidates,
      ...(message.criteria && { criteria: message.criteria }),
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
