import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

jest.mock('../../../../lib/utils/import-exo-folders.ts', () => {
  return Promise.resolve()
})

// logEmitter is a plain node:events EventEmitter. Node treats 'error' as a special
// event name and throws synchronously if it's emitted with no listener attached, so
// register a no-op listener before any test exercises an error/log-and-continue path.
logEmitter.on('error', () => { })

// Minimal base source data needed to satisfy the Listr tasks that always run
const baseSourceData = {
  locales: [],
  contentTypes: [],
  assets: [],
  editorInterfaces: [],
  entries: [],
  tags: [],
  webhooks: []
}

const baseDestinationData = {}

function makeRelease(id: string, sysOverrides: any = {}) {
  return {
    original: { sys: { id, type: 'Release', version: 1, schemaVersion: 'Release.v2' }, title: 'My Release', entities: { sys: { type: 'Array' }, items: [] } },
    transformed: {
      sys: { id, type: 'Release', version: 1, schemaVersion: 'Release.v2', ...sysOverrides },
      title: 'My Release',
      entities: { sys: { type: 'Array' }, items: [] }
    }
  }
}

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

describe('Importing Releases', () => {
  test('CREATE: calls release.create when no destination release exists at the source id', async () => {
    const client = makePlainClientMock({
      release: {
        create: jest.fn(() => Promise.resolve({ sys: { id: 'server-generated-id', version: 1 } }))
      }
    })
    const release = makeRelease('rel-1')

    await pushToSpace({
      sourceData: { ...baseSourceData, releases: [release] } as any,
      destinationData: { ...baseDestinationData, releases: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      requestQueue
    }).run({ data: {} })

    expect(client.release.create).toHaveBeenCalledTimes(1)
    expect(client.release.update).not.toHaveBeenCalled()
    const [params, payload] = client.release.create.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master' })
    // The create payload must NOT try to set sys.id - the API always server-generates
    // it and silently ignores any caller-supplied value (see the comment in
    // push-to-space.ts). Asserting its absence here guards against reintroducing it.
    expect(payload.sys).not.toHaveProperty('id')
    expect(payload.sys.type).toBe('Release')
    expect(payload.sys.schemaVersion).toBe('Release.v2')
  })

  test('UPDATE: calls release.update with the destination sys.id/version when a release already exists at the source id', async () => {
    const client = makePlainClientMock({
      release: {
        update: jest.fn(() => Promise.resolve({ sys: { id: 'rel-1', version: 2 } }))
      }
    })
    const release = makeRelease('rel-1')
    const destinationRelease: any = { sys: { id: 'rel-1', type: 'Release', version: 4 } }

    await pushToSpace({
      sourceData: { ...baseSourceData, releases: [release] } as any,
      destinationData: { ...baseDestinationData, releases: [destinationRelease] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      requestQueue
    }).run({ data: {} })

    expect(client.release.update).toHaveBeenCalledTimes(1)
    expect(client.release.create).not.toHaveBeenCalled()
    const [params] = client.release.update.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', releaseId: 'rel-1', version: 4 })
  })

  test('skips Release.v1 (Launch) releases and logs an error, without calling create or update', async () => {
    const client = makePlainClientMock({
      release: {
        create: jest.fn(() => Promise.resolve({ sys: { id: 'x', version: 1 } })),
        update: jest.fn(() => Promise.resolve({ sys: { id: 'x', version: 1 } }))
      }
    })
    const v1Release = makeRelease('rel-v1', { schemaVersion: 'Release.v1' })

    const errors: Error[] = []
    const onError = (err: Error) => errors.push(err)
    logEmitter.on('error', onError)

    try {
      await pushToSpace({
        sourceData: { ...baseSourceData, releases: [v1Release] } as any,
        destinationData: { ...baseDestinationData, releases: [] },
        client,
        spaceId: 'space-1',
        environmentId: 'master',
        requestQueue
      }).run({ data: {} })
    } finally {
      logEmitter.off('error', onError)
    }

    expect(client.release.create).not.toHaveBeenCalled()
    expect(client.release.update).not.toHaveBeenCalled()
    expect(errors.some((e) => e.message.includes('rel-v1') && e.message.includes('Release.v2'))).toBe(true)
  })

  test('a create failure on one release does not abort the import (per-item error handling, not an unguarded throw)', async () => {
    const client = makePlainClientMock({
      release: {
        create: jest.fn()
          .mockRejectedValueOnce(new Error('missing entitlement'))
          .mockResolvedValueOnce({ sys: { id: 'ok-release', version: 1 } })
      }
    })
    const failingRelease = makeRelease('rel-fail')
    const okRelease = makeRelease('rel-ok')

    const errors: Error[] = []
    const onError = (err: Error) => errors.push(err)
    logEmitter.on('error', onError)

    let ranToCompletion = false
    try {
      await pushToSpace({
        sourceData: { ...baseSourceData, releases: [failingRelease, okRelease] } as any,
        destinationData: { ...baseDestinationData, releases: [] },
        client,
        spaceId: 'space-1',
        environmentId: 'master',
        requestQueue
      }).run({ data: {} })
      ranToCompletion = true
    } finally {
      logEmitter.off('error', onError)
    }

    expect(ranToCompletion).toBe(true)
    expect(client.release.create).toHaveBeenCalledTimes(2)
    expect(errors.some((e) => e.message.includes('missing entitlement'))).toBe(true)
  })
})
