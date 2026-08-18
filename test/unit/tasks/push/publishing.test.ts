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
  const publishStub = jest.fn()
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
      expect(mockEmit.mock.calls).toHaveLength(4)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(0)
    })
})

test('Only publishes valid entities and does not fail when api error occur', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = jest.fn()
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
      expect(mockEmit.mock.calls[0][0]).toBe('warning')
      expect(mockEmit.mock.calls[0][1]).toBe('Unable to publish unknown')
      expect(mockEmit.mock.calls[4][0]).toBe('error')
      expect(mockEmit.mock.calls[4][1]).toBe(errorValidation)
      expect(mockEmit.mock.calls).toHaveLength(7)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 2 assets')
      expect(result).toHaveLength(2)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(1)
      expect(errorCount).toBe(1)
    })
})

test('Aborts publishing queue when all publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = jest.fn(() => Promise.reject(errorValidation))

  return publishEntities({
    entities: [
      { sys: { id: '123', type: 'asset' }, publish: publishStub },
      { sys: { id: '456', type: 'asset' }, publish: publishStub }
    ],
    requestQueue
  })
    .then((result) => {
      expect(publishStub.mock.calls).toHaveLength(2)
      expect(mockEmit.mock.calls[4][0]).toBe('error')
      expect(mockEmit.mock.calls[4][1]).toBe(errorValidation)
      expect(mockEmit.mock.calls).toHaveLength(7)
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 0 assets')
    })
})

test('Aborts publishing queue when some publishes fail', () => {
  const errorValidation = new Error('failed to publish')
  const publishStub = jest.fn()
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
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(3)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Successfully published 1 assets')
    })
})

test('Skips publishing when no entities are given', () => {
  return publishEntities({
    entities: [],
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

test('Archiving detects entities that can not be archived', () => {
  return archiveEntities({
    entities: [null, {}],
    requestQueue
  })
    .then((result) => {
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(2)
      expect(errorCount).toBe(0)
      const lastLogIndex = mockEmit.mock.calls.length - 1
      expect(mockEmit.mock.calls[lastLogIndex][0]).toBe('info')
      expect(mockEmit.mock.calls[lastLogIndex][1]).toBe('Skipping archiving since zero valid entities passed')
      expect(mockEmit.mock.calls).toHaveLength(3)
    })
})

test('Skips archiving when no entities are given', () => {
  const archiveMock = jest.fn()
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
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      // Init info
      expect(mockEmit.mock.calls[0][0]).toBe('info')
      expect(mockEmit.mock.calls[0][1]).toBe('Archiving 2 Entrys')
      // Error log
      expect(mockEmit.mock.calls[1][0]).toBe('error')
      expect(mockEmit.mock.calls[1][1]).toBe(errorArchiving)
      // Success info
      expect(mockEmit.mock.calls[2][0]).toBe('info')
      expect(mockEmit.mock.calls[2][1]).toBe('Successfully archived 1 Entrys')
      expect(mockEmit.mock.calls).toHaveLength(3)
    })
})

describe('locale-scoped publishing', () => {
  function makePlainClient() {
    return {
      entry: {
        publish: jest.fn((params: any) => Promise.resolve({
          sys: { type: 'Entry', id: params.entryId, publishedVersion: 4 }
        }))
      },
      asset: {
        publish: jest.fn((params: any) => Promise.resolve({
          sys: { type: 'Asset', id: params.assetId, publishedVersion: 4 }
        }))
      }
    }
  }

  test('publishes only the locales named in the plan', async () => {
    const plainClient = makePlainClient()
    const legacyPublish = jest.fn()
    const entity = { sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: legacyPublish }

    await publishEntities({
      entities: [entity],
      requestQueue,
      localePublishing: {
        plainClient,
        spaceId: 'space-1',
        environmentId: 'env-1',
        namespace: 'entry',
        localesByEntityId: new Map([['entry-1', ['en-US']]])
      }
    })

    expect(legacyPublish).not.toHaveBeenCalled()
    expect(plainClient.entry.publish).toHaveBeenCalledTimes(1)
    expect(plainClient.entry.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', entryId: 'entry-1', locales: ['en-US'] },
      entity
    )
  })

  test('falls back to a whole-entity publish for entities absent from the plan', async () => {
    const plainClient = makePlainClient()
    const legacyPublish = jest.fn(() => Promise.resolve({
      sys: { type: 'Entry', id: 'entry-2', publishedVersion: 2 }
    }))

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-2', version: 3 }, publish: legacyPublish }],
      requestQueue,
      localePublishing: {
        plainClient,
        spaceId: 'space-1',
        environmentId: 'env-1',
        namespace: 'entry',
        localesByEntityId: new Map([['entry-1', ['en-US']]])
      }
    })

    expect(legacyPublish).toHaveBeenCalledTimes(1)
    expect(plainClient.entry.publish).not.toHaveBeenCalled()
  })

  test('publishes assets through the asset endpoint', async () => {
    const plainClient = makePlainClient()
    const entity = { sys: { type: 'Asset', id: 'asset-1', version: 5 }, publish: jest.fn() }

    await publishEntities({
      entities: [entity],
      requestQueue,
      localePublishing: {
        plainClient,
        spaceId: 'space-1',
        environmentId: 'env-1',
        namespace: 'asset',
        localesByEntityId: new Map([['asset-1', ['en-US', 'es']]])
      }
    })

    expect(plainClient.entry.publish).not.toHaveBeenCalled()
    expect(plainClient.asset.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', assetId: 'asset-1', locales: ['en-US', 'es'] },
      entity
    )
  })

  test('reports a locale-scoped publish failure without failing the import', async () => {
    const plainClient = makePlainClient()
    plainClient.entry.publish = jest.fn((params: any) => Promise.reject(
      new Error(`422 InvalidEntry for ${params.entryId}`)
    ))

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: jest.fn() }],
      requestQueue,
      localePublishing: {
        plainClient,
        spaceId: 'space-1',
        environmentId: 'env-1',
        namespace: 'entry',
        localesByEntityId: new Map([['entry-1', ['en-US']]])
      }
    })

    expect(result).toHaveLength(0)
    const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
    expect(errorCount).toBeGreaterThan(0)
  })
})

