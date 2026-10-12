export const projectStages = ['SOURCED', 'SHORTLISTED', 'CONTACTED', 'RESPONDED', 'INTERVIEW', 'HIRED', 'REJECTED']

export const emptyProjectForm = { title: '', description: '', requiredSkills: '', preferredSkills: '', minimumExperience: '', maximumExperience: '', location: '', keywords: '', excludeKeywords: '', status: 'ACTIVE' }

export function projectToForm(project = emptyProjectForm) {
  return {
    title: project.title ?? '', description: project.description ?? '',
    requiredSkills: (project.requiredSkills ?? []).join(', '), preferredSkills: (project.preferredSkills ?? []).join(', '),
    minimumExperience: project.minimumExperience ?? '', maximumExperience: project.maximumExperience ?? '',
    location: project.location ?? '', keywords: (project.keywords ?? []).join(', '),
    excludeKeywords: (project.excludeKeywords ?? []).join(', '), status: project.status ?? 'ACTIVE',
  }
}

export function projectToPayload(form) {
  const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)
  return {
    title: form.title.trim(), description: form.description.trim(), requiredSkills: list(form.requiredSkills),
    preferredSkills: list(form.preferredSkills), minimumExperience: form.minimumExperience === '' ? null : Number(form.minimumExperience),
    maximumExperience: form.maximumExperience === '' ? null : Number(form.maximumExperience), location: form.location.trim() || null,
    keywords: list(form.keywords), excludeKeywords: list(form.excludeKeywords), status: form.status,
  }
}

export function moveProjectCandidateLocally(candidates, linkId, status) {
  return candidates.map((link) => link.id === linkId ? { ...link, projectStatus: status } : link)
}

export function getProjectAnalysisLabel(hasScore, isLoading) {
  if (isLoading) return hasScore ? 'Re-analyzing...' : 'Analyzing...'
  return hasScore ? 'Re-analyze' : 'Analyze for project'
}
