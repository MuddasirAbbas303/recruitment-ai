import { useState } from 'react'
import { candidatesApiUrl } from '../config/api.js'
import { openGmailCompose } from '../utils/email.js'
import LoadingLabel from './LoadingLabel.jsx'

export default function ProjectOutreachModal({ candidate, project, type, onClose, onProjectUpdated }) {
  const isEmail = type === 'email'
  const isConnect = type === 'linkedin-connect'
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle')
  const job = { role: project.title, requiredSkills: project.requiredSkills ?? [], preferredSkills: project.preferredSkills ?? [], location: project.location ?? '', description: project.description ?? '' }

  async function generate() {
    if (status === 'generating' || status === 'saving') return
    setStatus('generating')
    try {
      const endpoint = isEmail ? 'generate-outreach' : 'generate-linkedin-outreach'
      const professionalCandidate = {
        fullName: candidate.fullName,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        location: candidate.location,
        skills: candidate.skills ?? [],
        summary: candidate.summary,
        ...(isEmail ? {
          email: candidate.email,
          matchScore: Number.isFinite(candidate.matchScore) ? candidate.matchScore : null,
          matchAnalysis: candidate.matchAnalysis ?? null,
        } : {
          linkedinUrl: candidate.linkedinUrl,
          matchAnalysis: candidate.matchAnalysis ?? null,
        }),
      }
      const response = await fetch(`${candidatesApiUrl}/${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEmail ? { candidate: professionalCandidate, job } : { type, candidate: professionalCandidate, job }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (isEmail) setSubject(result.subject)
      setMessage(isEmail ? result.body : result.message)
      setStatus('generated')
    } catch { setStatus('error') }
  }

  async function markSent() {
    if (status === 'saving' || status === 'generating') return
    setStatus('saving')
    const activityType = isEmail ? 'EMAIL_SENT' : isConnect ? 'LINKEDIN_CONNECT_SENT' : 'LINKEDIN_MESSAGE_SENT'
    try {
      const response = await fetch(`${candidatesApiUrl}/${candidate.id}/activities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activityType, channel: isEmail ? 'email' : 'linkedin', message: message.trim() || null, metadata: {}, projectId: project.id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onProjectUpdated(result.projectCandidate)
      setStatus('sent')
    } catch { setStatus('error') }
  }

  async function copy() {
    await navigator.clipboard.writeText(message)
    setStatus('copied')
  }

  function openGmail() {
    const opened = openGmailCompose({
      to: candidate.email,
      subject,
      body: message,
    })
    setStatus(opened ? 'gmail-opened' : 'gmail-error')
  }

  const tooLong = isConnect && message.length > 250
  return <div className="outreach-backdrop"><section className="outreach-panel" role="dialog" aria-modal="true" aria-labelledby="project-outreach-title">
    <div className="outreach-heading"><div><h3 id="project-outreach-title">{isEmail ? 'Email Outreach' : isConnect ? 'Connection Request' : 'LinkedIn Message'}</h3><p>{candidate.fullName} · {project.title}</p></div><button type="button" onClick={onClose}>×</button></div>
    {isEmail && <label className="outreach-field">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>}
    <label className="outreach-field">Message<textarea rows="10" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    {isConnect && <p className={tooLong ? 'outreach-message error' : ''}>{message.length} / 250</p>}
    {status === 'error' && <p className="outreach-message error">Unable to complete outreach action.</p>}
    {status === 'gmail-error' && <p className="outreach-message error">Unable to open Gmail. Please allow pop-ups for this site.</p>}
    {status === 'generated' && <p className="outreach-message success">Outreach generated. No status was changed.</p>}
    {status === 'sent' && <p className="outreach-message success">Outreach marked as sent.</p>}
    <div className="outreach-actions"><button type="button" onClick={generate} disabled={status === 'generating' || status === 'saving'}>{status === 'generating' ? <LoadingLabel>Generating...</LoadingLabel> : 'Generate with AI'}</button>
      {isEmail ? <button type="button" disabled={!candidate.email} onClick={openGmail}>Open in Gmail</button> : <><button type="button" disabled={!message || tooLong} onClick={copy}>{status === 'copied' ? 'Copied' : 'Copy Message'}</button><a href={candidate.linkedinUrl} target="_blank" rel="noreferrer">Open LinkedIn Profile</a></>}
      <button type="button" onClick={markSent} disabled={status === 'saving' || status === 'generating' || tooLong}>{status === 'saving' ? <LoadingLabel>Marking...</LoadingLabel> : 'Mark as Sent'}</button><button type="button" onClick={onClose}>Cancel</button></div>
  </section></div>
}
