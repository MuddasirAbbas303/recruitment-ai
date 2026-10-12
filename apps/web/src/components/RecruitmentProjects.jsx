import { useCallback, useEffect, useState } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { apiUrl } from '../config/api.js'
import { emptyProjectForm, getProjectAnalysisLabel, moveProjectCandidateLocally, projectStages, projectToForm, projectToPayload } from '../utils/recruitmentProjects.js'
import CandidateDetailsPanel from './CandidateDetailsPanel.jsx'
import CandidateActivityPanel from './CandidateActivityPanel.jsx'
import InterviewInvitationModal from './InterviewInvitationModal.jsx'
import ProjectOutreachModal from './ProjectOutreachModal.jsx'
import LoadingLabel from './LoadingLabel.jsx'
import { useLoadingActions } from '../hooks/useLoadingActions.js'


function CandidateCard({ link, onAnalyze, onViewDetails, onOutreach, onInterview, onActivity, isAnalyzing }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: link.id })
  const candidate = link.candidate
  return <article ref={setNodeRef} className={`kanban-card ${isDragging ? 'dragging' : ''}`} style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined} {...listeners} {...attributes}>
    <strong>{candidate.fullName}</strong><span>{candidate.currentTitle || 'Title unknown'}</span><span>{candidate.currentCompany || 'Company unknown'}</span>
    <span>{Number.isFinite(link.matchScore) ? `${link.matchScore}% match` : 'Not analyzed'}</span>
    <small>{link.lastActivityAt ? `Last activity ${new Date(link.lastActivityAt).toLocaleDateString()}` : 'No activity yet'}</small>
    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onViewDetails(link)}>View Details</button>
    <button type="button" disabled={!candidate.email} onPointerDown={(event) => event.stopPropagation()} onClick={() => onOutreach(link, 'email')}>Email</button>
    <button type="button" disabled={!candidate.linkedinUrl} onPointerDown={(event) => event.stopPropagation()} onClick={() => onOutreach(link, 'linkedin-message')}>LinkedIn Message</button>
    <button type="button" disabled={!candidate.linkedinUrl} onPointerDown={(event) => event.stopPropagation()} onClick={() => onOutreach(link, 'linkedin-connect')}>Connect</button>
    <button type="button" disabled={!candidate.email} onPointerDown={(event) => event.stopPropagation()} onClick={() => onInterview(link)}>Invite to Interview</button>
    <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => onActivity(link)}>Activity</button>
    <button type="button" disabled={isAnalyzing} onPointerDown={(event) => event.stopPropagation()} onClick={() => onAnalyze(link)}>{isAnalyzing ? <LoadingLabel>{getProjectAnalysisLabel(Number.isFinite(link.matchScore), true)}</LoadingLabel> : getProjectAnalysisLabel(Number.isFinite(link.matchScore), false)}</button>
    {isAnalyzing && <small role="status">AI analysis in progress...</small>}
  </article>
}

function Column({ stage, links, onSource, onAnalyze, onViewDetails, onOutreach, onInterview, onActivity, isAnalyzing }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return <section ref={setNodeRef} className={`kanban-column ${isOver ? 'over' : ''}`}><header><h3>{stage}</h3><span>{links.length}</span></header>{stage === 'SOURCED' && <button className="source-project-candidates" type="button" onClick={onSource}>Source Candidates</button>}<div className="kanban-cards">{links.map((link) => <CandidateCard key={link.id} link={link} isAnalyzing={isAnalyzing(link)} onAnalyze={onAnalyze} onViewDetails={onViewDetails} onOutreach={onOutreach} onInterview={onInterview} onActivity={onActivity} />)}</div></section>
}

