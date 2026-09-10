import PQueue from 'p-queue'
import {
  publishEntities,
  archiveEntities
} from '../../../../lib/tasks/push-to-space/publishing'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { AssetProps } from 'contentful-management'
import { makePlainClientMock as makeClient } from '../../helpers/plain-client-mock'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

const mockEmit = jest.mocked(logEmitter.emit)

let requestQueue

const spaceId = 'test-space'
const environmentId = 'master'

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

function plan (overrides: any = {}) {
  return {
    localesByEntityId: new Map<string, string[]>(),
    skippedEntityIds: new Set<string>(),
    demoteLocalesByEntityId: new Map<string, string[]>(),
    ...overrides
  }
}

// A destination with locale-based publishing on reports per-locale state back on
// the publish response. `destinationScopedThePublish` keys off exactly that.
function scopedSys (type: string, id: string, version = 9) {
  return {
    sys: {
      type,
      id,
      version,
      publishedVersion: version - 1,
      fieldStatus: { '*': { 'en-US': 'published', es: 'draft' } }
    }
  }
}

describe('locale-scoped publishing', () => {
  function makeClient (): any {
    return {
      entry: {
        publish: jest.fn((params: any) => Promise.resolve(scopedSys('Entry', params.entryId))),
        unpublish: jest.fn((params: any) => Promise.resolve(scopedSys('Entry', params.entryId, 11)))
      },
      asset: {
        publish: jest.fn((params: any) => Promise.resolve(scopedSys('Asset', params.assetId))),
        unpublish: jest.fn((params: any) => Promise.resolve(scopedSys('Asset', params.assetId, 11)))
      }
    }
  }

  test('publishes only the locales named in the plan', async () => {
    const client = makeClient()
    const entity = { sys: { type: 'Entry', id: 'entry-1', version: 7 } }

    await publishEntities({
      entities: [entity],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['entry-1', ['en-US']]]) })
    })

    expect(client.entry.publish).toHaveBeenCalledTimes(1)
    expect(client.entry.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', entryId: 'entry-1', locales: ['en-US'] },
      entity
    )
  })

  test('publishes the whole entity for entities absent from the plan', async () => {
    const client = makeClient()
    const entity = { sys: { type: 'Entry', id: 'entry-2', version: 3 } }

    await publishEntities({
      entities: [entity],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['entry-1', ['en-US']]]) })
    })

    expect(client.entry.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', entryId: 'entry-2', locales: undefined },
      entity
    )
  })

  test('publishes assets through the asset endpoint', async () => {
    const client = makeClient()
    const entity = { sys: { type: 'Asset', id: 'asset-1', version: 5 } }

    await publishEntities({
      entities: [entity],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['asset-1', ['en-US', 'es']]]) })
    })

    expect(client.entry.publish).not.toHaveBeenCalled()
    expect(client.asset.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', assetId: 'asset-1', locales: ['en-US', 'es'] },
      entity
    )
  })

  test('reports a locale-scoped publish failure without failing the import', async () => {
    const client = makeClient()
    client.entry.publish = jest.fn((params: any) => Promise.reject(
      new Error(`422 InvalidEntry for ${params.entryId}`)
    ))

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['entry-1', ['en-US']]]) })
    })

    expect(result).toHaveLength(0)
    const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
    expect(errorCount).toBeGreaterThan(0)
  })
})

describe('demoting draft locales', () => {
  function makeClient (): any {
    return {
      entry: {
        publish: jest.fn((params: any) => Promise.resolve(scopedSys('Entry', params.entryId))),
        unpublish: jest.fn((params: any) => Promise.resolve(scopedSys('Entry', params.entryId, 11)))
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }
  }

  const base = { spaceId: 'space-1', environmentId: 'env-1' }
  const localesByEntityId = new Map([['entry-1', ['en-US']]])

  test('unpublishes the demoted locales after publishing, using the published version', async () => {
    const client = makeClient()

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      ...base,
      requestQueue,
      localePublishing: plan({
        localesByEntityId,
        demoteLocalesByEntityId: new Map([['entry-1', ['es']]])
      })
    })

    expect(client.entry.publish).toHaveBeenCalledTimes(1)
    expect(client.entry.unpublish).toHaveBeenCalledTimes(1)
    expect(client.entry.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'env-1', entryId: 'entry-1', locales: ['es'] },
      // version 9 comes from the publish response, not the stale pre-publish entity
      scopedSys('Entry', 'entry-1')
    )
  })

  test('does not unpublish when the entity has nothing to demote', async () => {
    const client = makeClient()

    await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      ...base,
      requestQueue,
      localePublishing: plan({ localesByEntityId })
    })

    expect(client.entry.publish).toHaveBeenCalledTimes(1)
    expect(client.entry.unpublish).not.toHaveBeenCalled()
  })

  test('reports a failed demotion without failing the import', async () => {
    const client = makeClient()
    client.entry.unpublish = jest.fn((params: any) => Promise.reject(
      new Error(`cannot unpublish ${params.entryId}`)
    ))

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      ...base,
      requestQueue,
      localePublishing: plan({
        localesByEntityId,
        demoteLocalesByEntityId: new Map([['entry-1', ['es']]])
      })
    })

    // The publish succeeded, so the entity still counts as published even though
    // the demotion failed - otherwise runQueue retries it with a stale version.
    expect(result).toHaveLength(1)
    expect((result[0] as any).sys.id).toBe('entry-1')
    const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
    expect(errorCount).toBe(1)
  })
})

