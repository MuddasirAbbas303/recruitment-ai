import { candidateAnalysisSchema } from '../src/services/groqService.js'

const sampleJob = {
  title: 'Senior Backend Developer',
  description:
    'Build and operate reliable backend services for a recruitment platform.',
  requiredSkills: ['Node.js', 'PostgreSQL', 'AWS'],
  preferredSkills: ['Docker', 'Redis'],
  minimumExperience: 5,
  location: 'Europe',
}

const sampleResumeText = `
John Smith
Senior Backend Developer

Seven years of experience building Node.js services and PostgreSQL databases.
Deployed production systems on AWS and containerized applications with Docker.
Led API design, performance optimization, and reliability initiatives.
`

const response = await fetch('http://localhost:3000/api/ai/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    job: sampleJob,
    resumeText: sampleResumeText,
  }),
})

const result = await response.json()

if (!response.ok) {
  console.error(`Manual AI test failed with HTTP ${response.status}:`)
  console.error(result.error)
  process.exitCode = 1
} else {
  const validatedResult = candidateAnalysisSchema.parse(result)
  console.log(JSON.stringify(validatedResult, null, 2))
}
