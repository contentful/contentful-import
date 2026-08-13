export const GRAPHQL_SCHEMA_STALE_DELAYS_MS = [500, 1500, 6000]

type ContentfulValidationError = {
  details?: {
    errors?: Array<{ message?: string }>
  }
}

export function isGraphQLSchemaStaleError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }

  let parsed: ContentfulValidationError
  try {
    parsed = JSON.parse(err.message) as ContentfulValidationError
  } catch {
    return false
  }

  const errors = parsed?.details?.errors
  if (!Array.isArray(errors)) {
    return false
  }

  const matched = errors.some(
    (e) =>
      typeof e.message === 'string' &&
      (e.message.includes('GraphQL validation error') || e.message.includes('Unknown content type') || e.message.includes('Pointer path does not exist for'))
  )
  return matched
}
