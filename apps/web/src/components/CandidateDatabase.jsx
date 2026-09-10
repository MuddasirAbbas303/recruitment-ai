import { useCallback, useEffect, useState } from 'react'
import CandidateActivityPanel from './CandidateActivityPanel.jsx'
import InterviewInvitationModal from './InterviewInvitationModal.jsx'

const candidatesApiUrl = 'http://localhost:3000/api/candidates'
const candidateStatuses = [
  'SAVED',
  'SHORTLISTED',
  'CONTACTED',
  'RESPONDED',
  'INTERVIEW',
  'REJECTED',
  'HIRED',
]
const visibleSkillCount = 3
const emptyFilters = {
  search: '',
  title: '',
  skills: '',
  location: '',
  company: '',
  minExperience: '',
  maxExperience: '',
  source: '',
  status: '',
}
const candidateSources = ['linkedin', 'database', 'manual', 'csv']

function formatExperience(yearsOfExperience) {
  if (
    yearsOfExperience === null ||
    yearsOfExperience === undefined ||
    Number.isNaN(Number(yearsOfExperience))
  ) {
    return '-'
  }

  const years = Number(yearsOfExperience)
  return `${years} ${years === 1 ? 'year' : 'years'}`
}

function CandidateDatabase() {
  const [candidates, setCandidates] = useState([])
  const [loadStatus, setLoadStatus] = useState('loading')
  const [filters, setFilters] = useState(emptyFilters)
  const [hasActiveFilters, setHasActiveFilters] = useState(false)
  const [editingNotesId, setEditingNotesId] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [updatingCandidateId, setUpdatingCandidateId] = useState(null)
  const [updateError, setUpdateError] = useState(null)
  const [activityCandidate, setActivityCandidate] = useState(null)
  const [interviewCandidate, setInterviewCandidate] = useState(null)

  const loadCandidates = useCallback(async (candidateFilters = {}, signal) => {
    setLoadStatus('loading')

    const query = new URLSearchParams()

    Object.entries(candidateFilters).forEach(([field, value]) => {
      const normalizedValue = String(value).trim()

      if (normalizedValue) {
        query.set(field, normalizedValue)
      }
    })

    try {
      const requestUrl = query.size
        ? `${candidatesApiUrl}?${query.toString()}`
        : candidatesApiUrl
      const response = await fetch(requestUrl, { signal })

      if (!response.ok) {
        throw new Error('Candidate request failed')
      }

      const result = await response.json()
      setCandidates(result.candidates)
      setLoadStatus('success')
    } catch (error) {
      if (error.name !== 'AbortError') {
        setLoadStatus('error')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    loadCandidates({}, controller.signal)

    return () => controller.abort()
  }, [loadCandidates])

  function handleFilterChange(event) {
    const { name, value } = event.target

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value,
    }))
  }

  function applyFilters(event) {
    event.preventDefault()
    setEditingNotesId(null)
    setUpdateError(null)
    setHasActiveFilters(
      Object.values(filters).some((value) => String(value).trim() !== ''),
    )
    loadCandidates(filters)
  }

  function loadAllCandidates() {
    setFilters(emptyFilters)
    setHasActiveFilters(false)
    setEditingNotesId(null)
    setUpdateError(null)
    loadCandidates()
  }

  async function patchCandidate(candidateId, updates) {
    const response = await fetch(`${candidatesApiUrl}/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Unable to update candidate.')
    }

    setCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId ? result.candidate : candidate,
      ),
    )

    return result.candidate
  }

  async function handleStatusChange(candidateId, status) {
    setUpdatingCandidateId(candidateId)
    setUpdateError(null)

    try {
      await patchCandidate(candidateId, { status })
    } catch {
      setUpdateError('Unable to update candidate status.')
    } finally {
      setUpdatingCandidateId(null)
    }
  }

  function startEditingNotes(candidate) {
    setEditingNotesId(candidate.id)
    setNotesDraft(candidate.notes ?? '')
    setUpdateError(null)
  }

  function cancelEditingNotes() {
    setEditingNotesId(null)
    setNotesDraft('')
    setUpdateError(null)
  }

  async function saveNotes(candidateId) {
    setUpdatingCandidateId(candidateId)
    setUpdateError(null)

    try {
      await patchCandidate(candidateId, { notes: notesDraft })
      setEditingNotesId(null)
      setNotesDraft('')
    } catch {
      setUpdateError('Unable to update candidate notes.')
    } finally {
      setUpdatingCandidateId(null)
    }
  }

  return (
    <section
      className="candidate-database card"
      aria-labelledby="candidate-database-title"
    >
      <div className="database-heading">
        <div>
          <h3 id="candidate-database-title">Candidate Database</h3>
          <p>Review and manage candidates saved by your recruitment team.</p>
        </div>
      </div>

      <form className="candidate-filters" onSubmit={applyFilters}>
        <div className="candidate-filter-grid">
          <label>
            Search
            <input
              type="search"
              name="search"
              value={filters.search}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Role / Title
            <input
              type="text"
              name="title"
              value={filters.title}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Skills
            <input
              type="text"
              name="skills"
              value={filters.skills}
              placeholder="Node.js, AWS, React"
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Location
            <input
              type="text"
              name="location"
              value={filters.location}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Company
            <input
              type="text"
              name="company"
              value={filters.company}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Minimum Experience
            <input
              type="number"
              name="minExperience"
              min="0"
              step="0.5"
              value={filters.minExperience}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Maximum Experience
            <input
              type="number"
              name="maxExperience"
              min="0"
              step="0.5"
              value={filters.maxExperience}
              onChange={handleFilterChange}
            />
          </label>
          <label>
            Source
            <select
              name="source"
              value={filters.source}
              onChange={handleFilterChange}
            >
              <option value="">All</option>
              {candidateSources.map((source) => (
                <option key={source} value={source}>
                  {source.charAt(0).toUpperCase() + source.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All</option>
              {candidateStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="candidate-filter-actions">
          <button type="submit" disabled={loadStatus === 'loading'}>
            Apply Filters
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={loadAllCandidates}
            disabled={loadStatus === 'loading'}
          >
            Clear Filters
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={loadAllCandidates}
            disabled={loadStatus === 'loading'}
          >
            Show All Candidates
          </button>
        </div>
      </form>

      {updateError && (
        <p className="candidate-update-error" role="alert">
          {updateError}
        </p>
      )}

      {loadStatus === 'loading' && (
        <p className="database-state" role="status">
          Loading candidates...
        </p>
      )}

      {loadStatus === 'error' && (
        <p className="database-state error" role="alert">
          Unable to load candidates.
        </p>
      )}

      {loadStatus === 'success' && (
        <p className="candidate-result-count" role="status">
          {candidates.length}{' '}
          {candidates.length === 1 ? 'candidate' : 'candidates'} found
        </p>
      )}

      {loadStatus === 'success' && candidates.length === 0 && (
        <p className="database-state">
          {hasActiveFilters
            ? 'No candidates match these filters.'
            : 'No candidates saved yet.'}
        </p>
      )}

      {loadStatus === 'success' && candidates.length > 0 && (
        <div className="candidate-table-wrapper">
          <table className="candidate-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Current Title</th>
                <th scope="col">Current Company</th>
                <th scope="col">Location</th>
                <th scope="col">Experience</th>
                <th scope="col">Skills</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
                <th scope="col">Notes</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const visibleSkills = candidate.skills.slice(
                  0,
                  visibleSkillCount,
                )
                const remainingSkills =
                  candidate.skills.length - visibleSkills.length
                const isUpdating = updatingCandidateId === candidate.id
                const isEditingNotes = editingNotesId === candidate.id

                return (
                  <tr key={candidate.id}>
                    <td className="candidate-name-cell">
                      {candidate.fullName}
                    </td>
                    <td>{candidate.currentTitle || '-'}</td>
                    <td>{candidate.currentCompany || '-'}</td>
                    <td>{candidate.location || '-'}</td>
                    <td>{formatExperience(candidate.yearsOfExperience)}</td>
                    <td>
                      {candidate.skills.length > 0 ? (
                        <div
                          className="skill-tags"
                          aria-label={`Skills for ${candidate.fullName}`}
                        >
                          {visibleSkills.map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                          {remainingSkills > 0 && (
                            <span className="remaining-skills">
                              +{remainingSkills}
                            </span>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{candidate.source || '-'}</td>
                    <td>
                      <select
                        className="status-select"
                        value={candidate.status}
                        aria-label={`Status for ${candidate.fullName}`}
                        disabled={isUpdating}
                        onChange={(event) =>
                          handleStatusChange(candidate.id, event.target.value)
                        }
                      >
                        {candidateStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="notes-cell">
                      {isEditingNotes ? (
                        <div className="notes-editor">
                          <textarea
                            rows="4"
                            value={notesDraft}
                            aria-label={`Notes for ${candidate.fullName}`}
                            onChange={(event) =>
                              setNotesDraft(event.target.value)
                            }
                          />
                          <div>
                            <button
                              type="button"
                              onClick={() => saveNotes(candidate.id)}
                              disabled={isUpdating}
                            >
                              {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingNotes}
                              disabled={isUpdating}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="notes-display">
                          <span>{candidate.notes || '-'}</span>
                          <button
                            type="button"
                            onClick={() => startEditingNotes(candidate)}
                          >
                            Edit Notes
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="candidate-actions">
                        {candidate.linkedinUrl ? (
                          <a
                            href={candidate.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Profile
                          </a>
                        ) : (
                          <button type="button" disabled>
                            View Profile
                          </button>
                        )}

                        {candidate.email ? (
                          <a href={`mailto:${candidate.email}`}>Email</a>
                        ) : (
                          <button type="button" disabled>
                            Email
                          </button>
                        )}

                        <button
                          type="button"
                          disabled
                          title="LinkedIn integration coming later"
                        >
                          LinkedIn Message
                        </button>
                        <button
                          type="button"
                          disabled
                          title="LinkedIn integration coming later"
                        >
                          Connect
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivityCandidate(candidate)}
                        >
                          Activity
                        </button>
                        <button
                          type="button"
                          disabled={!candidate.email}
                          title={
                            candidate.email
                              ? undefined
                              : 'Candidate email is required'
                          }
                          onClick={() => setInterviewCandidate(candidate)}
                        >
                          Invite to Interview
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activityCandidate && (
        <CandidateActivityPanel
          candidate={activityCandidate}
          onClose={() => setActivityCandidate(null)}
        />
      )}

      {interviewCandidate && (
        <InterviewInvitationModal
          candidate={interviewCandidate}
          onCandidateUpdated={(savedCandidate) => {
            setCandidates((currentCandidates) =>
              currentCandidates.map((candidate) =>
                candidate.id === savedCandidate.id
                  ? savedCandidate
                  : candidate,
              ),
            )
            setInterviewCandidate(savedCandidate)
          }}
          onClose={() => setInterviewCandidate(null)}
        />
      )}
    </section>
  )
}

export default CandidateDatabase
