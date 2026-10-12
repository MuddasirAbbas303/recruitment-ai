import { useState } from 'react'
import { candidatesApiUrl } from '../config/api.js'
import LoadingLabel from './LoadingLabel.jsx'

function CandidateEmailDiscoveryModal({
  candidate,
  importSessionId,
  onConfirmed,
  onClose,
}) {
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  async function findEmail() {
    if (status === 'searching' || status === 'confirming') return
    setStatus('searching')
    setError('')
    try {
      const response = await fetch(`${candidatesApiUrl}/find-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          candidate: {
            id: candidate.id,
            fullName: candidate.fullName,
            currentTitle: candidate.currentTitle ?? null,
            currentCompany: candidate.currentCompany ?? null,
            location: candidate.location ?? null,
            yearsOfExperience: candidate.yearsOfExperience ?? null,
            skills: candidate.skills ?? [],
            summary: candidate.summary ?? null,
            email: candidate.email ?? null,
            linkedinUrl: candidate.linkedinUrl ?? null,
            githubUrl: candidate.githubUrl ?? null,
            portfolioUrl: candidate.portfolioUrl ?? null,
            professionalUrls: candidate.professionalUrls ?? [],
            isSaved: Boolean(candidate.isSaved),
            source: candidate.source ?? null,
          },
          ...(importSessionId ? { importSessionId } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to find email.')
      setPreview(result)
      setStatus('preview')
    } catch (requestError) {
      setError(requestError.message || 'Unable to find email.')
      setStatus('error')
    }
  }

  async function confirmEmail() {
    if (status === 'confirming' || status === 'searching') return
    setStatus('confirming')
    setError('')
    try {
      const response = await fetch(`${candidatesApiUrl}/find-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          previewId: preview.previewId,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to confirm email.')
      onConfirmed(result.candidate)
      onClose()
    } catch (requestError) {
      setError(requestError.message || 'Unable to confirm email.')
      setStatus('error')
    }
  }

  return (
    <div className="outreach-backdrop">
      <section className="outreach-panel" role="dialog" aria-modal="true" aria-labelledby="find-email-title">
        <div className="outreach-heading">
          <div>
            <h3 id="find-email-title">Find Professional Email</h3>
            <p>Only emails explicitly published on identity-verified professional pages are accepted.</p>
          </div>
          <button type="button" className="outreach-close" aria-label="Close email discovery" onClick={onClose}>×</button>
        </div>

        <dl className="outreach-recipient">
          <div><dt>Candidate</dt><dd>{candidate.fullName}</dd></div>
          <div><dt>Current Email</dt><dd>{candidate.email || '-'}</dd></div>
        </dl>

        {preview && (
          <div className="email-discovery-preview">
            <p><strong>Discovered email</strong><br />{preview.email}</p>
            <p><strong>Supporting public source</strong><br /><a href={preview.sourceUrl} target="_blank" rel="noreferrer">{preview.sourceUrl}</a></p>
            {preview.replacesExisting && <p className="outreach-message error">Confirming will replace the existing email.</p>}
          </div>
        )}
        {error && <p className="outreach-message error" role="alert">{error}</p>}

        <div className="outreach-actions">
          {!preview ? (
            <button type="button" className="outreach-generate" disabled={status === 'searching'} onClick={findEmail}>
              {status === 'searching' ? <LoadingLabel>Searching...</LoadingLabel> : 'Find Verified Email'}
            </button>
          ) : (
            <button type="button" className="outreach-generate" disabled={status === 'confirming'} onClick={confirmEmail}>
              {status === 'confirming' ? <LoadingLabel>Confirming...</LoadingLabel> : 'Confirm Email'}
            </button>
          )}
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  )
}

export default CandidateEmailDiscoveryModal
