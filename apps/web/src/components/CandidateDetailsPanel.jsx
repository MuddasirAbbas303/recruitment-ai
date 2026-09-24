import { useEffect, useState } from 'react'
import {
  buildCandidateDetails,
  calculateEmploymentYears,
  createCandidateDetailsDraft,
  formatEmploymentDuration,
} from '../utils/candidateDetails.js'

function Value({ children }) {
  return children === null || children === undefined || children === '' ? '-' : children
}

function List({ items, empty = 'None' }) {
  return items?.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>
}

export default function CandidateDetailsPanel({ candidate, actions = {}, onClose }) {
  const details = buildCandidateDetails(candidate)
  const analysis = details.analysis
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => createCandidateDetailsDraft(candidate))
  const [saveStatus, setSaveStatus] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) setDraft(createCandidateDetailsDraft(candidate))
  }, [candidate, editing])

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function updateEmployment(index, field, value) {
    setDraft((current) => ({
      ...current,
      employmentHistory: current.employmentHistory.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }))
  }

  function cancelEditing() {
    setDraft(createCandidateDetailsDraft(candidate))
    setEditing(false)
    setError('')
  }

  async function saveDetails() {
    const email = draft.email.trim()
    if (!draft.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    const calculatedExperience = calculateEmploymentYears(draft.employmentHistory)
    if (draft.employmentHistory.length && calculatedExperience === null) {
      setError('Enter valid employment dates using formats such as Jan 2022.')
      return
    }
    const manualExperience = draft.yearsOfExperience === ''
      ? null
      : Number(draft.yearsOfExperience)
    if (manualExperience !== null && (!Number.isFinite(manualExperience) || manualExperience < 0)) {
      setError('Years of experience must be zero or greater.')
      return
    }

    setSaveStatus('saving')
    setError('')
    try {
      await actions.onSaveDetails?.(candidate, {
        fullName: draft.fullName.trim(),
        currentTitle: draft.currentTitle.trim() || null,
        currentCompany: draft.currentCompany.trim() || null,
        location: draft.location.trim() || null,
        email: email || null,
        skills: [...new Set(draft.skills.split(',').map((skill) => skill.trim()).filter(Boolean))],
        summary: draft.summary.trim() || null,
        yearsOfExperience: calculatedExperience ?? manualExperience,
        employmentHistory: draft.employmentHistory.map((entry) => ({
          ...entry,
          title: entry.title.trim(),
          company: entry.company.trim(),
          startDate: entry.startDate.trim(),
          endDate: entry.isCurrent ? 'Present' : entry.endDate.trim(),
        })),
      })
      setEditing(false)
      setSaveStatus('saved')
    } catch (saveError) {
      setError(saveError.message || 'Unable to save candidate details.')
      setSaveStatus('idle')
    }
  }

  return (
    <div className="candidate-details-backdrop" role="presentation">
      <aside className="candidate-details-panel" role="dialog" aria-modal="true" aria-labelledby="candidate-details-title">
        <header>
          <div>
            <p className="candidate-details-eyebrow">Candidate details</p>
            <h2 id="candidate-details-title">{candidate.fullName}</h2>
          </div>
          <div className="candidate-details-header-actions">
            {!editing && <button type="button" onClick={() => setEditing(true)}>Edit Details</button>}
            <button type="button" onClick={onClose} aria-label="Close candidate details">Close</button>
          </div>
        </header>

        {error && <p className="candidate-update-error" role="alert">{error}</p>}
        {saveStatus === 'saved' && <p className="candidate-update-success" role="status">Candidate details updated.</p>}

        <section>
          <h3>Profile</h3>
          {editing ? <div className="candidate-details-edit-grid">
            <label>Full name<input value={draft.fullName} onChange={(event) => updateDraft('fullName', event.target.value)} /></label>
            <label>Current title<input value={draft.currentTitle} onChange={(event) => updateDraft('currentTitle', event.target.value)} /></label>
            <label>Current company<input value={draft.currentCompany} onChange={(event) => updateDraft('currentCompany', event.target.value)} /></label>
            <label>Location<input value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} /></label>
            <label>Email<input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} /></label>
            <label>Years of experience<input type="number" min="0" step="0.1" value={draft.yearsOfExperience} onChange={(event) => updateDraft('yearsOfExperience', event.target.value)} /></label>
            <label className="candidate-details-full-width">Skills / Technologies<input value={draft.skills} placeholder="Node.js, AWS" onChange={(event) => updateDraft('skills', event.target.value)} /></label>
            <label className="candidate-details-full-width">Professional summary<textarea rows="5" value={draft.summary} onChange={(event) => updateDraft('summary', event.target.value)} /></label>
          </div> : <dl className="candidate-details-grid">
            <div><dt>Name</dt><dd><Value>{candidate.fullName}</Value></dd></div>
            <div><dt>Current title</dt><dd><Value>{candidate.currentTitle}</Value></dd></div>
            <div><dt>Company</dt><dd><Value>{candidate.currentCompany}</Value></dd></div>
            <div><dt>Location</dt><dd><Value>{candidate.location}</Value></dd></div>
            <div><dt>Email</dt><dd><Value>{candidate.email}</Value></dd></div>
            <div><dt>LinkedIn URL</dt><dd>{candidate.linkedinUrl ? <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer">{candidate.linkedinUrl}</a> : '-'}</dd></div>
          </dl>}
          {!editing && <><h4>Skills</h4>
            <div className="skill-tags">{candidate.skills?.length ? candidate.skills.map((skill) => <span key={skill}>{skill}</span>) : '-'}</div>
            <h4>Professional summary</h4>
            <p><Value>{candidate.summary}</Value></p></>}
        </section>

        <section>
          <h3>Work experience</h3>
          {editing ? <>
            {draft.employmentHistory.map((entry, index) => <div className="candidate-employment-editor" key={index}>
              <label>Job title<input value={entry.title} onChange={(event) => updateEmployment(index, 'title', event.target.value)} /></label>
              <label>Company<input value={entry.company} onChange={(event) => updateEmployment(index, 'company', event.target.value)} /></label>
              <label>Start date<input placeholder="Jan 2022" value={entry.startDate} onChange={(event) => updateEmployment(index, 'startDate', event.target.value)} /></label>
              <label>End date<input disabled={entry.isCurrent} placeholder="Dec 2024" value={entry.isCurrent ? 'Present' : entry.endDate} onChange={(event) => updateEmployment(index, 'endDate', event.target.value)} /></label>
              <label className="candidate-current-employment"><input type="checkbox" checked={entry.isCurrent} onChange={(event) => updateEmployment(index, 'isCurrent', event.target.checked)} />Current employment</label>
              {entry.sourceUrl && <p>Existing verified source: <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.sourceUrl}</a></p>}
              <button type="button" onClick={() => updateDraft('employmentHistory', draft.employmentHistory.filter((_, entryIndex) => entryIndex !== index))}>Remove entry</button>
            </div>)}
            <button type="button" onClick={() => updateDraft('employmentHistory', [...draft.employmentHistory, { title: '', company: '', startDate: '', endDate: '', isCurrent: false, sourceUrl: null }])}>Add employment entry</button>
            <p><strong>Calculated total:</strong> {calculateEmploymentYears(draft.employmentHistory) ?? 'Unknown'} years</p>
          </> : candidate.employmentHistory?.length ? candidate.employmentHistory.map((entry, index) => (
            <article className="candidate-experience-entry" key={`${entry.title || entry.jobTitle}-${entry.company}-${index}`}>
              <strong>{entry.title || entry.jobTitle}</strong>
              <span>{entry.company}</span>
              <span>{entry.startDate} – {entry.endDate}</span>
              <span>{formatEmploymentDuration(entry)}</span>
              {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer">Supporting source</a>}
            </article>
          )) : <p>No verified employment history available.</p>}
          <p><strong>Total verified experience:</strong>{' '}{Number.isFinite(candidate.yearsOfExperience) ? `${candidate.yearsOfExperience} years` : 'Unknown'}</p>
        </section>

        {!editing && Object.keys(candidate.fieldOrigins ?? {}).length > 0 && (
          <section>
            <h3>Information origin</h3>
            <p>Fields marked <strong>Manual</strong> were entered or approved by a recruiter. Supporting evidence links remain listed separately.</p>
            <div className="candidate-origin-tags">{Object.entries(candidate.fieldOrigins).map(([field, origin]) => <span key={field}>{field}: {origin === 'manual' ? 'Manual' : origin}</span>)}</div>
          </section>
        )}

        <section>
          <h3>AI match analysis</h3>
          <p><strong>Match:</strong>{' '}{Number.isFinite(candidate.matchScore) ? `${candidate.matchScore}% — ${details.recommendation}` : 'Insufficient information'}</p>
          <p><strong>Evidence coverage:</strong>{' '}{details.coverage ? `${details.coverage.percentage}%` : 'Unknown'}</p>
          <p><strong>Assessment:</strong> {details.assessmentStatus}</p>
          <h4>Matched skills</h4><List items={analysis?.matchedSkills} />
          <h4>Required skills without evidence</h4><List items={analysis?.missingSkills} />
          <h4>Strengths</h4><List items={analysis?.strengths} />
          <h4>Concerns</h4><List items={analysis?.concerns} />
          <h4>AI summary</h4><p>{analysis?.summary || 'No match analysis available.'}</p>
        </section>

        <section>
          <h3>Missing information</h3>
          <List items={details.missing} empty="No key profile fields are missing." />
          {details.confirmedConcerns.length > 0 && <><h4>Confirmed mismatches or concerns</h4><List items={details.confirmedConcerns} /></>}
        </section>

        <section>
          <h3>Supporting evidence</h3>
          {details.evidenceUrls.length ? <ul>{details.evidenceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul> : <p>No supporting public source links available.</p>}
        </section>

        <section>
          <h3>Recruiter information</h3>
          <dl className="candidate-details-grid">
            <div><dt>Saved state</dt><dd>{candidate.isSaved ? 'Saved' : 'New'}</dd></div>
            <div><dt>Candidate status</dt><dd><Value>{candidate.status}</Value></dd></div>
            <div><dt>Recruiter notes</dt><dd><Value>{candidate.notes}</Value></dd></div>
          </dl>
        </section>

        {editing ? <footer className="candidate-details-actions">
          <button type="button" disabled={saveStatus === 'saving'} onClick={saveDetails}>{saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}</button>
          <button type="button" disabled={saveStatus === 'saving'} onClick={cancelEditing}>Cancel</button>
        </footer> : <footer className="candidate-details-actions">
          <button type="button" disabled={!actions.onAddProfileDetails} onClick={() => actions.onAddProfileDetails?.(candidate)}>Add Profile Details</button>
          <button type="button" disabled={!details.actions.enrich || !actions.onEnrich} onClick={() => actions.onEnrich?.(candidate)}>Enrich</button>
          <button type="button" disabled={!actions.onFindEmail} onClick={() => actions.onFindEmail?.(candidate)}>Find Email</button>
          {details.actions.viewLinkedIn ? <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer">View LinkedIn</a> : <button type="button" disabled>View LinkedIn</button>}
          <button type="button" disabled={!details.actions.save || !actions.onSave} onClick={() => actions.onSave?.(candidate)}>Save Candidate</button>
          <button type="button" disabled={!details.actions.email || !actions.onEmail} onClick={() => actions.onEmail?.(candidate)}>Email</button>
          <button type="button" disabled={!details.actions.linkedinMessage || !actions.onLinkedInMessage} onClick={() => actions.onLinkedInMessage?.(candidate)}>LinkedIn Message</button>
          <button type="button" disabled={!details.actions.connect || !actions.onConnect} onClick={() => actions.onConnect?.(candidate)}>Connect</button>
          <button type="button" disabled={!details.actions.inviteInterview || !actions.onInviteInterview} onClick={() => actions.onInviteInterview?.(candidate)}>Invite to Interview</button>
          <button type="button" disabled={!actions.onRerunMatching} onClick={() => actions.onRerunMatching?.(candidate)}>Re-run Candidate Matching</button>
        </footer>}
      </aside>
    </div>
  )
}
