import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../config/api.js'
import LoadingLabel from './LoadingLabel.jsx'

export default function ProjectAssignmentModal({ candidates, originatingProjectId, onClose, onAssigned }) {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(originatingProjectId ? [originatingProjectId] : [])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const assigningRef = useRef(false)

  useEffect(() => {
    fetch(apiUrl('/api/projects?status=ACTIVE'))
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        setProjects(result.projects)
        setStatus('ready')
      })
      .catch(() => { setError('Unable to load active projects.'); setStatus('error') })
  }, [])

  function toggle(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function assign() {
    if (assigningRef.current) return
    assigningRef.current = true
    setStatus('saving')
    setError('')
    try {
      const response = await fetch(apiUrl('/api/projects/assign-candidates'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: selected,
          candidateIds: candidates.filter((candidate) => candidate.isSaved).map((candidate) => candidate.id),
          candidateMatches: Object.fromEntries(candidates.filter((candidate) => candidate.isSaved).map((candidate) => [candidate.id, {
            originatingProjectId: originatingProjectId ?? null,
            matchScore: Number.isFinite(candidate.matchScore) ? candidate.matchScore : null,
            matchAnalysis: candidate.matchAnalysis ?? null,
          }])),
          candidates: candidates.filter((candidate) => !candidate.isSaved).map((candidate) => ({
            candidate,
            originatingProjectId: originatingProjectId ?? null,
          })),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onAssigned(selected, projects.filter((project) => selected.includes(project.id)), result.savedCandidates ?? [])
    } catch (assignError) {
      setError(assignError.message || 'Unable to add candidates to projects.')
      setStatus('ready')
    } finally {
      assigningRef.current = false
    }
  }

  return <div className="candidate-details-backdrop" role="presentation">
    <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-assignment-title">
      <header><h2 id="project-assignment-title">Add to Projects</h2><button type="button" onClick={onClose}>Close</button></header>
      <p>Select one or more active recruitment projects.</p>
      {status === 'loading' && <p>Loading projects...</p>}
      {projects.map((project) => <label className="project-choice" key={project.id}>
        <input type="checkbox" checked={selected.includes(project.id)} onChange={() => toggle(project.id)} />
        <span><strong>{project.title}</strong><small>{project.location || 'Location not specified'}</small></span>
      </label>)}
      {status === 'ready' && projects.length === 0 && <p>No active projects available.</p>}
      {error && <p className="search-action-message error" role="alert">{error}</p>}
      <footer><button type="button" onClick={assign} disabled={!selected.length || status === 'saving'}>{status === 'saving' ? <LoadingLabel>Adding candidates...</LoadingLabel> : 'Add Candidates'}</button><button type="button" disabled={status === 'saving'} onClick={onClose}>Cancel</button></footer>
    </section>
  </div>
}
