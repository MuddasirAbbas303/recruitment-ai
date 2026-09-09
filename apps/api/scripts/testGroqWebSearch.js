import dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config({ quiet: true })

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const MAX_REQUESTS = 2
const REQUEST_TIMEOUT_MS = 20_000
const UNEXPECTEDLY_LARGE_BYTES = 1_024

const payload = {
  model: 'groq/compound-mini',
  messages: [
    {
      role: 'user',
      content: 'What is the latest news about Node.js?',
    },
  ],
}
const serialized = JSON.stringify(payload)
const requestBytes = Buffer.byteLength(serialized, 'utf8')

let requestCount = 0

function safeText(value) {
  if (typeof value !== 'string') {
    return null
  }

  const safeValue = value
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 128)

  return safeValue || null
}

function getHeader(headers, name) {
  if (typeof headers?.get === 'function') {
    return headers.get(name)
  }

  if (headers && typeof headers === 'object') {
    return headers[name] ?? headers[name.toLowerCase()]
  }

  return null
}

function getRequestId(value) {
  return safeText(
    value?.request_id ??
      value?.requestID ??
      value?.requestId ??
      value?._request_id ??
      getHeader(value?.headers, 'x-request-id'),
  )
}

function getStatus(error) {
  return Number.isInteger(error?.status) ? error.status : null
}

function createResult(status = null, requestId = null, ran = false) {
  return {
    requestBytes,
    status,
    requestId,
    ran,
  }
}

function assertRequestAvailable() {
  if (requestCount >= MAX_REQUESTS) {
    throw new Error('Diagnostic request limit reached.')
  }

  requestCount += 1
}

async function sendWithSdk(client) {
  assertRequestAvailable()

  try {
    const { data, response, request_id: requestId } =
      await client.chat.completions.create(payload).withResponse()

    return createResult(
      response.status,
      safeText(requestId) ?? getRequestId(data),
      true,
    )
  } catch (error) {
    return createResult(getStatus(error), getRequestId(error), true)
  }
}

async function sendWithFetch(apiKey) {
  assertRequestAvailable()

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: serialized,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const result = createResult(
      response.status,
      safeText(response.headers.get('x-request-id')),
      true,
    )

    await response.body?.cancel()
    return result
  } catch {
    return createResult(null, null, true)
  }
}

function classify(sdkResult, directFetchResult) {
  if (requestBytes > UNEXPECTEDLY_LARGE_BYTES) {
    return 'Local request construction problem'
  }

  if (sdkResult.status === 413 && directFetchResult.status === 200) {
    return 'SDK/client configuration problem'
  }

  if (sdkResult.status === 413 && directFetchResult.status === 413) {
    return 'Groq/API account/gateway issue'
  }

  if (sdkResult.status === 200 && directFetchResult.status === 200) {
    return 'Existing groqWebCandidateSource is adding something excessive'
  }

  if (sdkResult.status === 200 && !directFetchResult.ran) {
    return 'SDK minimal request succeeded; direct fetch was not required'
  }

  return 'Request-size diagnostic was inconclusive'
}

console.log(`Groq diagnostic request size: ${requestBytes} bytes`)

const apiKey = process.env.GROQ_API_KEY?.trim()

if (!apiKey) {
  console.log(
    JSON.stringify(
      {
        error: 'Groq API key is not configured.',
        sdk: createResult(),
        directFetch: createResult(),
        requestCount,
        classification: 'Request-size diagnostic was inconclusive',
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
} else {
  // The SDK client has no default body, response format, conversation state,
  // middleware, or shared-service configuration. Only transport settings are set.
  const client = new OpenAI({
    apiKey,
    baseURL: GROQ_BASE_URL,
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  })
  const sdk = await sendWithSdk(client)
  const directFetch =
    sdk.status === 413
      ? await sendWithFetch(apiKey)
      : createResult()

  console.log(
    JSON.stringify(
      {
        sdk,
        directFetch,
        requestCount,
        classification: classify(sdk, directFetch),
      },
      null,
      2,
    ),
  )
}
