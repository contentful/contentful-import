import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { publishEntities } from '../../../../lib/tasks/push-to-space/publishing'
import { TransformedSourceData } from '../../../../lib/types'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

logEmitter.on('error', () => {})

jest.mock('../../../../lib/tasks/push-to-space/creation', () => ({
  createEntities: jest.fn(() => Promise.resolve([])),
  createEntries: jest.fn(({ entities }) => Promise.resolve(
    entities.map(({ original }) => ({ sys: { ...original.sys } }))
  )),
  createLocales: jest.fn(() => Promise.resolve([]))
}))
jest.mock('../../../../lib/tasks/push-to-space/publishing', () => ({
  publishEntities: jest.fn(() => Promise.resolve([])),
  archiveEntities: jest.fn(() => Promise.resolve([]))
}))
jest.mock('../../../../lib/tasks/push-to-space/assets', () => ({
  processAssets: jest.fn(() => Promise.resolve([])),
  getAssetStreamForURL: jest.fn(() => Promise.resolve([]))
}))

const publishEntitiesMock = publishEntities as jest.Mock

function makeEntry(id: string, fieldStatus?: Record<string, string>) {
  return {
    original: {
      sys: {
        id,
        type: 'Entry',
        publishedVersion: 2,
        ...(fieldStatus ? { fieldStatus: { '*': fieldStatus } } : {})
      }
    }
  }
}

function makeSourceData(entries: ReturnType<typeof makeEntry>[]) {
  return {
    locales: [],
    contentTypes: [],
    assets: [],
    editorInterfaces: [],
    entries
  } as unknown as TransformedSourceData
}

const DESTINATION_LOCALES = [{ code: 'en-US' }, { code: 'es' }, { code: 'zh-Hant-TW' }]

let getLocalesMock: jest.Mock
let clientMock: any
let requestQueue: PQueue

// Paging mirrors `batchedPageQuery`: page one, then the remaining offsets.
function localePage(items: { code: string }[]) {
  return jest.fn(({ query }: any = {}) => {
    const skip = query?.skip ?? 0
    const limit = query?.limit ?? 100
    return Promise.resolve({ items: items.slice(skip, skip + limit), total: items.length, skip, limit })
  })
}

