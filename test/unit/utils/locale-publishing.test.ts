import { logEmitter } from 'contentful-batch-libs/dist/logging'
import {
  destinationScopedThePublish,
  ensureLocalePublishingEntitlement,
  isLocalePublishingRejectedError,
  isLocaleScopingUnavailable,
  markLocaleScopingUnavailable,
  spaceHasLocalePublishingEntitlement
} from '../../../lib/utils/locale-publishing'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: { emit: jest.fn() }
}))

const mockEmit = jest.mocked(logEmitter.emit)

afterEach(() => {
  mockEmit.mockClear()
})

function makeClient (features: any, { withOrganization = true } = {}): any {
  const organizationId = withOrganization ? 'org-1' : null
  return {
    space: {
      get: jest.fn().mockResolvedValue({
        sys: { type: 'Space', ...(organizationId ? { organization: { sys: { id: organizationId } } } : {}) }
      })
    },
    raw: { get: jest.fn().mockResolvedValue({ features }) }
  }
}

describe('spaceHasLocalePublishingEntitlement', () => {
  test('reads the entitlement off the organization entitlement set', async () => {
    const client = makeClient({ localeBasedPublishing: { value: true } })

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBe(true)
    expect(client.raw.get).toHaveBeenCalledWith('/organizations/org-1/organization_entitlement_set')
  })

  test('accepts the older localePublishing feature key', async () => {
    const client = makeClient({ localePublishing: { value: true } })

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBe(true)
  })

  test('reports false when the named feature is off', async () => {
    const client = makeClient({ localeBasedPublishing: { value: false } })

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBe(false)
  })

  test('is inconclusive when the entitlement set names neither feature', async () => {
    const client = makeClient({ exoM1: { value: true } })

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBeNull()
  })

  test('is inconclusive when the space has no organization link', async () => {
    const client = makeClient({ localeBasedPublishing: { value: true } }, { withOrganization: false })

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBeNull()
    expect(client.raw.get).not.toHaveBeenCalled()
  })

  test('is inconclusive when the request fails', async () => {
    const client: any = { space: { get: jest.fn().mockRejectedValue(new Error('403')) }, raw: { get: jest.fn() } }

    await expect(spaceHasLocalePublishingEntitlement(client, 'space-1')).resolves.toBeNull()
  })
})

describe('ensureLocalePublishingEntitlement', () => {
  test('latches and warns once when the organization is not entitled', async () => {
    const client = makeClient({ localeBasedPublishing: { value: false } })

    await ensureLocalePublishingEntitlement(client, 'space-1')
    await ensureLocalePublishingEntitlement(client, 'space-1')

    expect(isLocaleScopingUnavailable(client)).toBe(true)
    // Checked once for the whole run, warned once.
    expect(client.raw.get).toHaveBeenCalledTimes(1)
    expect(mockEmit.mock.calls.filter((args) => args[0] === 'warning')).toHaveLength(1)
    expect(String(mockEmit.mock.calls[0][1])).toMatch(/only available on some plans/)
  })

  test('does not latch on an entitled organization', async () => {
    const client = makeClient({ localeBasedPublishing: { value: true } })

    await ensureLocalePublishingEntitlement(client, 'space-1')

    expect(isLocaleScopingUnavailable(client)).toBe(false)
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test('does not latch on an inconclusive answer', async () => {
    const client = makeClient({})

    await ensureLocalePublishingEntitlement(client, 'space-1')

    expect(isLocaleScopingUnavailable(client)).toBe(false)
  })
})

describe('markLocaleScopingUnavailable', () => {
  test('warns once per client and points at the environment setting by default', () => {
    const client = {}

    markLocaleScopingUnavailable(client, 'First reason.')
    markLocaleScopingUnavailable(client, 'Second reason.')

    const warnings = mockEmit.mock.calls.filter((args) => args[0] === 'warning')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][1])).toContain('First reason.')
    expect(String(warnings[0][1])).toMatch(/Settings > Locales > Publishing options/)
  })
})

describe('isLocalePublishingRejectedError', () => {
  test.each([
    ['a 403 on err.status', Object.assign(new Error('Forbidden'), { status: 403 }), true],
    ['a 400 on err.status', Object.assign(new Error('Bad Request'), { status: 400 }), true],
    ['a 403 on err.response.status', Object.assign(new Error('Forbidden'), { response: { status: 403 } }), true],
    ['a 403 in a JSON message', new Error(JSON.stringify({ status: 403 })), true],
    ['a 422 validation failure', new Error(JSON.stringify({ status: 422 })), false],
    ['a plain error', new Error('boom'), false],
    ['a non-error', 'nope' as any, false]
  ])('%s', (_label, err, expected) => {
    expect(isLocalePublishingRejectedError(err)).toBe(expected)
  })
})

describe('destinationScopedThePublish', () => {
  test('is true when the destination reports per-locale state back', () => {
    expect(destinationScopedThePublish({ sys: { fieldStatus: { '*': { 'en-US': 'published' } } } })).toBe(true)
  })

  test('is false when the destination reports no per-locale state', () => {
    expect(destinationScopedThePublish({ sys: { id: 'entry-1' } })).toBe(false)
    expect(destinationScopedThePublish({ sys: { fieldStatus: {} } })).toBe(false)
    expect(destinationScopedThePublish(undefined)).toBe(false)
  })
})