export default function RecruitmentProjects({ onSourceCandidates, selectedProjectId = null }) {
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [board, setBoard] = useState(null)
  const [form, setForm] = useState(emptyProjectForm)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const [detailsLink, setDetailsLink] = useState(null)
  const [outreach, setOutreach] = useState(null)
  const [interviewLink, setInterviewLink] = useState(null)
  const [activityLink, setActivityLink] = useState(null)
  const loadingActions = useLoadingActions()
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor), useSensor(KeyboardSensor))

  const loadProjects = useCallback(async (selectId) => {
    const response = await fetch(apiUrl('/api/projects'))
    const result = await response.json()
    setProjects(result.projects ?? [])
    setSelectedId((current) => selectId ?? current ?? result.projects?.[0]?.id ?? null)
  }, [])
  async function loadBoard(id) {
    if (!id) { setBoard(null); return }
    const response = await fetch(apiUrl(`/api/projects/${id}/board`))
    const result = await response.json()
    if (response.ok) setBoard(result)
  }
  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => { if (selectedProjectId) setSelectedId(selectedProjectId) }, [selectedProjectId])
  useEffect(() => { loadBoard(selectedId) }, [selectedId])

  async function saveProject(event) {
    event.preventDefault()
    const target = editing ? `/api/projects/${editing}` : '/api/projects'
    const response = await fetch(apiUrl(target), { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectToPayload(form)) })
    const result = await response.json()
    if (!response.ok) { setMessage(result.error || 'Unable to save project.'); return }
    setForm(emptyProjectForm); setEditing(false); setMessage('Project saved.'); await loadProjects(result.project.id); await loadBoard(result.project.id)
  }
  async function setProjectStatus(project, status) {
    const response = await fetch(apiUrl(`/api/projects/${project.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...projectToPayload(projectToForm(project)), status }) })
    if (response.ok) { await loadProjects(project.id); await loadBoard(project.id) }
  }
  async function moveCard({ active, over }) {
    if (!over || !projectStages.includes(over.id)) return
    const previous = board.candidates
    const moving = previous.find((link) => link.id === active.id)
    if (!moving || moving.projectStatus === over.id) return
    setBoard((current) => ({ ...current, candidates: moveProjectCandidateLocally(current.candidates, active.id, over.id) }))
    const response = await fetch(apiUrl(`/api/projects/${selectedId}/candidates/${active.id}/status`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: over.id }) })
    if (!response.ok) { setBoard((current) => ({ ...current, candidates: previous })); setMessage('Move failed. The board was restored.') }
  }
  async function analyze(link) {
    const key = `${link.id}:project-analysis`
    try {
      await loadingActions.run(key, async () => {
        const response = await fetch(apiUrl(`/api/projects/${selectedId}/candidates/${link.id}/analyze`), { method: 'POST' })
        if (!response.ok) throw new Error('Unable to analyze this candidate for the project.')
        await loadBoard(selectedId)
        setMessage('Candidate analysis updated.')
      })
    } catch {
      setMessage('Unable to analyze this candidate for the project. Please try again.')
    }
  }
  async function saveCandidateDetails(candidate, changes) {
    const response = await fetch(apiUrl(`/api/candidates/${candidate.id}/details`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to update candidate details.')
    await loadBoard(selectedId)
    setDetailsLink((current) => current ? { ...current, candidate: result.candidate } : current)
  }
  function applyProjectUpdate(updatedLink) {
    if (!updatedLink) return
    setBoard((current) => ({ ...current, candidates: current.candidates.map((link) => link.id === updatedLink.id ? { ...link, projectStatus: updatedLink.status } : link) }))
  }

  const selected = projects.find((project) => project.id === selectedId)
  return <section className="projects-workspace"><div className="projects-sidebar card"><div className="section-heading"><h2>Recruitment Projects</h2><button type="button" onClick={() => { setEditing(false); setForm(emptyProjectForm) }}>New Project</button></div>{projects.map((project) => <button type="button" className={selectedId === project.id ? 'active' : ''} key={project.id} onClick={() => setSelectedId(project.id)}>{project.title}<small>{project.status}</small></button>)}</div>
    <div className="projects-main">
      <form className="card project-form" onSubmit={saveProject}><h3>{editing ? 'Edit Project' : 'Create Project'}</h3><div className="form-grid"><label>Position title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label className="full-width">Job description<textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><label>Required skills<input value={form.requiredSkills} onChange={(e) => setForm({ ...form, requiredSkills: e.target.value })} /></label><label>Preferred skills<input value={form.preferredSkills} onChange={(e) => setForm({ ...form, preferredSkills: e.target.value })} /></label><label>Minimum experience<input type="number" min="0" value={form.minimumExperience} onChange={(e) => setForm({ ...form, minimumExperience: e.target.value })} /></label><label>Maximum experience<input type="number" min="0" value={form.maximumExperience} onChange={(e) => setForm({ ...form, maximumExperience: e.target.value })} /></label><label>Keywords<input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} /></label><label>Exclude keywords<input value={form.excludeKeywords} onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })} /></label></div><button type="submit">{editing ? 'Save Project' : 'Create Project'}</button></form>
      {message && <p className="search-action-message" role="status">{message}</p>}
      {selected && board && <><div className="project-board-heading"><div><h2>{selected.title}</h2><span className={`project-status ${selected.status.toLowerCase()}`}>{selected.status}</span></div><div><button type="button" onClick={() => { setEditing(selected.id); setForm(projectToForm(selected)) }}>Edit</button><button type="button" onClick={() => setProjectStatus(selected, selected.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE')}>{selected.status === 'ACTIVE' ? 'Close Project' : 'Reopen Project'}</button></div></div><DndContext sensors={sensors} onDragEnd={moveCard}><div className="kanban-board">{projectStages.map((stage) => <Column key={stage} stage={stage} links={board.candidates.filter((link) => link.projectStatus === stage)} onSource={() => onSourceCandidates(selected)} onAnalyze={analyze} isAnalyzing={(link) => loadingActions.isLoading(`${link.id}:project-analysis`)} onViewDetails={setDetailsLink} onOutreach={(link, type) => setOutreach({ link, type })} onInterview={setInterviewLink} onActivity={setActivityLink} />)}</div></DndContext></>}
      {detailsLink && <CandidateDetailsPanel candidate={{ ...detailsLink.candidate, isSaved: true, matchScore: detailsLink.matchScore, matchAnalysis: detailsLink.matchAnalysis }} loadingActions={{ matching: loadingActions.isLoading(`${detailsLink.id}:project-analysis`) }} actions={{ onSaveDetails: saveCandidateDetails, onRerunMatching: () => analyze(detailsLink), onEmail: () => setOutreach({ link: detailsLink, type: 'email' }), onLinkedInMessage: () => setOutreach({ link: detailsLink, type: 'linkedin-message' }), onConnect: () => setOutreach({ link: detailsLink, type: 'linkedin-connect' }), onInviteInterview: () => setInterviewLink(detailsLink) }} onClose={() => setDetailsLink(null)} />}
      {outreach && selected && <ProjectOutreachModal candidate={{ ...outreach.link.candidate, matchScore: outreach.link.matchScore, matchAnalysis: outreach.link.matchAnalysis }} project={selected} type={outreach.type} onProjectUpdated={applyProjectUpdate} onClose={() => setOutreach(null)} />}
      {interviewLink && selected && <InterviewInvitationModal candidate={interviewLink.candidate} projectId={selected.id} job={{ role: selected.title, requiredSkills: selected.requiredSkills, preferredSkills: selected.preferredSkills, location: selected.location, description: selected.description }} onCandidateUpdated={() => {}} onProjectUpdated={applyProjectUpdate} onClose={() => setInterviewLink(null)} />}
      {activityLink && selected && <CandidateActivityPanel candidate={activityLink.candidate} projectId={selected.id} onClose={() => setActivityLink(null)} />}
    </div></section>
}
