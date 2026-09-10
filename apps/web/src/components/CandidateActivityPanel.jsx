import { useEffect, useState } from 'react'
import { candidatesApiUrl } from '../config/api.js'
const activityLabels = {
  EMAIL_SENT: 'Email Sent',
  LINKEDIN_MESSAGE_SENT: 'LinkedIn Message Sent',
  LINKEDIN_CONNECT_SENT: 'LinkedIn Connection Sent',
  NOTE: 'Note',
  STATUS_CHANGED: 'Status Changed',
  INTERVIEW_INVITED: 'Interview Invited',
}

function formatActivityDate(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getActivityLabel(activity) {
  if (activity.type === 'STATUS_CHANGED' && activity.metadata?.to) {
    return `Status changed to ${activity.metadata.to}`
  }

  return activityLabels[activity.type] ?? activity.type
}

function formatInterviewDate(metadata) {
  const date = new Date(`${metadata.date}T00:00:00.000Z`)
  const dateLabel = Number.isNaN(date.getTime())
    ? metadata.date
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(date)

  return `${dateLabel}, ${metadata.time} (${metadata.timezone})`
}

function CandidateActivityPanel({ candidate, onClose }) {
  const [loadStatus, setLoadStatus] = useState('loading')
  const [activities, setActivities] = useState([])

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${candidatesApiUrl}/${candidate.id}/activities`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load activities.')
        }

        return result.activities
      })
      .then((result) => {
        setActivities(result)
        setLoadStatus('success')
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadStatus('error')
        }
      })

    return () => controller.abort()
  }, [candidate.id])

  return (
    <div className="outreach-backdrop">
      <section
        className="outreach-panel activity-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="candidate-activity-title"
      >
        <div className="outreach-heading">
          <div>
            <h3 id="candidate-activity-title">Candidate Activity</h3>
            <p>{candidate.fullName}</p>
          </div>
          <button
            type="button"
            className="outreach-close"
            aria-label="Close candidate activity"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {loadStatus === 'loading' && (
          <p className="activity-state" role="status">
            Loading activity...
          </p>
        )}
        {loadStatus === 'error' && (
          <p className="outreach-message error" role="alert">
            Unable to load candidate activity.
          </p>
        )}
        {loadStatus === 'success' && activities.length === 0 && (
          <p className="activity-state">No activity recorded yet.</p>
        )}
        {loadStatus === 'success' && activities.length > 0 && (
          <ol className="activity-timeline">
            {activities.map((activity) => (
              <li key={activity.id}>
                <time dateTime={activity.createdAt}>
                  {formatActivityDate(activity.createdAt)}
                </time>
                <strong>{getActivityLabel(activity)}</strong>
                {activity.channel && <span>{activity.channel}</span>}
                {activity.type === 'INTERVIEW_INVITED' && (
                  <div className="activity-interview-details">
                    <b>{activity.metadata.interviewTitle}</b>
                    <span>{formatInterviewDate(activity.metadata)}</span>
                    <span>{activity.metadata.durationMinutes} minutes</span>
                    <span>{activity.metadata.meetingType}</span>
                    {activity.metadata.meetingLocation && (
                      <span>{activity.metadata.meetingLocation}</span>
                    )}
                  </div>
                )}
                {activity.message && <p>{activity.message}</p>}
              </li>
            ))}
          </ol>
        )}

        <div className="outreach-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  )
}

export default CandidateActivityPanel
