import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  buildGoogleSearchUrl,
  buildLinkedInXrayQuery,
} from '../utils/linkedinSearch.js'
import CandidateActivityPanel from './CandidateActivityPanel.jsx'
import CandidateDetailsPanel from './CandidateDetailsPanel.jsx'
import CandidateEmailDiscoveryModal from './CandidateEmailDiscoveryModal.jsx'
import InterviewInvitationModal from './InterviewInvitationModal.jsx'
import ProjectAssignmentModal from './ProjectAssignmentModal.jsx'
import { candidatesApiUrl } from '../config/api.js'
import { openGmailCompose } from '../utils/email.js'
import LoadingLabel from './LoadingLabel.jsx'
import { useLoadingActions } from '../hooks/useLoadingActions.js'
const initialSearch = {
  role: '',
  requiredSkills: '',
  preferredSkills: '',
  minExperience: '',
  maxExperience: '',
  location: '',
  keywords: '',
  excludeKeywords: '',
  source: 'both',
}
const visibleSkillCount = 4
const linkedinConnectionMaxLength = 250
const maximumAutomaticEnrichments = 5

function parseList(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

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

function getMatchRecommendation(score) {
  if (score >= 90) {
    return 'Strong Match'
  }

  if (score >= 75) {
    return 'Good Match'
  }

  if (score >= 60) {
    return 'Potential Match'
  }

  return 'Low Match'
}

function formatAnalysisScore(score) {
  return Number.isFinite(score) ? `${score}%` : 'Unknown'
}

function formatProcessingStatus(status, type) {
  const labels = type === 'enrichment'
    ? {
        SUCCEEDED: 'Enrichment: completed',
        FAILED: 'Enrichment: unavailable',
        NOT_NEEDED: 'Enrichment: not needed',
      }
    : {
        SUCCEEDED: 'Scoring: completed',
        FAILED: 'Scoring: unavailable',
        INSUFFICIENT_EVIDENCE: 'Scoring: insufficient evidence',
      }

  return labels[status] ?? null
}

function openGoogleSearch(criteria, searchSessionId) {
  const searchUrl = new URL(buildGoogleSearchUrl(criteria))

  if (searchSessionId) {
    searchUrl.searchParams.set('recruitmentSearchSession', searchSessionId)
  }

  const searchLink = document.createElement('a')
  searchLink.href = searchUrl.href
  searchLink.target = '_blank'
  searchLink.rel = 'noopener noreferrer'
  document.body.append(searchLink)
  searchLink.click()
  searchLink.remove()
}

function sortCandidateResults(candidates) {
  return [...candidates].sort((firstCandidate, secondCandidate) => {
    const firstHasScore = Number.isFinite(firstCandidate.matchScore)
    const secondHasScore = Number.isFinite(secondCandidate.matchScore)

    if (firstHasScore && secondHasScore) {
      return secondCandidate.matchScore - firstCandidate.matchScore
    }

    if (firstHasScore) {
      return -1
    }

    if (secondHasScore) {
      return 1
    }

    return 0
  })
}

function toStoredSourcingCriteria(criteria) {
  return {
    role: criteria.role,
    requiredSkills: criteria.requiredSkills,
    preferredSkills: criteria.preferredSkills,
    ...(criteria.minExperience !== undefined && {
      minExperience: criteria.minExperience,
    }),
    ...(criteria.maxExperience !== undefined && {
      maxExperience: criteria.maxExperience,
    }),
    location: criteria.location,
    keywords: criteria.keywords,
    excludeKeywords: criteria.excludeKeywords,
  }
}

function toSearchForm(criteria) {
  return {
    role: criteria.role,
    requiredSkills: criteria.requiredSkills.join(', '),
    preferredSkills: criteria.preferredSkills.join(', '),
    minExperience: criteria.minExperience ?? '',
    maxExperience: criteria.maxExperience ?? '',
    location: criteria.location,
    keywords: criteria.keywords.join(', '),
    excludeKeywords: criteria.excludeKeywords.join(', '),
    source: 'external',
  }
}

function mergeCandidateResults(currentResults, updatedResults) {
  return sortCandidateResults(
    updatedResults.map((updatedCandidate) => {
      const currentCandidate = currentResults.find(
        (candidate) => candidate.id === updatedCandidate.id,
      )

      return currentCandidate
        ? {
            ...currentCandidate,
            ...updatedCandidate,
            notes: currentCandidate.notes ?? updatedCandidate.notes,
          }
        : updatedCandidate
    }),
  )
}

function toExportCandidate(candidate) {
  const analysis = candidate.matchAnalysis

  return {
    fullName: candidate.fullName,
    currentTitle: candidate.currentTitle ?? null,
    currentCompany: candidate.currentCompany ?? null,
    location: candidate.location ?? null,
    yearsOfExperience: candidate.yearsOfExperience ?? null,
    skills: candidate.skills ?? [],
    matchScore: Number.isFinite(candidate.matchScore)
      ? candidate.matchScore
      : null,
    matchAnalysis: analysis
      ? {
          requiredSkillsScore: analysis.requiredSkillsScore ?? null,
          preferredSkillsScore: analysis.preferredSkillsScore ?? null,
          experienceScore: analysis.experienceScore ?? null,
          roleScore: analysis.roleScore ?? null,
          matchedSkills: analysis.matchedSkills ?? [],
          missingSkills: analysis.missingSkills ?? [],
          strengths: analysis.strengths ?? [],
          concerns: analysis.concerns ?? [],
          summary: analysis.summary ?? null,
        }
      : null,
    linkedinUrl: candidate.linkedinUrl ?? null,
    email: candidate.email ?? null,
    githubUrl: candidate.githubUrl ?? null,
    portfolioUrl: candidate.portfolioUrl ?? null,
    source: candidate.source ?? null,
    isSaved: Boolean(candidate.isSaved),
    status: candidate.status ?? null,
    notes: candidate.notes ?? null,
  }
}

function getExportFilename(contentDisposition) {
  const filenameMatch = contentDisposition?.match(
    /filename=(?:"([^"]+)"|([^;]+))/i,
  )
  const filename = filenameMatch?.[1] ?? filenameMatch?.[2]

  return filename?.trim() || 'recruitment-candidates.xlsx'
}

function projectSearch(project) {
  if (!project) return initialSearch
  return {
    ...initialSearch,
    role: project.title ?? '',
    requiredSkills: (project.requiredSkills ?? []).join(', '),
    preferredSkills: (project.preferredSkills ?? []).join(', '),
    minExperience: project.minimumExperience ?? '',
    maxExperience: project.maximumExperience ?? '',
    location: project.location ?? '',
    keywords: (project.keywords ?? []).join(', '),
    excludeKeywords: (project.excludeKeywords ?? []).join(', '),
  }
}

