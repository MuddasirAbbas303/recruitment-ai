import { useState } from 'react'

const candidatesApiUrl = 'http://localhost:3000/api/candidates'
const durationOptions = [30, 45, 60, 90]
const meetingTypes = ['Video Call', 'Phone', 'On-site']

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function getCalendarFilename(contentDisposition) {
  const filenameMatch = contentDisposition?.match(
    /filename=(?:"([^"]+)"|([^;]+))/i,
  )

  return (
    filenameMatch?.[1]?.trim() ||
    filenameMatch?.[2]?.trim() ||
    'interview.ics'
  )
}

function buildMailtoUrl(email, subject, body) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function InterviewInvitationModal({ candidate, job, onClose, onCandidateUpdated }) {
  const [interview, setInterview] = useState({
    title: `Interview - ${candidate.fullName}`,
    date: '',
    time: '',
    timezone: getDefaultTimezone(),
    durationMinutes: 60,
    meetingType: 'Video Call',
    meetingLocation: '',
    notes: '',
  })
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [generationStatus, setGenerationStatus] = useState('idle')
  const [calendarStatus, setCalendarStatus] = useState('idle')
  const [invitationStatus, setInvitationStatus] = useState('idle')
  const [validationError, setValidationError] = useState(null)

  function handleInterviewChange(event) {
    const { name, value } = event.target

    setInterview((currentInterview) => ({
      ...currentInterview,
      [name]: name === 'durationMinutes' ? Number(value) : value,
    }))
    setValidationError(null)
  }

  function buildRequest() {
    return {
      candidate: {
        fullName: candidate.fullName,
        email: candidate.email,
        currentTitle: candidate.currentTitle,
      },
      interview: {
        ...interview,
        meetingLocation: interview.meetingLocation.trim() || null,
        notes: interview.notes.trim() || null,
      },
      ...(job && { job }),
    }
  }

  function hasRequiredFields() {
    if (!candidate.email) {
      setValidationError('Candidate email is required.')
      return false
    }

    if (
      !interview.title.trim() ||
      !interview.date ||
      !interview.time ||
      !interview.timezone.trim() ||
      !interview.durationMinutes
    ) {
      setValidationError('Complete all required interview fields.')
      return false
    }

    return true
  }

  async function generateInvitation() {
    if (!hasRequiredFields()) {
      return
    }

    setGenerationStatus('generating')
    setValidationError(null)

    try {
      const response = await fetch(
        `${candidatesApiUrl}/generate-interview-invitation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequest()),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to generate invitation.')
      }

      setSubject(result.subject)
      setBody(result.body)
      setGenerationStatus('success')
    } catch (error) {
      setValidationError(error.message)
      setGenerationStatus('error')
    }
  }

  async function downloadCalendarInvite() {
    if (!hasRequiredFields()) {
      return
    }

    setCalendarStatus('downloading')
    setValidationError(null)

    try {
      const request = buildRequest()
      const response = await fetch(`${candidatesApiUrl}/interview-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: request.candidate,
          interview: request.interview,
          description: body.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'Unable to create calendar invite.')
      }

      const calendar = await response.blob()
      const downloadUrl = URL.createObjectURL(calendar)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = getCalendarFilename(
        response.headers.get('Content-Disposition'),
      )
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
      setCalendarStatus('success')
    } catch (error) {
      setValidationError(error.message)
      setCalendarStatus('error')
    }
  }

  async function markAsInvited() {
    if (!hasRequiredFields()) {
      return
    }

    setInvitationStatus('saving')
    setValidationError(null)

    try {
      const response = await fetch(
        `${candidatesApiUrl}/${candidate.id}/activities`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'INTERVIEW_INVITED',
            channel: 'manual',
            message: body.trim() || null,
            metadata: {
              interviewTitle: interview.title.trim(),
              date: interview.date,
              time: interview.time,
              timezone: interview.timezone.trim(),
              durationMinutes: interview.durationMinutes,
              meetingType: interview.meetingType,
              meetingLocation: interview.meetingLocation.trim() || null,
            },
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to record invitation.')
      }

      onCandidateUpdated(result.candidate)
      setInvitationStatus('success')
    } catch (error) {
      setValidationError(error.message)
      setInvitationStatus('error')
    }
  }

  return (
    <div className="outreach-backdrop">
      <section
        className="outreach-panel interview-invitation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-invitation-title"
      >
        <div className="outreach-heading">
          <div>
            <h3 id="interview-invitation-title">Interview Invitation</h3>
            <p>Prepare the invitation before explicitly recording it.</p>
          </div>
          <button
            type="button"
            className="outreach-close"
            aria-label="Close interview invitation"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="interview-form-grid">
          <label>
            Candidate
            <input type="text" value={candidate.fullName} readOnly />
          </label>
          <label>
            Candidate Email
            <input type="email" value={candidate.email ?? ''} readOnly />
          </label>
          <label className="interview-full-width">
            Interview Title
            <input
              type="text"
              name="title"
              value={interview.title}
              required
              onChange={handleInterviewChange}
            />
          </label>
          <label>
            Date
            <input
              type="date"
              name="date"
              value={interview.date}
              required
              onChange={handleInterviewChange}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              name="time"
              value={interview.time}
              required
              onChange={handleInterviewChange}
            />
          </label>
          <label>
            Timezone
            <input
              type="text"
              name="timezone"
              value={interview.timezone}
              required
              onChange={handleInterviewChange}
            />
          </label>
          <label>
            Duration
            <select
              name="durationMinutes"
              value={interview.durationMinutes}
              onChange={handleInterviewChange}
            >
              {durationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Meeting Type
            <select
              name="meetingType"
              value={interview.meetingType}
              onChange={handleInterviewChange}
            >
              {meetingTypes.map((meetingType) => (
                <option key={meetingType} value={meetingType}>
                  {meetingType}
                </option>
              ))}
            </select>
          </label>
          <label>
            Meeting Link / Location
            <input
              type="text"
              name="meetingLocation"
              value={interview.meetingLocation}
              onChange={handleInterviewChange}
            />
          </label>
          <label className="interview-full-width">
            Additional Notes
            <textarea
              rows="3"
              name="notes"
              value={interview.notes}
              onChange={handleInterviewChange}
            />
          </label>
        </div>

        <button
          type="button"
          className="interview-generate-button"
          disabled={generationStatus === 'generating'}
          onClick={generateInvitation}
        >
          {generationStatus === 'generating'
            ? 'Generating...'
            : 'Generate Invitation with AI'}
        </button>

        <label className="outreach-field">
          Subject
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <label className="outreach-field">
          Message
          <textarea
            rows="10"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        {validationError && (
          <p className="outreach-message error" role="alert">
            {validationError}
          </p>
        )}
        {generationStatus === 'success' && (
          <p className="outreach-message success" role="status">
            Invitation generated.
          </p>
        )}
        {calendarStatus === 'success' && (
          <p className="outreach-message success" role="status">
            Calendar invite downloaded.
          </p>
        )}
        {invitationStatus === 'success' && (
          <p className="outreach-message success" role="status">
            Candidate marked as invited.
          </p>
        )}

        <div className="outreach-actions interview-actions">
          <a href={buildMailtoUrl(candidate.email, subject, body)}>
            Open in Email App
          </a>
          <button
            type="button"
            disabled={calendarStatus === 'downloading'}
            onClick={downloadCalendarInvite}
          >
            {calendarStatus === 'downloading'
              ? 'Downloading...'
              : 'Download Calendar Invite'}
          </button>
          <button
            type="button"
            disabled={invitationStatus === 'saving'}
            onClick={markAsInvited}
          >
            {invitationStatus === 'saving'
              ? 'Marking...'
              : 'Mark as Invited'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  )
}

export default InterviewInvitationModal
