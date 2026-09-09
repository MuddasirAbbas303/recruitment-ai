import { DatabaseCandidateSource } from './databaseCandidateSource.js'
import { CoresignalCandidateSource } from './coresignalCandidateSource.js'
import { GroqWebCandidateSource } from './groqWebCandidateSource.js'
import { MockExternalCandidateSource } from './mockExternalCandidateSource.js'
import { CandidateSourceConfigurationError } from './candidateSource.js'

const DEFAULT_EXTERNAL_PROVIDER = 'mock'

export {
  CandidateSourceConfigurationError,
  CandidateSourceRequestError,
} from './candidateSource.js'

function createExternalCandidateSource() {
  const provider =
    process.env.EXTERNAL_CANDIDATE_PROVIDER?.trim().toLowerCase() ||
    DEFAULT_EXTERNAL_PROVIDER

  if (provider === 'mock') {
    return new MockExternalCandidateSource()
  }

  if (provider === 'coresignal') {
    return new CoresignalCandidateSource()
  }

  if (provider === 'groq-web') {
    return new GroqWebCandidateSource()
  }

  throw new CandidateSourceConfigurationError(
    'External candidate provider is not supported. Check EXTERNAL_CANDIDATE_PROVIDER.',
  )
}

export function createCandidateSource(source) {
  if (source === 'database') {
    return new DatabaseCandidateSource()
  }

  if (source === 'external') {
    return createExternalCandidateSource()
  }

  throw new CandidateSourceConfigurationError(
    `Unsupported candidate source: ${source}.`,
  )
}
