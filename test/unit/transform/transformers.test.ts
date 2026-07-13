import { cloneMock } from 'contentful-batch-libs/test/mocks/'

import * as transformers from '../../../lib/transform/transformers'

const _ = {}

test('It should transform processed asset', () => {
  const assetMock = cloneMock('asset')
  assetMock.fields = {
    file: {
      'en-US': { fileName: 'filename.jpg', url: '//server/filename.jpg' },
      'de-DE': { fileName: 'filename.jpg', url: '//server/filename-de.jpg' }
    }
  }
  const transformedAsset = transformers.assets(assetMock, _)
  expect(transformedAsset.fields.file['en-US'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['de-DE'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['en-US'].upload).toBe('https:' + assetMock.fields.file['en-US'].url)
  expect(transformedAsset.fields.file['de-DE'].upload).toBe('https:' + assetMock.fields.file['de-DE'].url)
})

test('It should transform processed asset with and without protocol', () => {
  const assetMock = cloneMock('asset')
  assetMock.fields = {
    file: {
      'en-US': { fileName: 'filename.jpg', url: 'https://server/filename.jpg' },
      'de-DE': { fileName: 'filename.jpg', url: '//server/filename-de.jpg' }
    }
  }
  const transformedAsset = transformers.assets(assetMock, _)
  expect(transformedAsset.fields.file['en-US'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['de-DE'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['en-US'].upload).toBe(assetMock.fields.file['en-US'].url)
  expect(transformedAsset.fields.file['de-DE'].upload).toBe('https:' + assetMock.fields.file['de-DE'].url)
})

test('It should transform unprocessed asset', () => {
  const assetMock = cloneMock('asset')
  assetMock.fields = {
    file: {
      'en-US': { fileName: 'filename.jpg', upload: '//server/filename.jpg' },
      'de-DE': { fileName: 'filename.jpg', upload: '//server/filename-de.jpg' }
    }
  }
  const transformedAsset = transformers.assets(assetMock, _)
  expect(transformedAsset.fields.file['en-US'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['de-DE'].upload).toBeTruthy()
  expect(transformedAsset.fields.file['en-US'].upload).toBe('https:' + assetMock.fields.file['en-US'].upload)
  expect(transformedAsset.fields.file['de-DE'].upload).toBe('https:' + assetMock.fields.file['de-DE'].upload)
})

test('It should transform unprocessed asset with uploadFrom', () => {
  const assetMock = cloneMock('asset')
  assetMock.fields = {
    file: {
      'en-US': { fileName: 'filename.jpg', uploadFrom: { sys: { id: 'upload-en-US' } } },
      'de-DE': { fileName: 'filename.jpg', uploadFrom: { sys: { id: 'upload-de-DE' } } }
    }
  }
  const transformedAsset = transformers.assets(assetMock, _)
  expect(transformedAsset.fields.file['en-US'].uploadFrom).toBeTruthy()
  expect(transformedAsset.fields.file['de-DE'].uploadFrom).toBeTruthy()
  expect(transformedAsset.fields.file['en-US'].uploadFrom.sys.id).toBe(assetMock.fields.file['en-US'].uploadFrom.sys.id)
  expect(transformedAsset.fields.file['de-DE'].uploadFrom.sys.id).toBe(assetMock.fields.file['de-DE'].uploadFrom.sys.id)
})

test('It should transform webhook with credentials to normal webhook', () => {
  const webhookMock = cloneMock('webhook')
  webhookMock.httpBasicUsername = 'user name'
  const transformedWebhook = transformers.webhooks(webhookMock)
  expect(transformedWebhook.httpBasicUsername).toBeFalsy()
})

test('It should transform webhook with secret headers', () => {
  const webhookMock = cloneMock('webhook')
  const secretHeader = { key: 'Authorization', secret: true }
  const nonSecretHeader = { key: 'headerkey', value: 'headerval' }
  const headers = [secretHeader, nonSecretHeader]
  webhookMock.headers = headers
  const transformedWebhook = transformers.webhooks(webhookMock)
  expect(transformedWebhook.headers).toHaveLength(headers.length - 1)
})

test('It should transform a locale and return it', () => {
  const localeMock = cloneMock('locale')
  localeMock.code = 'de-DE'
  const destinationLocalesMock = [cloneMock('locale'), cloneMock('locale')]
  destinationLocalesMock[0].code = 'de-DE'
  destinationLocalesMock[0].sys.id = 'destinationLocaleId'
  const transformedLocale = transformers.locales(localeMock, destinationLocalesMock)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  expect(transformedLocale.sys.id).toBe(destinationLocalesMock[0].sys.id)
})

test('It should transform an entry with tags enabled, and return it', () => {
  const entryMock = cloneMock('entry')
  entryMock.metadata = { tags: [] }
  const transformed = transformers.entries(entryMock, null, true)
  expect(transformed.metadata).toEqual({ tags: [] })
})

test('It should transform an entry with tags disabled, and return it', () => {
  const entryMock = cloneMock('entry')
  entryMock.metadata = { tags: [] }
  const transformed = transformers.entries(entryMock, null, false)
  expect(transformed.metadata).toBeUndefined()
})

const urnCtx = {
  destinationSpaceId: 'dst-space',
  destinationEnvironmentId: 'dst-env'
}

const SRC_URN = 'crn:contentful:::experience:spaces/src-space/environments/src-env/componentTypes/abc123'
const DST_URN = 'crn:contentful:::experience:spaces/dst-space/environments/dst-env/componentTypes/abc123'

test('rewriteUrns rewrites ResourceLink URNs to destination space/env', () => {
  const entity = {
    sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: SRC_URN }
  }
  const result = transformers.rewriteUrns(entity, urnCtx) as typeof entity
  expect(result.sys.urn).toBe(DST_URN)
})

test('rewriteUrns preserves entity ID at end of URN', () => {
  const entity = {
    sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: SRC_URN }
  }
  const result = transformers.rewriteUrns(entity, urnCtx) as typeof entity
  expect(result.sys.urn).toContain('abc123')
})

test('rewriteUrns rewrites nested ResourceLinks recursively', () => {
  const entity = {
    sys: { id: 'top', type: 'ComponentType' },
    componentTree: [
      {
        nodeType: 'Component',
        componentType: {
          sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: SRC_URN }
        }
      }
    ]
  }
  const result = transformers.rewriteUrns(entity, urnCtx) as typeof entity
  expect((result.componentTree[0] as any).componentType.sys.urn).toBe(DST_URN)
})

test('rewriteUrns is a no-op on same-space same-env round-trip', () => {
  const sameCtx = { destinationSpaceId: 'src-space', destinationEnvironmentId: 'src-env' }
  const entity = {
    sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: SRC_URN }
  }
  const result = transformers.rewriteUrns(entity, sameCtx) as typeof entity
  expect(result.sys.urn).toBe(SRC_URN)
})

test('componentTypes transformer rewrites URNs when ctx provided', () => {
  const entity = {
    sys: { id: 'ct1', type: 'ComponentType' as const, version: 1 },
    componentTree: [
      { nodeType: 'Component', componentType: { sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: SRC_URN } } }
    ]
  } as any
  const result = transformers.componentTypes(entity, null, null, urnCtx) as any
  expect(result.componentTree[0].componentType.sys.urn).toBe(DST_URN)
})

test('designTokens transformer passes entity through unchanged', () => {
  const entity = { sys: { id: 'dt1', type: 'DesignToken' }, value: '#fff' }
  expect(transformers.designTokens(entity)).toBe(entity)
})