describe('a failed demotion must not invalidate a successful publish', () => {
  test('keeps the published entity, does not retry it, and reports one failure', async () => {
    const publishAttempts: string[] = []
    const client: any = {
      entry: {
        publish: jest.fn((params: any, rawData: any) => {
          publishAttempts.push(`${params.entryId}@v${rawData.sys.version}`)
          return Promise.resolve(scopedSys('Entry', params.entryId, 8))
        }),
        unpublish: jest.fn((params: any) => params.entryId === 'entry-demote-fails'
          ? Promise.reject(new Error('unpublish rejected'))
          : Promise.resolve(scopedSys('Entry', params.entryId, 10))
        )
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [
        { sys: { type: 'Entry', id: 'entry-ok', version: 7 } },
        { sys: { type: 'Entry', id: 'entry-demote-fails', version: 7 } }
      ],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({
        localesByEntityId: new Map([
          ['entry-ok', ['en-US']],
          ['entry-demote-fails', ['en-US']]
        ]),
        demoteLocalesByEntityId: new Map([['entry-demote-fails', ['es']]])
      })
    })

    // The publish succeeded for both, so neither may be re-sent with a stale version.
    expect(publishAttempts).toEqual(['entry-ok@v7', 'entry-demote-fails@v7'])

    // Both entities are published; only the demotion failed.
    expect(result.map((e: any) => e.sys.id).sort()).toEqual(['entry-demote-fails', 'entry-ok'])

    // Exactly one error - the demotion - and no misleading "could not publish".
    const errors = mockEmit.mock.calls.filter((args) => args[0] === 'error')
    expect(errors).toHaveLength(1)
    expect(String(errors[0][1])).toMatch(/unpublish rejected/)
    const couldNotPublish = mockEmit.mock.calls
      .filter((args) => typeof args[1] === 'string' && args[1].includes('Could not publish'))
    expect(couldNotPublish).toHaveLength(0)
  })
})