function SearchCandidates({ originatingProject = null, onBackToProject = null, onOpenProject = null }) {
  const [search, setSearch] = useState(() => projectSearch(originatingProject))
  const [searchStatus, setSearchStatus] = useState('idle')
  const [results, setResults] = useState([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([])
  const [savingCandidateIds, setSavingCandidateIds] = useState([])
  const [savingNotesIds, setSavingNotesIds] = useState([])
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [bulkSaveProgress, setBulkSaveProgress] = useState(null)
  const [actionMessage, setActionMessage] = useState(null)
  const [expandedAnalysisId, setExpandedAnalysisId] = useState(null)
  const [externalSearchOpened, setExternalSearchOpened] = useState(false)
  const [importBannerCount, setImportBannerCount] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importCriteriaUnavailable, setImportCriteriaUnavailable] =
    useState(false)
  const [isProcessingImport, setIsProcessingImport] = useState(false)
  const [importProcessingProgress, setImportProcessingProgress] =
    useState(null)
  const [importProcessingNotice, setImportProcessingNotice] = useState(null)
  const [activeImportSessionId, setActiveImportSessionId] = useState(null)
  const [enrichingCandidateIds, setEnrichingCandidateIds] = useState([])
  const [isBulkEnriching, setIsBulkEnriching] = useState(false)
  const [enrichmentProgress, setEnrichmentProgress] = useState(null)
  const [exportingTarget, setExportingTarget] = useState(null)
  const [outreachCandidate, setOutreachCandidate] = useState(null)
  const [outreachSubject, setOutreachSubject] = useState('')
  const [outreachBody, setOutreachBody] = useState('')
  const [outreachStatus, setOutreachStatus] = useState('idle')
  const [emailSentStatus, setEmailSentStatus] = useState('idle')
  const [gmailOpenError, setGmailOpenError] = useState(false)
  const loadingActions = useLoadingActions()
  const [linkedinOutreachCandidate, setLinkedinOutreachCandidate] =
    useState(null)
  const [linkedinOutreachType, setLinkedinOutreachType] = useState(null)
  const [linkedinMessage, setLinkedinMessage] = useState('')
  const [linkedinOutreachStatus, setLinkedinOutreachStatus] = useState('idle')
  const [linkedinCopyStatus, setLinkedinCopyStatus] = useState('idle')
  const [linkedinSentStatus, setLinkedinSentStatus] = useState('idle')
  const [activityCandidate, setActivityCandidate] = useState(null)
  const [interviewCandidate, setInterviewCandidate] = useState(null)
  const [emailDiscoveryCandidate, setEmailDiscoveryCandidate] = useState(null)
  const [detailsCandidateId, setDetailsCandidateId] = useState(null)
  const [manualCandidate, setManualCandidate] = useState(null)
  const [manualProfileText, setManualProfileText] = useState({
    about: '',
    workExperience: '',
    skills: '',
  })
  const [manualEmail, setManualEmail] = useState('')
  const [manualPreview, setManualPreview] = useState(null)
  const [manualApprovedFields, setManualApprovedFields] = useState([])
  const [manualStatus, setManualStatus] = useState('idle')
  const [manualError, setManualError] = useState('')
  const [projectAssignmentCandidates, setProjectAssignmentCandidates] = useState(null)
  const [assignedProjects, setAssignedProjects] = useState([])

  useEffect(() => {
    if (originatingProject) setSearch(projectSearch(originatingProject))
  }, [originatingProject])

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const importSessionId = currentUrl.searchParams.get('importSession')

    if (!importSessionId) {
      return undefined
    }

    const abortController = new AbortController()
    setSearchStatus('loading-import')
    setImportError(null)
    setImportCriteriaUnavailable(false)
    setImportProcessingNotice(null)

    async function loadAndProcessImport() {
      let importLoaded = false

      try {
        const response = await fetch(
          `${candidatesApiUrl}/import-sessions/${encodeURIComponent(importSessionId)}`,
          { signal: abortController.signal },
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(
            result.error || 'Unable to load imported candidates.',
          )
        }

        const importedResults = sortCandidateResults(result.results ?? [])
        const sourcingCriteria = result.criteria ?? null
        importLoaded = true

        setResults(importedResults)
        setSelectedCandidateIds([])
        setExpandedAnalysisId(null)
        setActionMessage(null)
        setExternalSearchOpened(false)
        setImportBannerCount(importedResults.length)
        setActiveImportSessionId(importSessionId)
        setSearchStatus('success')

        currentUrl.searchParams.delete('importSession')
        window.history.replaceState(
          window.history.state,
          '',
          `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
        )

        if (!sourcingCriteria) {
          setImportCriteriaUnavailable(true)
          return
        }

        setSearch(toSearchForm(sourcingCriteria))
        setIsProcessingImport(true)
        const candidatesToEnrich = importedResults.slice(
          0,
          maximumAutomaticEnrichments,
        )
        let enrichmentFailureCount = 0

        for (const [index, candidate] of candidatesToEnrich.entries()) {
          setImportProcessingProgress({
            current: index + 1,
            total: candidatesToEnrich.length,
          })

          try {
            const enrichmentResponse = await fetch(
              `${candidatesApiUrl}/process-experience`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  candidate: {
                    id: candidate.id,
                    fullName: candidate.fullName,
                    linkedinUrl: candidate.linkedinUrl,
                    currentTitle: candidate.currentTitle,
                    currentCompany: candidate.currentCompany,
                    location: candidate.location,
                    searchSnippet: candidate.searchSnippet,
                  },
                  importSessionId,
                  deferScoring: true,
                }),
                signal: abortController.signal,
              },
            )
            const enrichmentResult = await enrichmentResponse.json()

            if (!enrichmentResponse.ok) {
              throw new Error(
                enrichmentResult.error || 'Unable to enrich candidate.',
              )
            }

            setResults((currentResults) =>
              mergeCandidateResults(currentResults, [
                ...currentResults.filter(
                  (currentCandidate) => currentCandidate.id !== candidate.id,
                ),
                enrichmentResult.candidate,
              ]),
            )
            if (enrichmentResult.experienceStatus === 'INCOMPLETE') {
              enrichmentFailureCount += 1
            }
          } catch (error) {
            if (error.name === 'AbortError') {
              throw error
            }

            enrichmentFailureCount += 1
          }
        }

        const scoringResponse = await fetch(
          `${candidatesApiUrl}/import-sessions/${encodeURIComponent(importSessionId)}/score`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sourcingCriteria),
            signal: abortController.signal,
          },
        )
        const scoringResult = await scoringResponse.json()

        if (!scoringResponse.ok) {
          throw new Error(
            scoringResult.error || 'Unable to score imported candidates.',
          )
        }

        setResults((currentResults) =>
          mergeCandidateResults(currentResults, scoringResult.results ?? []),
        )

        if (enrichmentFailureCount > 0) {
          setImportProcessingNotice(
            `${enrichmentFailureCount} ${enrichmentFailureCount === 1 ? 'candidate has' : 'candidates have'} incomplete experience. They remain visible and were scored using the available verified information.`,
          )
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          if (!importLoaded) {
            setSearchStatus('idle')
            setImportError('Unable to load imported candidates.')
          } else {
            setImportProcessingNotice(
              'Imported candidates remain visible, but automatic processing could not be completed.',
            )
          }
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsProcessingImport(false)
          setImportProcessingProgress(null)
        }
      }
    }

    loadAndProcessImport()

    return () => abortController.abort()
  }, [])

  const summary = useMemo(
    () => ({
      total: results.length,
      database: results.filter((candidate) => candidate.source === 'database')
        .length,
      external: results.filter((candidate) => candidate.source !== 'database')
        .length,
      saved: results.filter((candidate) => candidate.isSaved).length,
    }),
    [results],
  )

  const selectedUnsavedCandidates = results.filter(
    (candidate) =>
      !candidate.isSaved && selectedCandidateIds.includes(candidate.id),
  )
  const unsavedCandidates = results.filter((candidate) => !candidate.isSaved)
  const selectedCandidates = results.filter((candidate) =>
    selectedCandidateIds.includes(candidate.id),
  )
  const detailsCandidate = results.find(
    (candidate) => candidate.id === detailsCandidateId,
  ) ?? null
  const selectedImportedCandidates = results.filter(
    (candidate) =>
      !candidate.isSaved &&
      candidate.source === 'google-linkedin' &&
      selectedCandidateIds.includes(candidate.id),
  )
  const isLinkedinConnectionRequest =
    linkedinOutreachType === 'linkedin-connect'
  const isLinkedinMessageTooLong =
    isLinkedinConnectionRequest &&
    linkedinMessage.length > linkedinConnectionMaxLength

  function handleSearchChange(event) {
    const { name, value } = event.target

    if (name === 'source') {
      setExternalSearchOpened(false)
    }

    setSearch((currentSearch) => ({
      ...currentSearch,
      [name]: value,
    }))
  }

  function buildSearchPayload() {
    return {
      role: search.role.trim(),
      requiredSkills: parseList(search.requiredSkills),
      preferredSkills: parseList(search.preferredSkills),
      ...(search.minExperience !== '' && {
        minExperience: Number(search.minExperience),
      }),
      ...(search.maxExperience !== '' && {
        maxExperience: Number(search.maxExperience),
      }),
      location: search.location.trim(),
      keywords: parseList(search.keywords),
      excludeKeywords: parseList(search.excludeKeywords),
      source: search.source,
    }
  }

  async function handleSearch(event) {
    event.preventDefault()
    const payload = buildSearchPayload()

    if (
      payload.minExperience !== undefined &&
      payload.maxExperience !== undefined &&
      payload.minExperience > payload.maxExperience
    ) {
      setResults([])
      setSearchStatus('error')
      setActionMessage(null)
      setExternalSearchOpened(false)
      return
    }

    const shouldOpenGoogle = payload.source !== 'database'
    const shouldSearchDatabase = payload.source !== 'external'

    setSearchStatus(shouldSearchDatabase ? 'searching' : 'idle')
    setActionMessage(null)
    setSelectedCandidateIds([])
    setExpandedAnalysisId(null)
    setExternalSearchOpened(shouldOpenGoogle)
    setImportBannerCount(null)
    setImportError(null)
    setImportCriteriaUnavailable(false)
    setIsProcessingImport(false)
    setImportProcessingProgress(null)
    setImportProcessingNotice(null)
    setActiveImportSessionId(null)
    setEnrichmentProgress(null)

    if (shouldOpenGoogle) {
      let searchSessionId = null

      try {
        const sessionResponse = await fetch(
          `${candidatesApiUrl}/search-sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toStoredSourcingCriteria(payload)),
          },
        )
        const sessionResult = await sessionResponse.json()

        if (sessionResponse.ok) {
          searchSessionId = sessionResult.searchSessionId ?? null
        }
      } catch {
        // Google search still opens. Imports from it will remain unscored.
      }

      openGoogleSearch(payload, searchSessionId)
    }

    if (!shouldSearchDatabase) {
      setResults([])
      return
    }

    try {
      const response = await fetch(`${candidatesApiUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, source: 'database' }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to search candidates.')
      }

      setResults(result.results)
      setSearchStatus('success')
    } catch {
      setResults([])
      setSearchStatus('error')
    }
  }

  function updateCandidateNotes(candidateId, notes) {
    setResults((currentResults) =>
      currentResults.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, notes } : candidate,
      ),
    )
  }

  async function persistSavedNotes(candidate) {
    setSavingNotesIds((currentIds) => [...currentIds, candidate.id])
    setActionMessage(null)

    try {
      const response = await fetch(`${candidatesApiUrl}/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: candidate.notes ?? '' }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to save candidate notes.')
      }

      setResults((currentResults) =>
        currentResults.map((currentCandidate) =>
          currentCandidate.id === candidate.id
            ? {
                ...currentCandidate,
                ...result.candidate,
                source: currentCandidate.source,
                isSaved: true,
              }
            : currentCandidate,
        ),
      )
    } catch {
      setActionMessage({
        type: 'error',
        text: 'Unable to save candidate notes.',
      })
    } finally {
      setSavingNotesIds((currentIds) =>
        currentIds.filter((candidateId) => candidateId !== candidate.id),
      )
    }
  }

  async function saveCandidate(candidate, showSuccessMessage = true) {
    if (candidate.isSaved) {
      return true
    }

    const actionKey = `${candidate.id}:save`
    if (!loadingActions.begin(actionKey)) return false

    setSavingCandidateIds((currentIds) => [...currentIds, candidate.id])

    try {
      const response = await fetch(candidatesApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: candidate.fullName,
          currentTitle: candidate.currentTitle,
          currentCompany: candidate.currentCompany,
          location: candidate.location,
          linkedinUrl: candidate.linkedinUrl,
          email: candidate.email,
          yearsOfExperience: candidate.yearsOfExperience,
          skills: candidate.skills,
          summary: candidate.summary,
          notes: candidate.notes,
          source: candidate.source,
          status: 'SAVED',
        }),
      })
      const result = await response.json()

      if (!response.ok && !result.possibleDuplicate) {
        throw new Error(result.error || 'Unable to save candidate.')
      }

      const savedCandidate = result.candidate

      setResults((currentResults) =>
        currentResults.map((currentCandidate) =>
          currentCandidate.id === candidate.id
            ? {
                ...currentCandidate,
                ...savedCandidate,
                source: currentCandidate.source,
                isSaved: true,
              }
            : currentCandidate,
        ),
      )
      setSelectedCandidateIds((currentIds) =>
        currentIds.filter((candidateId) => candidateId !== candidate.id),
      )

      if (showSuccessMessage) {
        setActionMessage({
          type: 'success',
          text: `${candidate.fullName} saved successfully.`,
        })
      }

      return true
    } catch {
      if (showSuccessMessage) {
        setActionMessage({
          type: 'error',
          text: `Unable to save ${candidate.fullName}.`,
        })
      }

      return false
    } finally {
      loadingActions.end(actionKey)
      setSavingCandidateIds((currentIds) =>
        currentIds.filter((candidateId) => candidateId !== candidate.id),
      )
    }
  }

  async function saveCandidates(candidates) {
    if (isBulkSaving) return
    setIsBulkSaving(true)
    setActionMessage(null)
    let savedCount = 0

    for (const [index, candidate] of candidates.entries()) {
      setBulkSaveProgress({ current: index + 1, total: candidates.length })
      if (await saveCandidate(candidate, false)) {
        savedCount += 1
      }
    }

    setIsBulkSaving(false)
    setBulkSaveProgress(null)
    setActionMessage({
      type: savedCount === candidates.length ? 'success' : 'error',
      text:
        savedCount === candidates.length
          ? `${savedCount} ${savedCount === 1 ? 'candidate' : 'candidates'} saved successfully.`
          : `${savedCount} of ${candidates.length} candidates saved.`,
    })
  }

  async function updateCandidateDetails(candidate, changes) {
    const requestUrl = candidate.isSaved
      ? `${candidatesApiUrl}/${encodeURIComponent(candidate.id)}/details`
      : `${candidatesApiUrl}/import-sessions/${encodeURIComponent(activeImportSessionId)}/candidates/${encodeURIComponent(candidate.id)}/details`
    if (!candidate.isSaved && !activeImportSessionId) {
      throw new Error('The temporary candidate session has expired.')
    }
    const response = await fetch(requestUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to update candidate details.')
    setResults((currentResults) =>
      sortCandidateResults(currentResults.map((currentCandidate) =>
        currentCandidate.id === candidate.id
          ? { ...currentCandidate, ...result.candidate }
          : currentCandidate,
      )),
    )
    return result.candidate
  }

  async function rerunCandidateMatching(candidate) {
    try {
      const outcome = await loadingActions.run(`${candidate.id}:matching`, async () => {
      const response = await fetch(`${candidatesApiUrl}/score-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate,
          criteria: toStoredSourcingCriteria(buildSearchPayload()),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to score candidate.')
      setResults((currentResults) => sortCandidateResults(
        currentResults.map((currentCandidate) =>
          currentCandidate.id === candidate.id
            ? { ...currentCandidate, ...result.candidate }
            : currentCandidate,
        ),
      ))
      })
      return outcome.value
    } catch (error) {
      setActionMessage({ type: 'error', text: error.message || 'Unable to score candidate.' })
      throw error
    }
  }

  async function enrichCandidate(candidate, showMessage = true) {
    const actionKey = `${candidate.id}:enrich`
    if (!loadingActions.begin(actionKey)) return false
    setEnrichingCandidateIds((currentIds) => [
      ...currentIds,
      candidate.id,
    ])

    if (showMessage) {
      setActionMessage(null)
    }

    try {
      const response = await fetch(`${candidatesApiUrl}/process-experience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: {
            id: candidate.id,
            fullName: candidate.fullName,
            linkedinUrl: candidate.linkedinUrl,
            currentTitle: candidate.currentTitle,
            currentCompany: candidate.currentCompany,
            location: candidate.location,
            searchSnippet: candidate.searchSnippet,
          },
          ...(activeImportSessionId && {
            importSessionId: activeImportSessionId,
          }),
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to enrich candidate.')
      }

      setResults((currentResults) =>
        sortCandidateResults(
          currentResults.map((currentCandidate) =>
            currentCandidate.id === candidate.id
              ? {
                  ...currentCandidate,
                  ...result.candidate,
                  source: currentCandidate.source,
                  isSaved: currentCandidate.isSaved,
                  notes: currentCandidate.notes,
                }
              : currentCandidate,
          ),
        ),
      )

      if (showMessage) {
        setActionMessage({
          type:
            result.experienceStatus === 'COMPLETE' ? 'success' : 'error',
          text:
            result.experienceStatus === 'COMPLETE'
              ? `${candidate.fullName}'s experience was completed.`
              : `Experience remains incomplete for ${candidate.fullName}. Add profile details to complete it.`,
        })
      }

      return result.experienceStatus === 'COMPLETE'
    } catch (error) {
      if (showMessage) {
        setActionMessage({
          type: 'error',
          text: error.message || `Unable to enrich ${candidate.fullName}.`,
        })
      }

      return false
    } finally {
      loadingActions.end(actionKey)
      setEnrichingCandidateIds((currentIds) =>
        currentIds.filter((candidateId) => candidateId !== candidate.id),
      )
    }
  }

  async function enrichCandidates(candidates) {
    const candidatesToEnrich = candidates.slice(0, 5)

    if (candidatesToEnrich.length === 0 || isBulkEnriching) {
      return
    }

    setIsBulkEnriching(true)
    setActionMessage(null)
    let completedCount = 0

    for (const [index, candidate] of candidatesToEnrich.entries()) {
      setEnrichmentProgress({
        current: index + 1,
        total: candidatesToEnrich.length,
      })

      if (await enrichCandidate(candidate, false)) {
        completedCount += 1
      }
    }

    setIsBulkEnriching(false)
    setEnrichmentProgress(null)
    setActionMessage({
      type:
        completedCount === candidatesToEnrich.length ? 'success' : 'error',
      text:
        completedCount === candidatesToEnrich.length
          ? `${completedCount} ${completedCount === 1 ? 'candidate has' : 'candidates have'} complete experience.`
          : `${completedCount} of ${candidatesToEnrich.length} candidates have complete experience.`,
    })
  }

  function openManualEnrichment(candidate) {
    setManualCandidate(candidate)
    setManualProfileText({ about: '', workExperience: '', skills: '' })
    setManualEmail(candidate.email ?? '')
    setManualPreview(null)
    setManualApprovedFields([])
    setManualStatus('idle')
    setManualError('')
  }

  function closeManualEnrichment() {
    setManualCandidate(null)
    setManualPreview(null)
    setManualStatus('idle')
    setManualError('')
  }

  async function previewManualEnrichment() {
    setManualStatus('extracting')
    setManualError('')

    try {
      const response = await fetch(`${candidatesApiUrl}/enrich-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          candidate: {
            id: manualCandidate.id,
            fullName: manualCandidate.fullName,
            currentTitle: manualCandidate.currentTitle ?? null,
            currentCompany: manualCandidate.currentCompany ?? null,
            location: manualCandidate.location ?? null,
            yearsOfExperience: manualCandidate.yearsOfExperience ?? null,
            skills: manualCandidate.skills ?? [],
            summary: manualCandidate.summary ?? null,
            email: manualCandidate.email ?? null,
            linkedinUrl: manualCandidate.linkedinUrl ?? null,
            isSaved: Boolean(manualCandidate.isSaved),
            source: manualCandidate.source ?? null,
          },
          profileText: manualProfileText,
          email: manualEmail,
          criteria: toStoredSourcingCriteria(buildSearchPayload()),
          ...(!manualCandidate.isSaved && activeImportSessionId
            ? { importSessionId: activeImportSessionId }
            : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to extract profile details.')

      const fields = [
        'currentTitle',
        'currentCompany',
        'location',
        'skills',
        'summary',
        'employmentHistory',
        'yearsOfExperience',
        'email',
      ]
      const useful = (value) => Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''
      setManualPreview(result)
      setManualApprovedFields(
        fields.filter((field) =>
          useful(result.extracted[field]) &&
          (!useful(result.candidate[field]) || field === 'skills' || field === 'employmentHistory'),
        ),
      )
      setManualStatus('preview')
    } catch (error) {
      setManualError(error.message || 'Unable to extract profile details.')
      setManualStatus('error')
    }
  }

  function toggleManualField(field) {
    setManualApprovedFields((fields) =>
      fields.includes(field)
        ? fields.filter((current) => current !== field)
        : [...fields, field],
    )
  }

  async function confirmManualEnrichment() {
    setManualStatus('confirming')
    setManualError('')

    try {
      const response = await fetch(`${candidatesApiUrl}/enrich-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          previewId: manualPreview.previewId,
          approvedFields: manualApprovedFields,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to apply profile details.')

      setResults((currentResults) =>
        sortCandidateResults(
          currentResults.map((candidate) =>
            candidate.id === manualCandidate.id
              ? {
                  ...candidate,
                  ...result.candidate,
                  source: candidate.source,
                  isSaved: candidate.isSaved,
                  notes: candidate.notes,
                }
              : candidate,
          ),
        ),
      )
      setActionMessage({
        type: 'success',
        text: `${manualCandidate.fullName}'s approved profile details were applied.`,
      })
      closeManualEnrichment()
    } catch (error) {
      setManualError(error.message || 'Unable to apply profile details.')
      setManualStatus('error')
    }
  }

  async function exportCandidates(candidates, target) {
    if (candidates.length === 0) {
      return
    }

    setExportingTarget(target)
    setActionMessage(null)

    try {
      const response = await fetch(`${candidatesApiUrl}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: candidates.map(toExportCandidate),
        }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'Unable to export candidates.')
      }

      const workbook = await response.blob()
      const downloadUrl = URL.createObjectURL(workbook)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = getExportFilename(
        response.headers.get('Content-Disposition'),
      )
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)

      setActionMessage({
        type: 'success',
        text: `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'} exported successfully.`,
      })
    } catch (error) {
      setActionMessage({
        type: 'error',
        text: error.message || 'Unable to export candidates.',
      })
    } finally {
      setExportingTarget(null)
    }
  }

  function openOutreach(candidate) {
    setLinkedinOutreachCandidate(null)
    setOutreachCandidate(candidate)
    setOutreachSubject('')
    setOutreachBody('')
    setOutreachStatus('idle')
    setEmailSentStatus('idle')
    setGmailOpenError(false)
  }

  function closeOutreach() {
    setOutreachCandidate(null)
    setOutreachSubject('')
    setOutreachBody('')
    setOutreachStatus('idle')
    setEmailSentStatus('idle')
    setGmailOpenError(false)
  }

  async function generateOutreach() {
    if (!outreachCandidate?.email) {
      return
    }

    const actionKey = `${outreachCandidate.id}:generate-email`
    if (!loadingActions.begin(actionKey)) return
    setOutreachStatus('generating')

    try {
      const response = await fetch(`${candidatesApiUrl}/generate-outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: {
            fullName: outreachCandidate.fullName,
            currentTitle: outreachCandidate.currentTitle,
            currentCompany: outreachCandidate.currentCompany,
            location: outreachCandidate.location,
            email: outreachCandidate.email,
            skills: outreachCandidate.skills ?? [],
            summary: outreachCandidate.summary,
            matchScore: Number.isFinite(outreachCandidate.matchScore)
              ? outreachCandidate.matchScore
              : null,
            matchAnalysis: outreachCandidate.matchAnalysis ?? null,
          },
          job: {
            role: search.role.trim(),
            requiredSkills: parseList(search.requiredSkills),
            preferredSkills: parseList(search.preferredSkills),
            location: search.location.trim(),
            description: '',
          },
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to generate outreach.')
      }

      setOutreachSubject(result.subject)
      setOutreachBody(result.body)
      setOutreachStatus('success')
    } catch {
      setOutreachStatus('error')
    } finally {
      loadingActions.end(actionKey)
    }
  }

  function openLinkedInOutreach(candidate, type) {
    setOutreachCandidate(null)
    setLinkedinOutreachCandidate(candidate)
    setLinkedinOutreachType(type)
    setLinkedinMessage('')
    setLinkedinOutreachStatus('idle')
    setLinkedinCopyStatus('idle')
    setLinkedinSentStatus('idle')
  }

  function closeLinkedInOutreach() {
    setLinkedinOutreachCandidate(null)
    setLinkedinOutreachType(null)
    setLinkedinMessage('')
    setLinkedinOutreachStatus('idle')
    setLinkedinCopyStatus('idle')
    setLinkedinSentStatus('idle')
  }

  async function generateLinkedInOutreach() {
    if (!linkedinOutreachCandidate?.linkedinUrl || !linkedinOutreachType) {
      return
    }

    const actionKey = `${linkedinOutreachCandidate.id}:generate-${linkedinOutreachType}`
    if (!loadingActions.begin(actionKey)) return
    setLinkedinOutreachStatus('generating')
    setLinkedinCopyStatus('idle')

    try {
      const response = await fetch(
        `${candidatesApiUrl}/generate-linkedin-outreach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: linkedinOutreachType,
            candidate: {
              fullName: linkedinOutreachCandidate.fullName,
              currentTitle: linkedinOutreachCandidate.currentTitle,
              currentCompany: linkedinOutreachCandidate.currentCompany,
              location: linkedinOutreachCandidate.location,
              linkedinUrl: linkedinOutreachCandidate.linkedinUrl,
              skills: linkedinOutreachCandidate.skills ?? [],
              summary: linkedinOutreachCandidate.summary,
              matchAnalysis:
                linkedinOutreachCandidate.matchAnalysis ?? null,
            },
            job: {
              role: search.role.trim(),
              requiredSkills: parseList(search.requiredSkills),
              preferredSkills: parseList(search.preferredSkills),
              location: search.location.trim(),
              description: '',
            },
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to generate LinkedIn outreach.',
        )
      }

      setLinkedinMessage(result.message)
      setLinkedinOutreachStatus('success')
    } catch {
      setLinkedinOutreachStatus('error')
    } finally {
      loadingActions.end(actionKey)
    }
  }

  async function copyLinkedInMessage() {
    try {
      await navigator.clipboard.writeText(linkedinMessage)
      setLinkedinCopyStatus('copied')
      window.setTimeout(() => setLinkedinCopyStatus('idle'), 1_500)
    } catch {
      setLinkedinCopyStatus('error')
    }
  }

  function applyPersistentCandidateUpdate(candidateId, savedCandidate) {
    setResults((currentResults) =>
      currentResults.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              ...savedCandidate,
              source: candidate.source,
              isSaved: true,
            }
          : candidate,
      ),
    )
  }

  async function markOutreachAsSent({
    candidate,
    type,
    channel,
    message,
    setStatus,
  }) {
    if (!candidate?.isSaved) {
      return
    }

    setStatus('saving')

    try {
      const response = await fetch(
        `${candidatesApiUrl}/${candidate.id}/activities`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            channel,
            message: message.trim() || null,
            metadata: {},
          }),
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to record activity.')
      }

      applyPersistentCandidateUpdate(candidate.id, result.candidate)
      setOutreachCandidate((currentCandidate) =>
        currentCandidate?.id === candidate.id
          ? { ...currentCandidate, ...result.candidate, isSaved: true }
          : currentCandidate,
      )
      setLinkedinOutreachCandidate((currentCandidate) =>
        currentCandidate?.id === candidate.id
          ? { ...currentCandidate, ...result.candidate, isSaved: true }
          : currentCandidate,
      )
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  function toggleCandidateSelection(candidateId) {
    setSelectedCandidateIds((currentIds) =>
      currentIds.includes(candidateId)
        ? currentIds.filter((currentId) => currentId !== candidateId)
        : [...currentIds, candidateId],
    )
  }

  function toggleAnalysis(candidateId) {
    setExpandedAnalysisId((currentCandidateId) =>
      currentCandidateId === candidateId ? null : candidateId,
    )
  }

  return (
    <section
      className="candidate-search"
      aria-labelledby="candidate-search-title"
    >
      {originatingProject && <div className="project-sourcing-context"><div><strong>Sourcing for {originatingProject.title}</strong><span>Adjusting this search will not change the saved project.</span></div><button type="button" onClick={onBackToProject}>Back to Project</button></div>}
      {assignedProjects.length > 0 && <div className="import-session-banner" role="status"><span>Candidates added successfully.</span><span className="assigned-project-links">{assignedProjects.map((project) => <button type="button" key={project.id} onClick={() => onOpenProject?.(project)}>{project.title} board</button>)}</span></div>}
      <form className="candidate-search-form card" onSubmit={handleSearch}>
        <div className="section-heading">
          <h3 id="candidate-search-title">Search Candidates</h3>
          <p>Define the role and choose where to look for candidates.</p>
        </div>

        <div className="candidate-search-grid">
          <label>
            Role / Job Title
            <input
              type="text"
              name="role"
              value={search.role}
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Required Skills
            <input
              type="text"
              name="requiredSkills"
              value={search.requiredSkills}
              placeholder="Node.js, AWS"
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Preferred Skills
            <input
              type="text"
              name="preferredSkills"
              value={search.preferredSkills}
              placeholder="Docker, Redis"
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Minimum Experience
            <input
              type="number"
              name="minExperience"
              min="0"
              step="0.5"
              value={search.minExperience}
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Maximum Experience
            <input
              type="number"
              name="maxExperience"
              min="0"
              step="0.5"
              value={search.maxExperience}
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Location
            <input
              type="text"
              name="location"
              value={search.location}
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Keywords
            <input
              type="text"
              name="keywords"
              value={search.keywords}
              placeholder="SaaS, platform"
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Exclude Keywords
            <input
              type="text"
              name="excludeKeywords"
              value={search.excludeKeywords}
              placeholder="intern, junior"
              onChange={handleSearchChange}
            />
          </label>
          <label>
            Search Source
            <select
              name="source"
              value={search.source}
              onChange={handleSearchChange}
            >
              <option value="database">Database</option>
              <option value="external">Google / LinkedIn</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          className="search-candidates-button"
          disabled={
            searchStatus === 'searching' ||
            searchStatus === 'loading-import' ||
            isProcessingImport
          }
        >
          {searchStatus === 'searching'
            ? 'Searching...'
            : 'Search Candidates'}
        </button>
      </form>

      {externalSearchOpened && (
        <aside className="external-search-helper" role="status">
          <strong>LinkedIn search opened in a new tab.</strong>
          <span>
            Use the Recruitment AI browser extension to import candidates from
            the search results.
          </span>
        </aside>
      )}

      {importBannerCount !== null && (
        <aside className="import-session-banner" role="status">
          <span>
            {importBannerCount}{' '}
            {importBannerCount === 1 ? 'candidate' : 'candidates'} imported from
            Google / LinkedIn
          </span>
          <button
            type="button"
            aria-label="Dismiss imported candidates message"
            onClick={() => setImportBannerCount(null)}
          >
            Dismiss
          </button>
        </aside>
      )}

      {importError && (
        <p className="candidate-search-state error" role="alert">
          {importError}
        </p>
      )}

      {importCriteriaUnavailable && (
        <p className="candidate-search-state error" role="status">
          Search criteria were unavailable. Imported candidates are shown
          without automatic scoring.
        </p>
      )}

      {isProcessingImport && (
        <div className="enrichment-progress" role="status">
          <strong>Processing imported candidates...</strong>
          {importProcessingProgress && (
            <span>
              Processing candidate {importProcessingProgress.current} of{' '}
              {importProcessingProgress.total}
            </span>
          )}
        </div>
      )}

      {importProcessingNotice && (
        <p className="search-action-message error" role="status">
          {importProcessingNotice}
        </p>
      )}

      {import.meta.env.DEV && search.source !== 'database' && (
        <details className="xray-query-preview">
          <summary>Generated search</summary>
          <code>
            {buildLinkedInXrayQuery({
              role: search.role,
              requiredSkills: parseList(search.requiredSkills),
              preferredSkills: parseList(search.preferredSkills),
              location: search.location,
              keywords: parseList(search.keywords),
              excludeKeywords: parseList(search.excludeKeywords),
            })}
          </code>
        </details>
      )}

      {searchStatus === 'searching' && (
        <p className="candidate-search-state" role="status">
          Searching...
        </p>
      )}

      {searchStatus === 'loading-import' && (
        <p className="candidate-search-state" role="status">
          Loading imported candidates...
        </p>
      )}

      {searchStatus === 'error' && (
        <p className="candidate-search-state error" role="alert">
          Unable to search candidates.
        </p>
      )}

      {searchStatus === 'success' && results.length === 0 && (
        <p className="candidate-search-state">No candidates found.</p>
      )}

      {searchStatus === 'success' && results.length > 0 && (
        <section
          className="candidate-search-results"
          aria-label="Candidate search results"
        >
          <div className="search-results-heading">
            <div>
              <h3>Candidate Results</h3>
              <p role="status">
                {summary.total}{' '}
                {summary.total === 1 ? 'candidate' : 'candidates'} found ·{' '}
                {summary.database} from database · {summary.external}{' '}
                Google / LinkedIn · {summary.saved} already saved
              </p>
            </div>
            <div className="bulk-save-actions">
              <button
                type="button"
                onClick={() => setProjectAssignmentCandidates(selectedCandidates)}
                disabled={selectedCandidates.length === 0}
              >
                Add Selected to Projects
              </button>
              <button
                type="button"
                title="Process experience for up to 5 selected imported candidates"
                onClick={() => enrichCandidates(selectedImportedCandidates)}
                disabled={
                  selectedImportedCandidates.length === 0 ||
                  isBulkEnriching ||
                  isBulkSaving
                }
              >
                {isBulkEnriching && enrichmentProgress
                  ? <LoadingLabel>Enriching {enrichmentProgress.current} of {enrichmentProgress.total}...</LoadingLabel>
                  : 'Enrich Selected'}
              </button>
              <button
                type="button"
                onClick={() => saveCandidates(selectedUnsavedCandidates)}
                disabled={
                  selectedUnsavedCandidates.length === 0 ||
                  isBulkSaving ||
                  isBulkEnriching
                }
              >
                {isBulkSaving && bulkSaveProgress
                  ? <LoadingLabel>Saving {bulkSaveProgress.current} of {bulkSaveProgress.total}...</LoadingLabel>
                  : 'Save Selected'}
              </button>
              <button
                type="button"
                onClick={() => saveCandidates(unsavedCandidates)}
                disabled={
                  unsavedCandidates.length === 0 ||
                  isBulkSaving ||
                  isBulkEnriching
                }
              >
                {isBulkSaving && bulkSaveProgress
                  ? <LoadingLabel>Saving {bulkSaveProgress.current} of {bulkSaveProgress.total}...</LoadingLabel>
                  : 'Save All'}
              </button>
              <button
                type="button"
                onClick={() =>
                  exportCandidates(selectedCandidates, 'selected')
                }
                disabled={
                  selectedCandidates.length === 0 ||
                  exportingTarget !== null ||
                  isBulkSaving ||
                  isBulkEnriching
                }
              >
                {exportingTarget === 'selected'
                  ? <LoadingLabel>Exporting...</LoadingLabel>
                  : 'Export Selected'}
              </button>
              <button
                type="button"
                onClick={() => exportCandidates(results, 'results')}
                disabled={
                  results.length === 0 ||
                  exportingTarget !== null ||
                  isBulkSaving ||
                  isBulkEnriching
                }
              >
                {exportingTarget === 'results'
                  ? <LoadingLabel>Exporting...</LoadingLabel>
                  : 'Export Results'}
              </button>
            </div>
          </div>

          {enrichmentProgress && (
            <p className="enrichment-progress" role="status">
              Processing experience {enrichmentProgress.current} of{' '}
              {enrichmentProgress.total}...
            </p>
          )}

          {actionMessage && (
            <p
              className={`search-action-message ${actionMessage.type}`}
              role={actionMessage.type === 'error' ? 'alert' : 'status'}
            >
              {actionMessage.text}
            </p>
          )}

          <div className="candidate-search-table-wrapper">
            <table className="candidate-search-table">
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Candidate</th>
                  <th scope="col">Current Title</th>
                  <th scope="col">Company</th>
                  <th scope="col">Location</th>
                  <th scope="col">Experience</th>
                  <th scope="col">Skills</th>
                  <th scope="col">Match</th>
                  <th scope="col">Source</th>
                  <th scope="col">Saved</th>
                  <th scope="col">Notes</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((candidate) => {
                  const visibleSkills = (candidate.skills ?? []).slice(
                    0,
                    visibleSkillCount,
                  )
                  const remainingSkills =
                    (candidate.skills?.length ?? 0) - visibleSkills.length
                  const isSaving = savingCandidateIds.includes(candidate.id)
                  const isSavingNotes = savingNotesIds.includes(candidate.id)
                  const isAnalysisExpanded =
                    expandedAnalysisId === candidate.id
                  const isEnriching = enrichingCandidateIds.includes(
                    candidate.id,
                  )
                  const canEnrich =
                    !candidate.isSaved &&
                    candidate.source === 'google-linkedin' &&
                    Boolean(candidate.linkedinUrl)
                  const enrichmentLabel = formatProcessingStatus(
                    candidate.enrichmentStatus,
                    'enrichment',
                  )
                  const scoringLabel = formatProcessingStatus(
                    candidate.scoringStatus,
                    'scoring',
                  )

                  return (
                    <Fragment key={candidate.id}>
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${candidate.fullName}`}
                            checked={selectedCandidateIds.includes(
                              candidate.id,
                            )}
                            disabled={
                              isBulkSaving ||
                              isBulkEnriching
                            }
                            onChange={() =>
                              toggleCandidateSelection(candidate.id)
                            }
                          />
                        </td>
                        <td className="candidate-name-cell">
                          <strong>{candidate.fullName}</strong>
                          {candidate.enrichment?.enriched && (
                            <span className="enriched-badge">Enriched</span>
                          )}
                          {(enrichmentLabel || scoringLabel) && (
                            <span className="candidate-processing-statuses">
                              {enrichmentLabel && <span>{enrichmentLabel}</span>}
                              {scoringLabel && <span>{scoringLabel}</span>}
                            </span>
                          )}
                        </td>
                        <td>{candidate.currentTitle || '-'}</td>
                        <td>{candidate.currentCompany || '-'}</td>
                        <td>{candidate.location || '-'}</td>
                        <td>{formatExperience(candidate.yearsOfExperience)}</td>
                        <td>
                          {visibleSkills.length > 0 ? (
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
                        <td>
                          <div className="candidate-match-cell">
                            {!Number.isFinite(candidate.matchScore) ? (
                              <span>
                                {candidate.matchError ===
                                'Insufficient information'
                                  ? 'Insufficient information'
                                  : 'Score unavailable'}
                              </span>
                            ) : (
                              <strong>
                                {candidate.matchScore}% —{' '}
                                {getMatchRecommendation(candidate.matchScore)}
                              </strong>
                            )}
                            <button
                              type="button"
                              aria-expanded={isAnalysisExpanded}
                              aria-controls={`match-analysis-${candidate.id}`}
                              disabled={!candidate.matchAnalysis}
                              onClick={() => toggleAnalysis(candidate.id)}
                            >
                              {isAnalysisExpanded
                                ? 'Hide Analysis'
                                : 'View Analysis'}
                            </button>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`source-badge ${
                              candidate.source === 'database'
                                ? 'database'
                                : 'external'
                            }`}
                          >
                            {candidate.source === 'database'
                              ? 'Database'
                              : 'Google / LinkedIn'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`saved-badge ${candidate.isSaved ? 'saved' : 'new'}`}
                          >
                            {candidate.isSaved ? 'Saved' : 'New'}
                          </span>
                        </td>
                        <td className="search-notes-cell">
                          <textarea
                            rows="3"
                            aria-label={`Notes for ${candidate.fullName}`}
                            value={candidate.notes ?? ''}
                            disabled={isSavingNotes}
                            onChange={(event) =>
                              updateCandidateNotes(
                                candidate.id,
                                event.target.value,
                              )
                            }
                            onBlur={() =>
                              candidate.isSaved && persistSavedNotes(candidate)
                            }
                          />
                          {isSavingNotes && <span>Saving...</span>}
                        </td>
                        <td>
                          <div className="search-result-actions">
                            <button
                              type="button"
                              onClick={() => setDetailsCandidateId(candidate.id)}
                            >
                              View Details
                            </button>
                            <button
                              type="button"
                              onClick={() => setProjectAssignmentCandidates([candidate])}
                            >
                              Add to Project
                            </button>
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
                            <button
                              type="button"
                              disabled={!candidate.email}
                              onClick={() => openOutreach(candidate)}
                            >
                              Email
                            </button>
                            <button
                              type="button"
                              onClick={() => setEmailDiscoveryCandidate(candidate)}
                            >
                              Find Email
                            </button>
                            <button
                              type="button"
                              disabled={!candidate.linkedinUrl}
                              onClick={() =>
                                openLinkedInOutreach(
                                  candidate,
                                  'linkedin-message',
                                )
                              }
                            >
                              LinkedIn Message
                            </button>
                            <button
                              type="button"
                              disabled={!candidate.linkedinUrl}
                              onClick={() =>
                                openLinkedInOutreach(
                                  candidate,
                                  'linkedin-connect',
                                )
                              }
                            >
                              Connect
                            </button>
                            {candidate.isSaved && (
                              <button
                                type="button"
                                onClick={() => setActivityCandidate(candidate)}
                              >
                                Activity
                              </button>
                            )}
                            <button
                              type="button"
                              className="interview-invite-button"
                              title={
                                !candidate.isSaved
                                  ? 'Save the candidate before inviting them'
                                  : !candidate.email
                                    ? 'Candidate email is required'
                                    : undefined
                              }
                              disabled={
                                !candidate.isSaved || !candidate.email
                              }
                              onClick={() => setInterviewCandidate(candidate)}
                            >
                              Invite to Interview
                            </button>
                            {canEnrich && (
                              <button
                                type="button"
                                className="enrich-candidate-button"
                                disabled={
                                  isEnriching ||
                                  isBulkEnriching ||
                                  isBulkSaving
                                }
                                onClick={() => enrichCandidate(candidate)}
                              >
                                {isEnriching
                                  ? <LoadingLabel>Enriching...</LoadingLabel>
                                  : 'Process Experience'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="manual-enrich-button"
                              onClick={() => openManualEnrichment(candidate)}
                            >
                              {candidate.experienceStatus === 'INCOMPLETE'
                                ? 'Complete Experience'
                                : 'Add Profile Details'}
                            </button>
                            <button
                              type="button"
                              className="save-candidate-button"
                              disabled={
                                candidate.isSaved ||
                                isSaving ||
                                isBulkSaving ||
                                isBulkEnriching ||
                                isEnriching
                              }
                              onClick={() => saveCandidate(candidate)}
                            >
                              {candidate.isSaved
                                ? 'Saved'
                                : isSaving
                                  ? <LoadingLabel>Saving...</LoadingLabel>
                                  : 'Save Candidate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isAnalysisExpanded && candidate.matchAnalysis && (
                        <tr
                          id={`match-analysis-${candidate.id}`}
                          className="sourcing-analysis-row"
                        >
                          <td colSpan="12">
                            <div className="sourcing-analysis-panel">
                              <dl className="sourcing-score-grid">
                                <div>
                                  <dt>Required Skills Score</dt>
                                  <dd>
                                    {formatAnalysisScore(
                                      candidate.matchAnalysis.requiredSkillsScore,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Preferred Skills Score</dt>
                                  <dd>
                                    {formatAnalysisScore(
                                      candidate.matchAnalysis.preferredSkillsScore,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Experience Score</dt>
                                  <dd>
                                    {formatAnalysisScore(
                                      candidate.matchAnalysis.experienceScore,
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Role Score</dt>
                                  <dd>
                                    {formatAnalysisScore(
                                      candidate.matchAnalysis.roleScore,
                                    )}
                                  </dd>
                                </div>
                                {candidate.matchAnalysis.evidenceCoverage && (
                                  <div>
                                    <dt>Evidence Coverage</dt>
                                    <dd>
                                      {
                                        candidate.matchAnalysis
                                          .evidenceCoverage.percentage
                                      }
                                      %
                                    </dd>
                                  </div>
                                )}
                              </dl>

                              <div className="sourcing-analysis-grid">
                                <section>
                                  <h4>Matched Skills</h4>
                                  <p>
                                    {candidate.matchAnalysis.matchedSkills.join(
                                      ', ',
                                    ) || 'None'}
                                  </p>
                                </section>
                                <section>
                                  <h4>Required skills without evidence</h4>
                                  <p>
                                    {candidate.matchAnalysis.missingSkills.join(
                                      ', ',
                                    ) || 'None'}
                                  </p>
                                </section>
                                <section>
                                  <h4>Strengths</h4>
                                  <ul>
                                    {candidate.matchAnalysis.strengths.map(
                                      (strength) => (
                                        <li key={strength}>{strength}</li>
                                      ),
                                    )}
                                  </ul>
                                </section>
                                <section>
                                  <h4>Concerns</h4>
                                  <ul>
                                    {candidate.matchAnalysis.concerns.map(
                                      (concern) => (
                                        <li key={concern}>{concern}</li>
                                      ),
                                    )}
                                  </ul>
                                </section>
                              </div>

                              <section className="sourcing-analysis-summary">
                                <h4>AI Summary</h4>
                                <p>{candidate.matchAnalysis.summary}</p>
                              </section>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {manualCandidate && (
        <div className="outreach-backdrop">
          <section
            className="outreach-panel manual-enrichment-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-enrichment-title"
          >
            <div className="outreach-heading">
              <div>
                <h3 id="manual-enrichment-title">Add Profile Details</h3>
                <p>
                  Paste professional information for {manualCandidate.fullName}.
                  Nothing changes until you confirm the preview.
                </p>
              </div>
              <button
                type="button"
                className="outreach-close"
                aria-label="Close profile details"
                onClick={closeManualEnrichment}
              >
                ×
              </button>
            </div>

            {!manualPreview && (
              <>
                <label className="outreach-field">
                  Email
                  <input
                    type="email"
                    value={manualEmail}
                    placeholder="candidate@example.com"
                    onChange={(event) => setManualEmail(event.target.value)}
                  />
                </label>
                <label className="outreach-field">
                  About / Professional Summary
                  <textarea
                    rows="5"
                    value={manualProfileText.about}
                    onChange={(event) =>
                      setManualProfileText((current) => ({ ...current, about: event.target.value }))
                    }
                  />
                </label>
                <label className="outreach-field">
                  Work Experience
                  <textarea
                    rows="8"
                    value={manualProfileText.workExperience}
                    onChange={(event) =>
                      setManualProfileText((current) => ({ ...current, workExperience: event.target.value }))
                    }
                  />
                </label>
                <label className="outreach-field">
                  Skills / Technologies
                  <textarea
                    rows="5"
                    value={manualProfileText.skills}
                    onChange={(event) =>
                      setManualProfileText((current) => ({ ...current, skills: event.target.value }))
                    }
                  />
                </label>
              </>
            )}

            {manualPreview && (
              <div className="manual-preview">
                <h4>Review extracted details</h4>
                <p>Select every field you approve. Existing values are not selected for replacement automatically.</p>
                {[
                  ['currentTitle', 'Current title'],
                  ['currentCompany', 'Current company'],
                  ['location', 'Location'],
                  ['skills', 'Skills'],
                  ['summary', 'Professional summary'],
                  ['employmentHistory', 'Employment history'],
                  ['yearsOfExperience', 'Total experience'],
                  ['email', 'Email'],
                ].map(([field, label]) => {
                  const value = manualPreview.extracted[field]
                  const displayValue = Array.isArray(value)
                    ? value.map((item) => typeof item === 'string'
                      ? item
                      : `${item.jobTitle} at ${item.company} (${item.startDate} – ${item.endDate})`).join(', ')
                    : value
                  if (displayValue === null || displayValue === '' || displayValue === undefined || displayValue.length === 0) return null
                  const replacesExisting = manualPreview.replacementFields.includes(field)
                  return (
                    <label className="manual-preview-field" key={field}>
                      <input
                        type="checkbox"
                        checked={manualApprovedFields.includes(field)}
                        onChange={() => toggleManualField(field)}
                      />
                      <span>
                        <strong>{label}{replacesExisting ? ' (replaces existing value)' : ''}</strong>
                        <small>{String(displayValue)}</small>
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            {manualError && (
              <p className="outreach-message error" role="alert">{manualError}</p>
            )}

            <div className="outreach-actions">
              {!manualPreview ? (
                <button
                  type="button"
                  className="outreach-generate"
                  disabled={manualStatus === 'extracting'}
                  onClick={previewManualEnrichment}
                >
                  {manualStatus === 'extracting' ? <LoadingLabel>Extracting...</LoadingLabel> : 'Preview Details'}
                </button>
              ) : (
                <button
                  type="button"
                  className="outreach-generate"
                  disabled={manualStatus === 'confirming' || manualApprovedFields.length === 0}
                  onClick={confirmManualEnrichment}
                >
                  {manualStatus === 'confirming' ? <LoadingLabel>Applying...</LoadingLabel> : 'Confirm Changes'}
                </button>
              )}
              <button type="button" onClick={closeManualEnrichment}>Cancel</button>
            </div>
          </section>
        </div>
      )}

      {outreachCandidate && (
        <div className="outreach-backdrop">
          <section
            className="outreach-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outreach-title"
          >
            <div className="outreach-heading">
              <div>
                <h3 id="outreach-title">Candidate Outreach</h3>
                <p>
                  Review and edit the message before opening your email app.
                </p>
              </div>
              <button
                type="button"
                className="outreach-close"
                aria-label="Close outreach panel"
                onClick={closeOutreach}
              >
                ×
              </button>
            </div>

            <dl className="outreach-recipient">
              <div>
                <dt>Candidate</dt>
                <dd>{outreachCandidate.fullName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{outreachCandidate.email}</dd>
              </div>
            </dl>

            <label className="outreach-field">
              Subject
              <input
                type="text"
                value={outreachSubject}
                onChange={(event) => setOutreachSubject(event.target.value)}
              />
            </label>

            <label className="outreach-field">
              Message
              <textarea
                rows="12"
                value={outreachBody}
                onChange={(event) => setOutreachBody(event.target.value)}
              />
            </label>

            {outreachStatus === 'success' && (
              <p className="outreach-message success" role="status">
                Outreach generated.
              </p>
            )}
            {outreachStatus === 'error' && (
              <p className="outreach-message error" role="alert">
                Unable to generate outreach.
              </p>
            )}
            {emailSentStatus === 'success' && (
              <p className="outreach-message success" role="status">
                Email marked as sent.
              </p>
            )}
            {emailSentStatus === 'error' && (
              <p className="outreach-message error" role="alert">
                Unable to record email activity.
              </p>
            )}
            {gmailOpenError && (
              <p className="outreach-message error" role="alert">
                Unable to open Gmail. Please allow pop-ups for this site.
              </p>
            )}

            <div className="outreach-actions">
              <button
                type="button"
                className="outreach-generate"
                disabled={outreachStatus === 'generating'}
                onClick={generateOutreach}
              >
                {outreachStatus === 'generating'
                  ? <LoadingLabel>Generating...</LoadingLabel>
                  : 'Generate with AI'}
              </button>
              <button
                type="button"
                disabled={!outreachCandidate.email}
                onClick={() => {
                  const opened = openGmailCompose({
                    to: outreachCandidate.email,
                    subject: outreachSubject,
                    body: outreachBody,
                  })
                  setGmailOpenError(!opened)
                }}
              >
                Open in Gmail
              </button>
              <button
                type="button"
                title={
                  outreachCandidate.isSaved
                    ? undefined
                    : 'Save the candidate before recording activity'
                }
                disabled={
                  !outreachCandidate.isSaved || emailSentStatus === 'saving'
                }
                onClick={() =>
                  markOutreachAsSent({
                    candidate: outreachCandidate,
                    type: 'EMAIL_SENT',
                    channel: 'email',
                    message: outreachBody,
                    setStatus: setEmailSentStatus,
                  })
                }
              >
                {emailSentStatus === 'saving'
                  ? <LoadingLabel>Marking...</LoadingLabel>
                  : 'Mark as Sent'}
              </button>
              <button type="button" onClick={closeOutreach}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {linkedinOutreachCandidate && (
        <div className="outreach-backdrop">
          <section
            className="outreach-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="linkedin-outreach-title"
          >
            <div className="outreach-heading">
              <div>
                <h3 id="linkedin-outreach-title">
                  {isLinkedinConnectionRequest
                    ? 'Connection Request'
                    : 'LinkedIn Message'}
                </h3>
                <p>
                  Review and edit the draft, then paste it manually on
                  LinkedIn.
                </p>
              </div>
              <button
                type="button"
                className="outreach-close"
                aria-label="Close LinkedIn outreach panel"
                onClick={closeLinkedInOutreach}
              >
                ×
              </button>
            </div>

            <dl className="outreach-recipient linkedin-recipient">
              <div>
                <dt>Candidate</dt>
                <dd>{linkedinOutreachCandidate.fullName}</dd>
              </div>
            </dl>

            <label className="outreach-field">
              Message
              <textarea
                rows={isLinkedinConnectionRequest ? 6 : 12}
                value={linkedinMessage}
                onChange={(event) => {
                  setLinkedinMessage(event.target.value)
                  setLinkedinCopyStatus('idle')
                }}
              />
            </label>

            {isLinkedinConnectionRequest && (
              <p
                className={`outreach-character-count ${
                  isLinkedinMessageTooLong ? 'invalid' : ''
                }`}
              >
                Character count: {linkedinMessage.length} /{' '}
                {linkedinConnectionMaxLength}
              </p>
            )}

            {isLinkedinMessageTooLong && (
              <p className="outreach-message error" role="alert">
                Connection request notes must be 250 characters or fewer.
              </p>
            )}
            {linkedinOutreachStatus === 'success' && (
              <p className="outreach-message success" role="status">
                Message generated.
              </p>
            )}
            {linkedinOutreachStatus === 'error' && (
              <p className="outreach-message error" role="alert">
                Unable to generate LinkedIn outreach.
              </p>
            )}
            {linkedinCopyStatus === 'copied' && (
              <p className="outreach-copy-feedback" role="status">
                Copied
              </p>
            )}
            {linkedinCopyStatus === 'error' && (
              <p className="outreach-message error" role="alert">
                Unable to copy message.
              </p>
            )}
            {linkedinSentStatus === 'success' && (
              <p className="outreach-message success" role="status">
                LinkedIn outreach marked as sent.
              </p>
            )}
            {linkedinSentStatus === 'error' && (
              <p className="outreach-message error" role="alert">
                Unable to record LinkedIn activity.
              </p>
            )}

            <div className="outreach-actions">
              <button
                type="button"
                className="outreach-generate"
                disabled={linkedinOutreachStatus === 'generating'}
                onClick={generateLinkedInOutreach}
              >
                {linkedinOutreachStatus === 'generating'
                  ? <LoadingLabel>Generating...</LoadingLabel>
                  : 'Generate with AI'}
              </button>
              {isLinkedinMessageTooLong ? (
                <button type="button" disabled>
                  Open LinkedIn Profile
                </button>
              ) : (
                <a
                  href={linkedinOutreachCandidate.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open LinkedIn Profile
                </a>
              )}
              <button
                type="button"
                disabled={
                  !linkedinMessage.trim() || isLinkedinMessageTooLong
                }
                onClick={copyLinkedInMessage}
              >
                Copy Message
              </button>
              <button
                type="button"
                title={
                  linkedinOutreachCandidate.isSaved
                    ? undefined
                    : 'Save the candidate before recording activity'
                }
                disabled={
                  !linkedinOutreachCandidate.isSaved ||
                  !linkedinMessage.trim() ||
                  isLinkedinMessageTooLong ||
                  linkedinSentStatus === 'saving'
                }
                onClick={() =>
                  markOutreachAsSent({
                    candidate: linkedinOutreachCandidate,
                    type: isLinkedinConnectionRequest
                      ? 'LINKEDIN_CONNECT_SENT'
                      : 'LINKEDIN_MESSAGE_SENT',
                    channel: 'linkedin',
                    message: linkedinMessage,
                    setStatus: setLinkedinSentStatus,
                  })
                }
              >
                {linkedinSentStatus === 'saving'
                  ? <LoadingLabel>Marking...</LoadingLabel>
                  : 'Mark as Sent'}
              </button>
              <button type="button" onClick={closeLinkedInOutreach}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {activityCandidate && (
        <CandidateActivityPanel
          candidate={activityCandidate}
          onClose={() => setActivityCandidate(null)}
        />
      )}

      {detailsCandidate && (
        <CandidateDetailsPanel
          candidate={detailsCandidate}
          loadingActions={{
            enrich: loadingActions.isLoading(`${detailsCandidate.id}:enrich`),
            save: loadingActions.isLoading(`${detailsCandidate.id}:save`),
            matching: loadingActions.isLoading(`${detailsCandidate.id}:matching`),
          }}
          actions={{
            onSaveDetails: updateCandidateDetails,
            onRerunMatching: rerunCandidateMatching,
            onAddProfileDetails: openManualEnrichment,
            onEnrich: enrichCandidate,
            onFindEmail: setEmailDiscoveryCandidate,
            onSave: saveCandidate,
            onEmail: openOutreach,
            onLinkedInMessage: (candidate) =>
              openLinkedInOutreach(candidate, 'linkedin-message'),
            onConnect: (candidate) =>
              openLinkedInOutreach(candidate, 'linkedin-connect'),
            onInviteInterview: setInterviewCandidate,
          }}
          onClose={() => setDetailsCandidateId(null)}
        />
      )}

      {projectAssignmentCandidates && (
        <ProjectAssignmentModal
          candidates={projectAssignmentCandidates}
          originatingProjectId={originatingProject?.id ?? null}
          onClose={() => setProjectAssignmentCandidates(null)}
          onAssigned={(_projectIds, projects, savedCandidates) => {
            const savedByOriginalId = new Map(savedCandidates.map((candidate) => [candidate.originalId, candidate]))
            setResults((currentResults) => currentResults.map((candidate) => savedByOriginalId.has(candidate.id) ? { ...candidate, id: savedByOriginalId.get(candidate.id).id, isSaved: true } : candidate))
            setSelectedCandidateIds((currentIds) => currentIds.filter((id) => !savedByOriginalId.has(id)))
            setAssignedProjects(projects)
            setProjectAssignmentCandidates(null)
          }}
        />
      )}

      {interviewCandidate && (
        <InterviewInvitationModal
          candidate={interviewCandidate}
          job={{
            role: search.role.trim(),
            requiredSkills: parseList(search.requiredSkills),
            preferredSkills: parseList(search.preferredSkills),
            location: search.location.trim(),
            description: '',
          }}
          onCandidateUpdated={(savedCandidate) => {
            applyPersistentCandidateUpdate(
              interviewCandidate.id,
              savedCandidate,
            )
            setInterviewCandidate((currentCandidate) => ({
              ...currentCandidate,
              ...savedCandidate,
              isSaved: true,
            }))
          }}
          onClose={() => setInterviewCandidate(null)}
        />
      )}

      {emailDiscoveryCandidate && (
        <CandidateEmailDiscoveryModal
          candidate={emailDiscoveryCandidate}
          importSessionId={
            emailDiscoveryCandidate.isSaved ? undefined : activeImportSessionId
          }
          onConfirmed={(updatedCandidate) => {
            setResults((currentResults) =>
              sortCandidateResults(
                currentResults.map((candidate) =>
                  candidate.id === emailDiscoveryCandidate.id
                    ? { ...candidate, ...updatedCandidate }
                    : candidate,
                ),
              ),
            )
            setActionMessage({
              type: 'success',
              text: 'Professional email confirmed.',
            })
          }}
          onClose={() => setEmailDiscoveryCandidate(null)}
        />
      )}
    </section>
  )
}

export default SearchCandidates