beforeEach(() => {
  getLocalesMock = localePage(DESTINATION_LOCALES)
  clientMock = makePlainClientMock({
    locale: { getMany: getLocalesMock }
  })
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

afterEach(() => {
  publishEntitiesMock.mockClear()
})

function run(sourceData: TransformedSourceData, options: Record<string, any> = {}, client = clientMock) {
  return pushToSpace({
    sourceData,
    destinationData: {},
    client,
    spaceId: 'spaceid',
    environmentId: 'master',
    requestQueue,
    ...options
  } as any).run({ data: {} })
}

// The entry pass is the only one that receives entities here; assets and content
// types are stubbed out to empty collections above.
function entryPublishCall() {
  return publishEntitiesMock.mock.calls
    .map(([args]) => args)
    .find((args) => args.entities.length > 0 || args.localePublishing)
}

test('scopes entry publishing to the live locales from fieldStatus', async () => {
  await run(makeSourceData([
    makeEntry('mixed', { 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'changed' })
  ]))

  const call = entryPublishCall()
  expect(call.client).toBe(clientMock)
  expect(call.spaceId).toBe('spaceid')
  expect(call.environmentId).toBe('master')
  expect([...call.localePublishing.localesByEntityId.entries()]).toEqual([
    ['mixed', ['en-US', 'zh-Hant-TW']]
  ])
})

test('leaves entries with every destination locale published to the whole-entity publish', async () => {
  await run(makeSourceData([
    makeEntry('all-live', { 'en-US': 'published', es: 'published', 'zh-Hant-TW': 'published' })
  ]))

  expect(entryPublishCall().localePublishing.localesByEntityId.size).toBe(0)
})

test('does not read destination locales when no entity carries fieldStatus', async () => {
  await run(makeSourceData([makeEntry('legacy-export')]))

  expect(getLocalesMock).not.toHaveBeenCalled()
  expect(entryPublishCall().localePublishing).toBeUndefined()
})

test('drops locales that do not exist in the destination environment', async () => {
  await run(makeSourceData([
    makeEntry('partly-available', { 'en-US': 'published', 'de-DE': 'published', es: 'draft' })
  ]))

  expect([...entryPublishCall().localePublishing.localesByEntityId.entries()]).toEqual([
    ['partly-available', ['en-US']]
  ])
})

test('skips an entry whose only live locale is missing from the destination environment', async () => {
  await run(makeSourceData([
    makeEntry('unavailable', { 'de-DE': 'published', 'en-US': 'draft' })
  ]))

  const call = entryPublishCall()
  expect(call.entities).toHaveLength(0)
  expect(call.localePublishing.localesByEntityId.size).toBe(0)
})

test('falls back to whole-entity publishing when destination locales cannot be read', async () => {
  getLocalesMock.mockImplementation(() => Promise.reject(new Error('403 AccessDenied')))

  await run(makeSourceData([
    makeEntry('mixed', { 'en-US': 'published', es: 'draft' })
  ]))

  const call = entryPublishCall()
  expect(call.entities).toHaveLength(1)
  expect(call.localePublishing.localesByEntityId.size).toBe(0)
})

describe('the locale-based publishing entitlement', () => {
  function clientEntitled(value: boolean | undefined) {
    return makePlainClientMock({
      locale: { getMany: localePage(DESTINATION_LOCALES) },
      space: {
        get: jest.fn().mockResolvedValue({
          sys: { type: 'Space', organization: { sys: { id: 'org-1' } } }
        })
      },
      raw: {
        get: jest.fn().mockResolvedValue(
          value === undefined ? { features: {} } : { features: { localeBasedPublishing: { value } } }
        )
      }
    })
  }

  const sourceData = () => makeSourceData([
    makeEntry('mixed', { 'en-US': 'published', es: 'draft' })
  ])

  test('does not scope publishing when the organization is not entitled', async () => {
    const client = clientEntitled(false)

    await run(sourceData(), {}, client)

    expect(entryPublishCall().localePublishing).toBeUndefined()
    // No point reading destination locales for a plan that will not be used.
    expect(client.locale.getMany).not.toHaveBeenCalled()
  })

  test('scopes publishing when the organization is entitled', async () => {
    const client = clientEntitled(true)

    await run(sourceData(), {}, client)

    expect([...entryPublishCall().localePublishing.localesByEntityId.entries()]).toEqual([
      ['mixed', ['en-US']]
    ])
  })

  test('treats an entitlement set that names neither feature as inconclusive and still tries', async () => {
    const client = clientEntitled(undefined)

    await run(sourceData(), {}, client)

    expect([...entryPublishCall().localePublishing.localesByEntityId.entries()]).toEqual([
      ['mixed', ['en-US']]
    ])
  })

  test('treats a failed entitlement check as inconclusive and still tries', async () => {
    const client = makePlainClientMock({
      locale: { getMany: localePage(DESTINATION_LOCALES) },
      space: { get: jest.fn().mockRejectedValue(new Error('404 NotFound')) }
    })

    await run(sourceData(), {}, client)

    expect([...entryPublishCall().localePublishing.localesByEntityId.entries()]).toEqual([
      ['mixed', ['en-US']]
    ])
  })
})

describe('unpublishDraftLocales', () => {
  const sourceData = () => makeSourceData([
    makeEntry('mixed', { 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' })
  ])
  // Same entry already in the destination, published for a locale that should be draft.
  const destinationData = {
    entries: [{
      sys: {
        id: 'mixed',
        type: 'Entry',
        publishedVersion: 4,
        fieldStatus: { '*': { 'en-US': 'published', es: 'published', 'zh-Hant-TW': 'draft' } }
      }
    }]
  }

  function runWith(unpublishDraftLocales?: boolean) {
    return pushToSpace({
      sourceData: sourceData(),
      destinationData: destinationData as any,
      client: clientMock,
      spaceId: 'spaceid',
      environmentId: 'master',
      unpublishDraftLocales,
      requestQueue
    } as any).run({ data: {} })
  }

  test('plans no demotions by default', async () => {
    await runWith()
    expect(entryPublishCall().localePublishing.demoteLocalesByEntityId.size).toBe(0)
  })

  test('demotes locales that are still published in the destination when enabled', async () => {
    await runWith(true)
    expect([...entryPublishCall().localePublishing.demoteLocalesByEntityId.entries()]).toEqual([
      ['mixed', ['es']]
    ])
  })
})

test('pages through destination locales beyond the 100-item default page size', async () => {
  // 150 locales: the fix must see 'es' at index 149, not stop at the first page.
  const allLocales = [
    { code: 'en-US' },
    ...Array.from({ length: 148 }, (_, i) => ({ code: `xx-${i}` })),
    { code: 'es' }
  ]
  const client = makePlainClientMock({ locale: { getMany: localePage(allLocales) } })

  await run(makeSourceData([
    makeEntry('paged', { 'en-US': 'published', es: 'published', 'xx-0': 'draft' })
  ]), {}, client)

  // 'es' only exists on the second page. Without paging it looks absent from the
  // destination and gets silently dropped from the publish.
  expect([...entryPublishCall().localePublishing.localesByEntityId.entries()]).toEqual([
    ['paged', ['en-US', 'es']]
  ])
})
