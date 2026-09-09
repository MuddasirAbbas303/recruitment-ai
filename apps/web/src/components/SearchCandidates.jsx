import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  buildGoogleSearchUrl,
  buildLinkedInXrayQuery,
} from '../utils/linkedinSearch.js'

const candidatesApiUrl = 'http://localhost:3000/api/candidates'
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

function openGoogleSearch(criteria) {
  const searchLink = document.createElement('a')
  searchLink.href = buildGoogleSearchUrl(criteria)
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

function SearchCandidates() {
  const [search, setSearch] = useState(initialSearch)
  const [searchStatus, setSearchStatus] = useState('idle')
  const [results, setResults] = useState([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([])
  const [savingCandidateIds, setSavingCandidateIds] = useState([])
  const [savingNotesIds, setSavingNotesIds] = useState([])
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [actionMessage, setActionMessage] = useState(null)
  const [expandedAnalysisId, setExpandedAnalysisId] = useState(null)
  const [externalSearchOpened, setExternalSearchOpened] = useState(false)
  const [importBannerCount, setImportBannerCount] = useState(null)
  const [importError, setImportError] = useState(null)

  useEffect(() => {
    const currentUrl = new URL(window.location.href)
    const importSessionId = currentUrl.searchParams.get('importSession')

    if (!importSessionId) {
      return undefined
    }

    const abortController = new AbortController()
    setSearchStatus('loading-import')
    setImportError(null)

    fetch(
      `${candidatesApiUrl}/import-sessions/${encodeURIComponent(importSessionId)}`,
      { signal: abortController.signal },
    )
      .then(async (response) => {
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load imported candidates.')
        }

        return result
      })
      .then((result) => {
        const importedResults = sortCandidateResults(result.results ?? [])

        setResults(importedResults)
        setSelectedCandidateIds([])
        setExpandedAnalysisId(null)
        setActionMessage(null)
        setExternalSearchOpened(false)
        setImportBannerCount(importedResults.length)
        setSearchStatus('success')

        currentUrl.searchParams.delete('importSession')
        window.history.replaceState(
          window.history.state,
          '',
          `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
        )
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setSearchStatus('idle')
          setImportError('Unable to load imported candidates.')
        }
      })

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

    if (shouldOpenGoogle) {
      openGoogleSearch(payload)
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
      setSavingCandidateIds((currentIds) =>
        currentIds.filter((candidateId) => candidateId !== candidate.id),
      )
    }
  }

  async function saveCandidates(candidates) {
    setIsBulkSaving(true)
    setActionMessage(null)
    let savedCount = 0

    for (const candidate of candidates) {
      if (await saveCandidate(candidate, false)) {
        savedCount += 1
      }
    }

    setIsBulkSaving(false)
    setActionMessage({
      type: savedCount === candidates.length ? 'success' : 'error',
      text:
        savedCount === candidates.length
          ? `${savedCount} ${savedCount === 1 ? 'candidate' : 'candidates'} saved successfully.`
          : `${savedCount} of ${candidates.length} candidates saved.`,
    })
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
            searchStatus === 'searching' || searchStatus === 'loading-import'
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
                onClick={() => saveCandidates(selectedUnsavedCandidates)}
                disabled={
                  selectedUnsavedCandidates.length === 0 || isBulkSaving
                }
              >
                Save Selected
              </button>
              <button
                type="button"
                onClick={() => saveCandidates(unsavedCandidates)}
                disabled={unsavedCandidates.length === 0 || isBulkSaving}
              >
                Save All
              </button>
            </div>
          </div>

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
                            disabled={candidate.isSaved || isBulkSaving}
                            onChange={() =>
                              toggleCandidateSelection(candidate.id)
                            }
                          />
                        </td>
                        <td className="candidate-name-cell">
                          {candidate.fullName}
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
                              <span>Score unavailable</span>
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
                              className="save-candidate-button"
                              disabled={
                                candidate.isSaved || isSaving || isBulkSaving
                              }
                              onClick={() => saveCandidate(candidate)}
                            >
                              {candidate.isSaved
                                ? 'Saved'
                                : isSaving
                                  ? 'Saving...'
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
                                    {candidate.matchAnalysis.requiredSkillsScore}%
                                  </dd>
                                </div>
                                <div>
                                  <dt>Preferred Skills Score</dt>
                                  <dd>
                                    {candidate.matchAnalysis.preferredSkillsScore}%
                                  </dd>
                                </div>
                                <div>
                                  <dt>Experience Score</dt>
                                  <dd>
                                    {candidate.matchAnalysis.experienceScore}%
                                  </dd>
                                </div>
                                <div>
                                  <dt>Role Score</dt>
                                  <dd>{candidate.matchAnalysis.roleScore}%</dd>
                                </div>
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
                                  <h4>Missing Skills</h4>
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
    </section>
  )
}

export default SearchCandidates