describe('demoting draft locales', () => {
  function makePlainClient() {
    return {
      entry: {
        publish: jest.fn((params: any) => Promise.resolve({
          sys: { type: 'Entry', id: params.entryId, version: 9, publishedVersion: 8 }
        })),
        unpublish: jest.fn((params: any) => Promise.resolve({
          sys: { type: 'Entry', id: params.entryId, version: 11, publishedVersion: 10 }
        }))
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }
  }

  const baseContext = {
    spaceId: 'space-1',
    environmentId: 'env-1',
    namespace: 'entry' as const,
    localesByEntityId: new Map([['entry-1', ['en-US']]])
  }

  test('unpublishes the demoted locales after publishing, using the published version', async () => {
    const plainClient = makePlainClient()

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: jest.fn() }],
      requestQueue,
      localePublishing: {
        ...baseContext,
        plainClient,
        demoteLocalesByEntityId: new Map([['entry-1', ['es']]])
      }
    })

    expect(plainClient.entry.publish).toHaveBeenCalledTimes(1)
    expect(plainClient.entry.unpublish).toHaveBeenCalledTimes(1)
    expect(plainClient.entry.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', entryId: 'entry-1', locales: ['es'] },
      // version 9 comes from the publish response, not the stale pre-publish entity
      { sys: { type: 'Entry', id: 'entry-1', version: 9, publishedVersion: 8 } }
    )
  })

  test('does not unpublish when the entity has nothing to demote', async () => {
    const plainClient = makePlainClient()

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: jest.fn() }],
      requestQueue,
      localePublishing: { ...baseContext, plainClient, demoteLocalesByEntityId: new Map() }
    })

    expect(plainClient.entry.publish).toHaveBeenCalledTimes(1)
    expect(plainClient.entry.unpublish).not.toHaveBeenCalled()
  })

  test('does not unpublish when no demotion plan is supplied at all', async () => {
    const plainClient = makePlainClient()

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: jest.fn() }],
      requestQueue,
      localePublishing: { ...baseContext, plainClient }
    })

    expect(plainClient.entry.unpublish).not.toHaveBeenCalled()
  })

  test('reports a failed demotion without failing the import', async () => {
    const plainClient = makePlainClient()
    plainClient.entry.unpublish = jest.fn((params: any) => Promise.reject(
      new Error(`cannot unpublish ${params.entryId}`)
    ))

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 }, publish: jest.fn() }],
      requestQueue,
      localePublishing: {
        ...baseContext,
        plainClient,
        demoteLocalesByEntityId: new Map([['entry-1', ['es']]])
      }
    })

    // The publish succeeded, so the entity still counts as published even though
    // the demotion failed — otherwise runQueue retries it with a stale version.
    expect(result).toHaveLength(1)
    expect((result[0] as any).sys.id).toBe('entry-1')
    const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
    expect(errorCount).toBe(1)
  })
})

describe('a failed demotion must not invalidate a successful publish', () => {
  test('keeps the published entity, does not retry it, and reports one failure', async () => {
    const publishAttempts: string[] = []
    const plainClient = {
      entry: {
        publish: jest.fn((params: any, rawData: any) => {
          publishAttempts.push(`${params.entryId}@v${rawData.sys.version}`)
          return Promise.resolve({
            sys: { type: 'Entry', id: params.entryId, version: 8, publishedVersion: 7 }
          })
        }),
        unpublish: jest.fn((params: any) => params.entryId === 'entry-demote-fails'
          ? Promise.reject(new Error('unpublish rejected'))
          : Promise.resolve({ sys: { type: 'Entry', id: params.entryId, version: 10 } })
        )
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [
        { sys: { type: 'Entry', id: 'entry-ok', version: 7 }, publish: jest.fn() },
        { sys: { type: 'Entry', id: 'entry-demote-fails', version: 7 }, publish: jest.fn() }
      ],
      requestQueue,
      localePublishing: {
        plainClient,
        spaceId: 'space-1',
        environmentId: 'env-1',
        namespace: 'entry',
        localesByEntityId: new Map([
          ['entry-ok', ['en-US']],
          ['entry-demote-fails', ['en-US']]
        ]),
        demoteLocalesByEntityId: new Map([['entry-demote-fails', ['es']]])
      }
    })

    // The publish succeeded for both, so neither may be re-sent with a stale version.
    expect(publishAttempts).toEqual(['entry-ok@v7', 'entry-demote-fails@v7'])

    // Both entities are published; only the demotion failed.
    expect(result.map((e: any) => e.sys.id).sort()).toEqual(['entry-demote-fails', 'entry-ok'])

    // Exactly one error — the demotion — and no misleading "could not publish".
    const errors = mockEmit.mock.calls.filter((args) => args[0] === 'error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0][1])).toMatch(/unpublish rejected/)
    const couldNotPublish = mockEmit.mock.calls
      .filter((args) => typeof args[1] === 'string' && args[1].includes('Could not publish'))
    expect(couldNotPublish).toHaveLength(0)
  })
})
