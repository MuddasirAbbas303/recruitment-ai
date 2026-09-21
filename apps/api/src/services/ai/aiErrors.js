export class AIConfigurationError extends Error {
  constructor(message, provider = null) {
    super(message)
    this.name = 'AIConfigurationError'
    this.provider = provider
  }
}

export class AIServiceError extends Error {
  constructor(message, statusCode = 502, provider = null, code = null) {
    super(message)
    this.name = 'AIServiceError'
    this.statusCode = statusCode
    this.provider = provider
    this.code = code
  }
}
