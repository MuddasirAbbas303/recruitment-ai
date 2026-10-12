const gmailComposeUrl = 'https://mail.google.com/mail/'

export function buildGmailComposeUrl({ to, subject = '', body = '' }) {
  const recipient = typeof to === 'string' ? to.trim() : ''

  if (!recipient) {
    return null
  }

  const url = new URL(gmailComposeUrl)
  url.searchParams.set('view', 'cm')
  url.searchParams.set('fs', '1')
  url.searchParams.set('to', recipient)
  url.searchParams.set('su', subject ?? '')
  url.searchParams.set('body', body ?? '')

  return url.toString()
}

export function openGmailCompose(values, openWindow = globalThis.window?.open) {
  const url = buildGmailComposeUrl(values)

  if (!url || typeof openWindow !== 'function') {
    return false
  }

  try {
    return openWindow(url, '_blank', 'noopener,noreferrer') !== null
  } catch {
    return false
  }
}
