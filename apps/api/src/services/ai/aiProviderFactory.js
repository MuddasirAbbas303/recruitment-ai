import { AIConfigurationError } from './aiErrors.js'
import { createGroqProvider } from './groqProvider.js'
import { createOpenAIProvider } from './openaiProvider.js'

const providerFactories = {
  groq: createGroqProvider,
  openai: createOpenAIProvider,
}

export function getConfiguredAIProviderName() {
  return process.env.AI_PROVIDER?.trim().toLowerCase() || 'groq'
}

export function createAIProvider(providerName = getConfiguredAIProviderName()) {
  const normalizedName = String(providerName).trim().toLowerCase()
  const factory = providerFactories[normalizedName]

  if (!factory) {
    throw new AIConfigurationError(
      'Unsupported AI provider configuration. Use "groq" or "openai".',
    )
  }

  return factory()
}
