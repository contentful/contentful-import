import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { publishEntities } from '../../../../lib/tasks/push-to-space/publishing'
import { TransformedSourceData } from '../../../../lib/types'

logEmitter.on('error', () => {})

jest.mock('../../../../lib/tasks/push-to-space/creation', () => ({
  createEntities: jest.fn(() => Promise.resolve([])),
  createEntries: jest.fn(({ entities }) => Promise.resolve(
    entities.map(({ original }) => ({ sys: { ...original.sys }, publish: jest.fn() }))
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

let getLocalesMock: jest.Mock
let clientMock: any
let requestQueue: PQueue

beforeEach(() => {
  getLocalesMock = jest.fn(() => Promise.resolve({
    items: [{ code: 'en-US' }, { code: 'es' }, { code: 'zh-Hant-TW' }]
  }))
  clientMock = {
    getSpace: jest.fn(() => Promise.resolve({
      getEnvironment: jest.fn(() => Promise.resolve({
        getLocales: getLocalesMock,
        getEditorInterfaceForContentType: jest.fn(),
        createUpload: jest.fn()
      }))
    }))
  }
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

afterEach(() => {
  publishEntitiesMock.mockClear()
})

function run(sourceData: TransformedSourceData) {
  return pushToSpace({
    sourceData,
    destinationData: {},
    client: clientMock,
    plainClient: { entry: { publish: jest.fn() }, asset: { publish: jest.fn() } },
    spaceId: 'spaceid',
    environmentId: 'master',
    requestQueue
  }).run({ data: {} })
}

function entryPublishCall() {
  return publishEntitiesMock.mock.calls
    .map(([args]) => args)
    .find((args) => args.localePublishing?.namespace === 'entry')
}

test('scopes entry publishing to the live locales from fieldStatus', async () => {
  await run(makeSourceData([
    makeEntry('mixed', { 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'changed' })
  ]))

  const call = entryPublishCall()
  expect(call.localePublishing.plainClient).toBeDefined()
  expect(call.localePublishing.spaceId).toBe('spaceid')
  expect(call.localePublishing.environmentId).toBe('master')
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
  expect(entryPublishCall().localePublishing.localesByEntityId.size).toBe(0)
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

test('publishes whole entities when no plain client is available', async () => {
  await pushToSpace({
    sourceData: makeSourceData([makeEntry('mixed', { 'en-US': 'published', es: 'draft' })]),
    destinationData: {},
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    requestQueue
  }).run({ data: {} })

  const call = publishEntitiesMock.mock.calls
    .map(([args]) => args)
    .find((args) => args.entities.length > 0)
  expect(call.localePublishing).toBeUndefined()
  expect(getLocalesMock).not.toHaveBeenCalled()
})