describe('a destination that cannot honour a locale scope', () => {
  function rejection (status: number, message: string) {
    return new Error(JSON.stringify({ status, message }))
  }

  test('falls back to a whole-entity publish and only warns once for the run', async () => {
    const client: any = {
      entry: {
        publish: jest.fn((params: any) => params.locales
          ? Promise.reject(rejection(403, 'locale based publishing not enabled'))
          : Promise.resolve({ sys: { type: 'Entry', id: params.entryId, version: 8, publishedVersion: 7 } })
        ),
        unpublish: jest.fn()
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [
        { sys: { type: 'Entry', id: 'entry-1', version: 7 } },
        { sys: { type: 'Entry', id: 'entry-2', version: 7 } }
      ],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({
        localesByEntityId: new Map([['entry-1', ['en-US']], ['entry-2', ['en-US']]]),
        demoteLocalesByEntityId: new Map([['entry-1', ['es']]])
      })
    })

    expect(result.map((e: any) => e.sys.id)).toEqual(['entry-1', 'entry-2'])

    // entry-1 pays for the rejected scoped attempt, then both go through unscoped.
    const scoped = client.entry.publish.mock.calls.filter((args: any[]) => args[0].locales)
    const unscoped = client.entry.publish.mock.calls.filter((args: any[]) => !args[0].locales)
    expect(scoped).toHaveLength(1)
    expect(unscoped).toHaveLength(2)

    // No demotion is attempted once locale scoping is off - it would be rejected too.
    expect(client.entry.unpublish).not.toHaveBeenCalled()

    const warnings = mockEmit.mock.calls.filter((args) => args[0] === 'warning')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][1])).toMatch(/Settings > Locales > Publishing options/)

    const errors = mockEmit.mock.calls.filter((args) => args[0] === 'error')
    expect(errors).toHaveLength(0)
  })

  test('reads the status off err.status as well as off a JSON message', async () => {
    const err: any = new Error('Forbidden')
    err.status = 403

    const client: any = {
      entry: { publish: jest.fn(), unpublish: jest.fn() },
      asset: {
        publish: jest.fn((params: any) => params.locales
          ? Promise.reject(err)
          : Promise.resolve({ sys: { type: 'Asset', id: params.assetId, version: 8, publishedVersion: 7 } })
        ),
        unpublish: jest.fn()
      }
    }

    const result = await publishEntities({
      entities: [{ sys: { type: 'Asset', id: 'asset-1', version: 7 } }],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['asset-1', ['en-US']]]) })
    })

    expect(result).toHaveLength(1)
    expect(mockEmit.mock.calls.filter((args) => args[0] === 'warning')).toHaveLength(1)
  })

  test('a 400 rejection is treated the same as a 403', async () => {
    const client: any = {
      entry: {
        publish: jest.fn((params: any) => params.locales
          ? Promise.reject(rejection(400, 'unknown payload'))
          : Promise.resolve({ sys: { type: 'Entry', id: params.entryId, version: 8, publishedVersion: 7 } })
        ),
        unpublish: jest.fn()
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['entry-1', ['en-US']]]) })
    })

    expect(result).toHaveLength(1)
    expect(mockEmit.mock.calls.filter((args) => args[0] === 'warning')).toHaveLength(1)
  })

  test('a non-rejectable error is still reported rather than silently downgraded', async () => {
    const client: any = {
      entry: {
        publish: jest.fn(() => Promise.reject(rejection(422, 'InvalidEntry'))),
        unpublish: jest.fn()
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [{ sys: { type: 'Entry', id: 'entry-1', version: 7 } }],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({ localesByEntityId: new Map([['entry-1', ['en-US']]]) })
    })

    expect(result).toHaveLength(0)
    expect(mockEmit.mock.calls.filter((args) => args[0] === 'error').length).toBeGreaterThan(0)
    expect(mockEmit.mock.calls.filter((args) => args[0] === 'warning')).toHaveLength(0)
  })

  // Ethan's repro: the destination is entitled but the environment is still on
  // "Publish all locales". The CMA accepts the payload and publishes everything,
  // so there is no error to catch - the tell is the missing per-locale state.
  test('detects a destination that accepts the payload but ignores the scope', async () => {
    const client: any = {
      entry: {
        publish: jest.fn((params: any) => Promise.resolve({
          sys: { type: 'Entry', id: params.entryId, version: 8, publishedVersion: 7 }
        })),
        unpublish: jest.fn()
      },
      asset: { publish: jest.fn(), unpublish: jest.fn() }
    }

    const result = await publishEntities({
      entities: [
        { sys: { type: 'Entry', id: 'entry-1', version: 7 } },
        { sys: { type: 'Entry', id: 'entry-2', version: 7 } }
      ],
      client,
      spaceId: 'space-1',
      environmentId: 'env-1',
      requestQueue,
      localePublishing: plan({
        localesByEntityId: new Map([['entry-1', ['en-US']], ['entry-2', ['en-US']]]),
        demoteLocalesByEntityId: new Map([['entry-1', ['es']], ['entry-2', ['es']]])
      })
    })

    expect(result).toHaveLength(2)

    // Only the first entity is sent with a scope; the rest of the run gives up on it.
    const scoped = client.entry.publish.mock.calls.filter((args: any[]) => args[0].locales)
    expect(scoped).toHaveLength(1)

    // Crucially, no demotion is attempted: an unpublish the destination would not
    // scope either is a pointless write against a destination that cannot express it.
    expect(client.entry.unpublish).not.toHaveBeenCalled()

    const warnings = mockEmit.mock.calls.filter((args) => args[0] === 'warning')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][1])).toMatch(/without honouring the requested locales/)
    expect(String(warnings[0][1])).toMatch(/Settings > Locales > Publishing options/)

    expect(mockEmit.mock.calls.filter((args) => args[0] === 'error')).toHaveLength(0)
  })
})
