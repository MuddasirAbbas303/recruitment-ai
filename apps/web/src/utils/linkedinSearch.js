function normalizeList(values = []) {
  const seenValues = new Set()

  return values.reduce((normalizedValues, value) => {
    if (typeof value !== 'string') {
      return normalizedValues
    }

    const normalizedValue = value.trim()
    const identity = normalizedValue.toLowerCase()

    if (!normalizedValue || seenValues.has(identity)) {
      return normalizedValues
    }

    seenValues.add(identity)
    normalizedValues.push(normalizedValue)
    return normalizedValues
  }, [])
}

function quoteSearchTerm(value) {
  const safeValue = value
    .trim()
    .replace(/\\/g, ' ')
    .replace(/"/g, ' ')
    .replace(/\s+/g, ' ')

  return safeValue ? `"${safeValue}"` : ''
}

function getRoleAlternatives(role) {
  const normalizedRole = typeof role === 'string' ? role.trim() : ''

  if (!normalizedRole) {
    return []
  }

  const alternatives = [normalizedRole]

  if (/\bdeveloper\b/i.test(normalizedRole)) {
    alternatives.push(normalizedRole.replace(/\bdeveloper\b/i, 'Engineer'))
  } else if (/\bengineer\b/i.test(normalizedRole)) {
    alternatives.push(normalizedRole.replace(/\bengineer\b/i, 'Developer'))
  }

  return normalizeList(alternatives)
}

function buildOrGroup(values) {
  const quotedValues = normalizeList(values).map(quoteSearchTerm).filter(Boolean)
  return quotedValues.length > 0 ? `(${quotedValues.join(' OR ')})` : ''
}

export function buildLinkedInXrayQuery(criteria = {}) {
  const roleGroup = buildOrGroup(getRoleAlternatives(criteria.role))
  const requiredSkills = normalizeList(criteria.requiredSkills)
  const preferredSkills = normalizeList(criteria.preferredSkills).slice(0, 3)
  const keywords = normalizeList(criteria.keywords)
  const excludeKeywords = normalizeList(criteria.excludeKeywords)
  const location =
    typeof criteria.location === 'string'
      ? quoteSearchTerm(criteria.location)
      : ''
  const queryParts = ['site:linkedin.com/in']

  if (roleGroup) {
    queryParts.push(roleGroup)
  }

  requiredSkills.forEach((skill) => {
    queryParts.push(`(${quoteSearchTerm(skill)})`)
  })

  if (preferredSkills.length > 0) {
    queryParts.push(buildOrGroup(preferredSkills))
  }

  if (location) {
    queryParts.push(location)
  }

  keywords.forEach((keyword) => {
    queryParts.push(quoteSearchTerm(keyword))
  })

  queryParts.push('-intitle:"profiles"', '-inurl:"dir"')

  excludeKeywords.forEach((keyword) => {
    queryParts.push(`-${quoteSearchTerm(keyword)}`)
  })

  return queryParts.filter(Boolean).join(' ')
}

export function buildGoogleSearchUrl(criteria = {}) {
  const searchParameters = new URLSearchParams({
    q: buildLinkedInXrayQuery(criteria),
  })

  return `https://www.google.com/search?${searchParameters.toString()}`
}
