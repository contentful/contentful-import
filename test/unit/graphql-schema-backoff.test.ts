import { isGraphQLSchemaStaleError } from '../../lib/utils/graphql-schema-backoff'

function makeContentfulError(details: object, name = 'ValidationFailed'): Error {
  const err = new Error(
    JSON.stringify({
      status: 422,
      statusText: '',
      message: 'Validation error',
      details,
    })
  )
  err.name = name
  return err
}

const GRAPHQL_VALIDATION_ERROR = {
  errors: [{ message: 'GraphQL validation error: Cannot query field "foo" on type "Query".' }],
}

const UNKNOWN_CONTENT_TYPE_ERROR = {
  errors: [{ message: 'Unknown content type "myContentType".' }],
}

const MIXED_ERRORS = {
  errors: [
    { message: 'Pointer path does not exist for ...' },
    { message: 'GraphQL validation error: Cannot query field "bar" on type "Query".' },
    { message: 'Unknown content type "anotherType".' },
  ],
}

const UNRELATED_ERRORS = {
  errors: [{ message: 'Some other validation error unrelated to GraphQL schema.' }],
}

describe('isGraphQLSchemaStaleError', () => {
  describe('returns true', () => {
    test('for a GraphQL validation error', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError(GRAPHQL_VALIDATION_ERROR))).toBe(true)
    })

    test('for an Unknown content type error', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError(UNKNOWN_CONTENT_TYPE_ERROR))).toBe(true)
    })

    test('when stale schema message is mixed with other errors', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError(MIXED_ERRORS))).toBe(true)
    })
  })

  describe('returns false', () => {
    test('for an unrelated validation error', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError(UNRELATED_ERRORS))).toBe(false)
    })

    test('when details.errors is missing', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError({}))).toBe(false)
    })

    test('when details.errors is not an array', () => {
      expect(isGraphQLSchemaStaleError(makeContentfulError({ errors: 'not an array' }))).toBe(false)
    })

    test('when err is not an Error instance', () => {
      expect(isGraphQLSchemaStaleError({ message: 'GraphQL validation error' })).toBe(false)
    })

    test('when err is null', () => {
      expect(isGraphQLSchemaStaleError(null)).toBe(false)
    })

    test('when err.message is not JSON', () => {
      const err = new Error('plain string message, not JSON')
      expect(isGraphQLSchemaStaleError(err)).toBe(false)
    })

    test('when the error name is different but message matches', () => {
      // Confirm we match on message content, not error name
      const err = makeContentfulError(GRAPHQL_VALIDATION_ERROR, 'SomeOtherError')
      expect(isGraphQLSchemaStaleError(err)).toBe(true)
    })
  })
})
