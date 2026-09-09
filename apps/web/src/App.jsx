import { useEffect, useState } from 'react'
import './App.css'
import CandidateDatabase from './components/CandidateDatabase.jsx'
import SearchCandidates from './components/SearchCandidates.jsx'

const initialJobData = {
  title: '',
  description: '',
  requiredSkills: '',
  preferredSkills: '',
  minimumExperience: '',
  location: '',
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseSkills(value) {
  return value
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
}

function getRecommendation(score) {
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

function App() {
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).has('importSession')
      ? 'candidate-sourcing'
      : 'cv-matching',
  )
  const [candidateSourcingTab, setCandidateSourcingTab] = useState(
    'search-candidates',
  )
  const [apiStatus, setApiStatus] = useState('checking')
  const [jobData, setJobData] = useState(initialJobData)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisMessage, setAnalysisMessage] = useState(null)
  const [analysisResults, setAnalysisResults] = useState(null)
  const [failedResumes, setFailedResumes] = useState([])
  const [expandedAnalysis, setExpandedAnalysis] = useState(null)

  useEffect(() => {
    let isActive = true

    fetch('http://localhost:3000/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('API request failed')
        }

        return response.json()
      })
      .then(() => {
        if (isActive) {
          setApiStatus('connected')
        }
      })
      .catch(() => {
        if (isActive) {
          setApiStatus('failed')
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  const statusMessage = {
    checking: 'Checking API...',
    connected: 'API Connected',
    failed: 'API Connection Failed',
  }[apiStatus]

  const analyzeDisabled =
    isAnalyzing ||
    selectedFiles.length === 0 ||
    jobData.title.trim() === '' ||
    jobData.description.trim() === ''

  const successfulResults = [...(analysisResults ?? [])].sort(
    (firstResult, secondResult) =>
      secondResult.overallScore - firstResult.overallScore,
  )

  function handleJobChange(event) {
    const { name, value } = event.target
    setJobData((currentJobData) => ({
      ...currentJobData,
      [name]: value,
    }))
    setAnalysisResults(null)
    setFailedResumes([])
    setExpandedAnalysis(null)
    setAnalysisMessage(null)
  }

  function handleFileChange(event) {
    const supportedFiles = Array.from(event.target.files).filter((file) => {
      const fileName = file.name.toLowerCase()
      return fileName.endsWith('.pdf') || fileName.endsWith('.docx')
    })

    setSelectedFiles(supportedFiles)
    setAnalysisResults(null)
    setFailedResumes([])
    setExpandedAnalysis(null)
    setAnalysisMessage(null)
    event.target.value = ''
  }

  function removeFile(fileIndex) {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_, index) => index !== fileIndex),
    )
    setAnalysisResults(null)
    setFailedResumes([])
    setExpandedAnalysis(null)
    setAnalysisMessage(null)
  }

  async function handleAnalyze(event) {
    event.preventDefault()
    setIsAnalyzing(true)
    setAnalysisMessage(null)
    setAnalysisResults(null)
    setFailedResumes([])
    setExpandedAnalysis(null)

    const formData = new FormData()
    selectedFiles.forEach((file) => {
      formData.append('resumes', file)
    })
    formData.append('title', jobData.title)
    formData.append('description', jobData.description)
    formData.append(
      'requiredSkills',
      JSON.stringify(parseSkills(jobData.requiredSkills)),
    )
    formData.append(
      'preferredSkills',
      JSON.stringify(parseSkills(jobData.preferredSkills)),
    )
    formData.append(
      'minimumExperience',
      jobData.minimumExperience || '0',
    )
    formData.append('location', jobData.location)

    try {
      const response = await fetch(
        'http://localhost:3000/api/resumes/analyze',
        {
          method: 'POST',
          body: formData,
        },
      )
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Unable to analyze resumes.')
      }

      setAnalysisResults(result.results)
      setFailedResumes(result.failed ?? [])
    } catch (error) {
      setAnalysisMessage({
        type: 'error',
        text: error.message || 'Unable to analyze resumes.',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  function toggleAnalysis(candidateId) {
    setExpandedAnalysis((currentCandidateId) =>
      currentCandidateId === candidateId ? null : candidateId,
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Recruitment AI</p>
          <h1>Recruitment workspace</h1>
        </div>

        <nav className="tabs" role="tablist" aria-label="Recruitment tools">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'candidate-sourcing'}
            aria-controls="candidate-sourcing-panel"
            className={activeTab === 'candidate-sourcing' ? 'active' : ''}
            onClick={() => setActiveTab('candidate-sourcing')}
          >
            Candidate Sourcing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cv-matching'}
            aria-controls="cv-matching-panel"
            className={activeTab === 'cv-matching' ? 'active' : ''}
            onClick={() => setActiveTab('cv-matching')}
          >
            CV Matching
          </button>
        </nav>
      </header>

      <main className="page-content">
        {activeTab === 'candidate-sourcing' ? (
          <section
            id="candidate-sourcing-panel"
            role="tabpanel"
          >
            <div className="page-intro">
              <h2>Candidate Sourcing</h2>
              <p>Find new talent and manage candidates already saved.</p>
            </div>

            <nav
              className="sub-tabs"
              role="tablist"
              aria-label="Candidate sourcing tools"
            >
              <button
                type="button"
                role="tab"
                aria-selected={candidateSourcingTab === 'search-candidates'}
                aria-controls="search-candidates-panel"
                className={
                  candidateSourcingTab === 'search-candidates' ? 'active' : ''
                }
                onClick={() => setCandidateSourcingTab('search-candidates')}
              >
                Search Candidates
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={candidateSourcingTab === 'candidate-database'}
                aria-controls="candidate-database-panel"
                className={
                  candidateSourcingTab === 'candidate-database' ? 'active' : ''
                }
                onClick={() => setCandidateSourcingTab('candidate-database')}
              >
                Candidate Database
              </button>
            </nav>

            {candidateSourcingTab === 'search-candidates' ? (
              <div id="search-candidates-panel" role="tabpanel">
                <SearchCandidates />
              </div>
            ) : (
              <div id="candidate-database-panel" role="tabpanel">
                <CandidateDatabase />
              </div>
            )}
          </section>
        ) : (
          <section id="cv-matching-panel" role="tabpanel">
            <div className="page-intro">
              <h2>CV Matching</h2>
              <p>
                Upload resumes and compare candidates against a job position.
              </p>
            </div>

            <form onSubmit={handleAnalyze}>
              <section className="card" aria-labelledby="job-description-title">
                <div className="section-heading">
                  <h3 id="job-description-title">Job Description</h3>
                  <p>Enter the role details used to compare candidates.</p>
                </div>

                <div className="form-grid">
                  <label>
                    Job Title
                    <input
                      name="title"
                      value={jobData.title}
                      onChange={handleJobChange}
                    />
                  </label>

                  <label className="full-width">
                    Job Description
                    <textarea
                      name="description"
                      rows="6"
                      value={jobData.description}
                      onChange={handleJobChange}
                    />
                  </label>

                  <label>
                    Required Skills
                    <input
                      name="requiredSkills"
                      value={jobData.requiredSkills}
                      onChange={handleJobChange}
                    />
                  </label>

                  <label>
                    Preferred Skills
                    <input
                      name="preferredSkills"
                      value={jobData.preferredSkills}
                      onChange={handleJobChange}
                    />
                  </label>

                  <label>
                    Minimum Experience
                    <input
                      type="number"
                      min="0"
                      name="minimumExperience"
                      value={jobData.minimumExperience}
                      onChange={handleJobChange}
                    />
                  </label>

                  <label>
                    Location
                    <input
                      name="location"
                      value={jobData.location}
                      onChange={handleJobChange}
                    />
                  </label>
                </div>
              </section>

              <section className="card" aria-labelledby="resume-upload-title">
                <div className="section-heading">
                  <h3 id="resume-upload-title">Resume Upload</h3>
                  <p>Select one or more PDF or DOCX resumes.</p>
                </div>

                <label className="file-picker">
                  Choose resumes
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                  />
                </label>

                {selectedFiles.length > 0 && (
                  <ul className="file-list" aria-label="Selected resumes">
                    {selectedFiles.map((file, index) => (
                      <li key={`${file.name}-${file.lastModified}`}>
                        <div>
                          <strong>{file.name}</strong>
                          <span>{formatFileSize(file.size)}</span>
                        </div>
                        <button
                          type="button"
                          className="remove-button"
                          onClick={() => removeFile(index)}
                          aria-label={`Remove ${file.name}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {analysisMessage && (
                <p
                  className={`upload-message ${analysisMessage.type}`}
                  role="alert"
                >
                  {analysisMessage.text}
                </p>
              )}

              <button
                type="submit"
                className="analyze-button"
                disabled={analyzeDisabled}
              >
                {isAnalyzing ? 'Analyzing resumes...' : 'Analyze Resumes'}
              </button>
            </form>

            {analysisResults && (
              <section
                className="results-section"
                aria-labelledby="matching-results-title"
              >
                <div className="results-heading">
                  <div>
                    <p className="eyebrow">Ranked candidates</p>
                    <h2 id="matching-results-title">CV Matching Results</h2>
                  </div>
                  <span>
                    {successfulResults.length} analyzed successfully
                  </span>
                </div>

                {successfulResults.length > 0 ? (
                  <ol className="candidate-list">
                    {successfulResults.map((candidate, index) => {
                      const candidateId = `${candidate.fileName}-${index}`
                      const isExpanded = expandedAnalysis === candidateId

                      return (
                        <li className="candidate-result" key={candidateId}>
                          <div className="candidate-overview">
                            <div className="candidate-rank" aria-hidden="true">
                              {index + 1}
                            </div>
                            <div className="candidate-details">
                              <h3>{candidate.candidateName}</h3>
                              <p>{candidate.currentTitle}</p>
                              <div className="candidate-meta">
                                <strong>
                                  {candidate.overallScore}% -{' '}
                                  {getRecommendation(candidate.overallScore)}
                                </strong>
                                <span>
                                  {candidate.yearsOfExperience}{' '}
                                  {candidate.yearsOfExperience === 1
                                    ? 'year'
                                    : 'years'}{' '}
                                  experience
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="analysis-toggle"
                              aria-expanded={isExpanded}
                              aria-controls={`${candidateId}-analysis`}
                              onClick={() => toggleAnalysis(candidateId)}
                            >
                              {isExpanded ? 'Hide Analysis' : 'View Analysis'}
                            </button>
                          </div>

                          {isExpanded && (
                            <div
                              className="analysis-details"
                              id={`${candidateId}-analysis`}
                            >
                              <dl className="score-grid">
                                <div>
                                  <dt>Required skills</dt>
                                  <dd>{candidate.requiredSkillsScore}%</dd>
                                </div>
                                <div>
                                  <dt>Preferred skills</dt>
                                  <dd>{candidate.preferredSkillsScore}%</dd>
                                </div>
                                <div>
                                  <dt>Experience</dt>
                                  <dd>{candidate.experienceScore}%</dd>
                                </div>
                              </dl>

                              <div className="analysis-grid">
                                <div>
                                  <h4>Matched skills</h4>
                                  <p>
                                    {candidate.matchedSkills.join(', ') ||
                                      'None identified'}
                                  </p>
                                </div>
                                <div>
                                  <h4>Missing skills</h4>
                                  <p>
                                    {candidate.missingSkills.join(', ') ||
                                      'None identified'}
                                  </p>
                                </div>
                                <div>
                                  <h4>Strengths</h4>
                                  <ul>
                                    {candidate.strengths.map((strength) => (
                                      <li key={strength}>{strength}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <h4>Concerns</h4>
                                  <ul>
                                    {candidate.concerns.map((concern) => (
                                      <li key={concern}>{concern}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              <div className="analysis-summary">
                                <h4>Summary</h4>
                                <p>{candidate.summary}</p>
                              </div>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                ) : (
                  <p className="no-results">
                    No resumes were analyzed successfully.
                  </p>
                )}

                {failedResumes.length > 0 && (
                  <div className="failed-results">
                    <h3>Failed to analyze:</h3>
                    <ul>
                      {failedResumes.map((result, index) => (
                        <li key={`${result.fileName}-${index}`}>
                          {result.fileName} — {result.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </section>
        )}
      </main>

      <footer className={`api-status ${apiStatus}`} aria-live="polite">
        <span aria-hidden="true" />
        {statusMessage}
      </footer>
    </div>
  )
}

export default App
