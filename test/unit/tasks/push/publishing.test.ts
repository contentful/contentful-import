import PQueue from 'p-queue'
import {
  publishEntities,
  archiveEntities
} from '../../../../lib/tasks/push-to-space/publishing'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { AssetProps } from 'contentful-management'
import { Mock } from 'vitest'

vi.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: vi.fn()
  }
}))

let requestQueue

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
})

afterEach(() => {
  (logEmitter.emit as Mock).mockClear()
})

test('Publish entities', () => {
  const publishStub = vi.fn()
  publishStub.mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } }))
  publishStub.mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset', id: '456', publishedVersion: 3 } }))
  return publishEntities({
    entities: [
      { sys: { id: '123' }, publish: publishStub },
      { sys: { id: '456' }, publish: publishStub }
    ],
    requestQueue
  })
    .then((response) => {
      expect(publishStub.mock.calls).toHaveLength(2)
      expect((response[0] as AssetProps).sys.publishedVersion).toBeTruthy()
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(4)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
    })
})

test('Only publishes valid entities and does not fail when api error occur', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = vi.fn()
  publishStub.mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } }))
  publishStub.mockImplementationOnce(() => Promise.reject(errorValidation))
  publishStub.mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset', id: '456', publishedVersion: 3 } }))

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'asset' }, publish: publishStub },
      undefined,
      { sys: { id: '456', type: 'asset' }, publish: publishStub }
    ],
    requestQueue
  })
    .then((result) => {
      expect(publishStub.mock.calls).toHaveLength(3)
      expect((logEmitter.emit as Mock).mock.calls[0][0]).toBe('warning')
      expect((logEmitter.emit as Mock).mock.calls[0][1]).toBe('Unable to publish unknown')
      expect((logEmitter.emit as Mock).mock.calls[4][0]).toBe('error')
      expect((logEmitter.emit as Mock).mock.calls[4][1]).toBe(errorValidation)
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(7)
      const lastLogIndex = (logEmitter.emit as Mock).mock.calls.length - 1
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][1]).toBe('Successfully published 2 assets')
      expect(result).toHaveLength(2)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(1)
      expect(errorCount).toBe(1)
    })
})

test('Aborts publishing queue when all publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = vi.fn(() => Promise.reject(errorValidation))

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'asset' }, publish: publishStub },
      { sys: { id: '456', type: 'asset' }, publish: publishStub }
    ],
    requestQueue
  })
    .then((result) => {
      expect(publishStub.mock.calls).toHaveLength(2)
      expect((logEmitter.emit as Mock).mock.calls[4][0]).toBe('error')
      expect((logEmitter.emit as Mock).mock.calls[4][1]).toBe(errorValidation)
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(7)
      expect(result).toHaveLength(0)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = (logEmitter.emit as Mock).mock.calls.length - 1
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][1]).toBe('Successfully published 0 assets')
    })
})

test('Aborts publishing queue when some publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = vi.fn()
  publishStub.mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset', id: '123', publishedVersion: 2 } }))
  publishStub.mockImplementationOnce(() => Promise.reject(errorValidation))
  publishStub.mockImplementationOnce(() => Promise.reject(errorValidation))

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'asset' }, publish: publishStub },
      { sys: { id: '456', type: 'asset' }, publish: publishStub }
    ],
    requestQueue
  })
    .then((result) => {
      expect(publishStub.mock.calls).toHaveLength(3)
      expect(result).toHaveLength(1)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = (logEmitter.emit as Mock).mock.calls.length - 1
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][1]).toBe('Successfully published 1 assets')
    })
})

test('Skips publishing when no entities are given', () => {
  return publishEntities({
    entities: [],
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(0)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
      const lastLogIndex = (logEmitter.emit as Mock).mock.calls.length - 1
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][1]).toBe('Skipping publishing since zero valid entities passed')
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(1)
    })
})

test('Archiving detects entities that can not be archived', () => {
  return archiveEntities({
    entities: [null, {}],
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(0)
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(2)
      expect(errorCount).toBe(0)
      const lastLogIndex = (logEmitter.emit as Mock).mock.calls.length - 1
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[lastLogIndex][1]).toBe('Skipping archiving since zero valid entities passed')
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(3)
    })
})

test('Skips archiving when no entities are given', () => {
  const archiveMock = vi.fn()
  const errorArchiving = new Error('failed to archive')
  archiveMock.mockImplementationOnce(() => Promise.resolve({ archived: true }))
  archiveMock.mockImplementationOnce(() => Promise.reject(errorArchiving))
  return archiveEntities({
    entities: [
      {
        sys: {
          type: 'Entry'
        },
        archive: archiveMock
      },
      {
        sys: {
          type: 'Entry'
        },
        archive: archiveMock
      }
    ],
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ archived: true })
      const warningCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = (logEmitter.emit as Mock).mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      // Init info
      expect((logEmitter.emit as Mock).mock.calls[0][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[0][1]).toBe('Archiving 2 Entrys')
      // Error log
      expect((logEmitter.emit as Mock).mock.calls[1][0]).toBe('error')
      expect((logEmitter.emit as Mock).mock.calls[1][1]).toBe(errorArchiving)
      // Success info
      expect((logEmitter.emit as Mock).mock.calls[2][0]).toBe('info')
      expect((logEmitter.emit as Mock).mock.calls[2][1]).toBe('Successfully archived 1 Entrys')
      expect((logEmitter.emit as Mock).mock.calls).toHaveLength(3)
    })
})
