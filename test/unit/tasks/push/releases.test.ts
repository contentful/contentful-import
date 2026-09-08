import {
  partitionReleasesBySchemaVersion,
  logUnsupportedRelease,
  buildReleaseCreatePayload,
  buildReleaseUpdatePayload,
  importRelease,
  TransformedRelease
} from '../../../../lib/tasks/push-to-space/releases'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { makePlainClientMock as makeClient } from '../../helpers/plain-client-mock'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

const mockEmit = jest.mocked(logEmitter.emit)

const spaceId = 'test-space'
const environmentId = 'master'

afterEach(() => {
  mockEmit.mockClear()
})

function makeRelease(id: string, schemaVersion = 'Release.v2'): TransformedRelease {
  return {
    original: { sys: { id, type: 'Release', version: 1, schemaVersion }, title: 'My Release', entities: { sys: { type: 'Array' }, items: [] } },
    transformed: {
      sys: { id, type: 'Release', version: 1, schemaVersion },
      title: 'My Release',
      entities: { sys: { type: 'Array' }, items: [] }
    } as any
  }
}

describe('partitionReleasesBySchemaVersion', () => {
  test('splits Release.v2 from every other schemaVersion', () => {
    const v2 = makeRelease('rel-v2')
    const v1 = makeRelease('rel-v1', 'Release.v1')

    const { supported, unsupported } = partitionReleasesBySchemaVersion([v2, v1])

    expect(supported).toEqual([v2])
    expect(unsupported).toEqual([v1])
  })

  test('returns empty arrays for an empty input', () => {
    expect(partitionReleasesBySchemaVersion([])).toEqual({ supported: [], unsupported: [] })
  })
})

describe('logUnsupportedRelease', () => {
  test('emits an error naming the release id and its actual schemaVersion', () => {
    logUnsupportedRelease(makeRelease('rel-v1', 'Release.v1'))

    expect(mockEmit.mock.calls).toHaveLength(1)
    const [level, error] = mockEmit.mock.calls[0]
    expect(level).toBe('error')
    expect(error.message).toContain('rel-v1')
    expect(error.message).toContain('Release.v2')
    expect(error.message).toContain('Release.v1')
  })
})

describe('buildReleaseCreatePayload', () => {
  test('never includes sys.id - the API always server-generates it on create', () => {
    const payload = buildReleaseCreatePayload(makeRelease('rel-1'))

    expect(payload.sys).not.toHaveProperty('id')
    expect(payload.sys!.type).toBe('Release')
    expect(payload.sys!.schemaVersion).toBe('Release.v2')
    expect(payload.title).toBe('My Release')
  })
})

describe('buildReleaseUpdatePayload', () => {
  test('carries type and schemaVersion but no sys.id (the API takes the id via the URL, not the body)', () => {
    const payload = buildReleaseUpdatePayload(makeRelease('rel-1'))

    expect(payload.sys).not.toHaveProperty('id')
    expect(payload.sys!.type).toBe('Release')
    expect(payload.sys!.schemaVersion).toBe('Release.v2')
  })
})

describe('importRelease', () => {
  test('CREATE: calls client.release.create when no existing destination release is passed', async () => {
    const client = makeClient({
      release: { create: jest.fn(() => Promise.resolve({ sys: { id: 'server-generated-id', version: 1 } })) }
    })

    const result = await importRelease(makeRelease('rel-1'), undefined, { client, spaceId, environmentId })

    expect(client.release.create).toHaveBeenCalledTimes(1)
    expect(client.release.update).not.toHaveBeenCalled()
    const [params] = client.release.create.mock.calls[0]
    expect(params).toEqual({ spaceId, environmentId })
    expect(result.sys.id).toBe('server-generated-id')
  })

  test('UPDATE: calls client.release.update with the destination sys.id/version when an existing release is passed', async () => {
    const client = makeClient({
      release: { update: jest.fn(() => Promise.resolve({ sys: { id: 'rel-1', version: 2 } })) }
    })
    const existing = { sys: { id: 'rel-1', version: 4 } }

    const result = await importRelease(makeRelease('rel-1'), existing, { client, spaceId, environmentId })

    expect(client.release.update).toHaveBeenCalledTimes(1)
    expect(client.release.create).not.toHaveBeenCalled()
    const [params] = client.release.update.mock.calls[0]
    expect(params).toEqual({ spaceId, environmentId, releaseId: 'rel-1', version: 4 })
    expect(result.sys.id).toBe('rel-1')
  })

  test('catches a create failure, logs it, and returns null rather than throwing', async () => {
    const client = makeClient({
      release: { create: jest.fn(() => Promise.reject(new Error('missing entitlement'))) }
    })

    const result = await importRelease(makeRelease('rel-1'), undefined, { client, spaceId, environmentId })

    expect(result).toBeNull()
    expect(mockEmit.mock.calls.some(([level, err]) => level === 'error' && err.message === 'missing entitlement')).toBe(true)
  })
})
