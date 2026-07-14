import PQueue from 'p-queue'
import {
  publishEntities,
  archiveEntities
} from '../../../../lib/tasks/push-to-space/publishing'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { AssetProps } from 'contentful-management'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

const mockEmit = jest.mocked(logEmitter.emit)

let requestQueue

const spaceId = 'test-space'
const environmentId = 'master'

function makeClient (overrides: Record<string, any> = {}) {
  return {
    entry: {
      publish: jest.fn(),
      archive: jest.fn(),
    },
    asset: {
      publish: jest.fn(),
      archive: jest.fn(),
    },
    contentType: {
      publish: jest.fn(),
    },
    ...overrides,
  }
}

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
})

afterEach(() => {
  mockEmit.mockClear()
})

test('Publish entities', () => {
  const client = makeClient()
  client.asset.publish
    .mockResolvedValueOnce({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } })
    .mockResolvedValueOnce({ sys: { type: 'Asset', id: '456', publishedVersion: 3 } })

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'Asset' } },
      { sys: { id: '456', type: 'Asset' } }
    ],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((response) => {
      expect(client.asset.publish.mock.calls).toHaveLength(2)
      expect((response[0] as AssetProps).sys.publishedVersion).toBeTruthy()
      expect(mockEmit.mock.calls).toHaveLength(4)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
    })
})

test('Only publishes valid entities and does not fail when api error occur', () => {
  const errorValidation = new Error('failed to publish')
  const client = makeClient()
  client.asset.publish
    .mockResolvedValueOnce({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } })
    .mockRejectedValueOnce(errorValidation)
    .mockResolvedValueOnce({ sys: { type: 'Asset', id: '456', publishedVersion: 3 } })

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'Asset' } },
      { sys: { id: '456', type: 'Asset' } }
    ],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(client.asset.publish.mock.calls).toHaveLength(3)
      expect(result).toHaveLength(2)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      const errorCall = mockEmit.mock.calls.find((args) => args[0] === 'error')
      expect(errorCall![1]).toBe(errorValidation)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 2 Assets')
    })
})

test('Aborts publishing queue when all publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const client = makeClient()
  client.asset.publish.mockRejectedValue(errorValidation)

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'Asset' } },
      { sys: { id: '456', type: 'Asset' } }
    ],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(client.asset.publish.mock.calls).toHaveLength(2)
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 0 Assets')
    })
})

test('Aborts publishing queue when some publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const client = makeClient()
  client.asset.publish
    .mockResolvedValueOnce({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } })
    .mockRejectedValueOnce(errorValidation)
    .mockRejectedValueOnce(errorValidation)

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'Asset' } },
      { sys: { id: '456', type: 'Asset' } }
    ],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(client.asset.publish.mock.calls).toHaveLength(3)
      expect(result).toHaveLength(1)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 1 Assets')
    })
})

test('Skips publishing when no entities are given', () => {
  const client = makeClient()
  return publishEntities({
    entities: [],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Skipping publishing since zero valid entities passed')
      expect(mockEmit.mock.calls).toHaveLength(1)
    })
})

test('Skips archiving when no entities are given', () => {
  const client = makeClient()
  return archiveEntities({
    entities: [],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Skipping archiving since zero valid entities passed')
      expect(mockEmit.mock.calls).toHaveLength(1)
    })
})

test('Archives entities and handles errors', () => {
  const errorArchiving = new Error('failed to archive')
  const client = makeClient()
  client.entry.archive
    .mockResolvedValueOnce({ sys: { type: 'Entry', id: '123' }, archived: true })
    .mockRejectedValueOnce(errorArchiving)

  return archiveEntities({
    entities: [
      { sys: { id: '123', type: 'Entry' } },
      { sys: { id: '456', type: 'Entry' } }
    ],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ archived: true })
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      expect(mockEmit.mock.calls[0][0]).toBe('info')
      expect(mockEmit.mock.calls[0][1]).toBe('Archiving 2 Entrys')
      expect(mockEmit.mock.calls[1][0]).toBe('error')
      expect(mockEmit.mock.calls[1][1]).toBe(errorArchiving)
      expect(mockEmit.mock.calls[2][0]).toBe('info')
      expect(mockEmit.mock.calls[2][1]).toBe('Successfully archived 1 Entrys')
      expect(mockEmit.mock.calls).toHaveLength(3)
    })
})
