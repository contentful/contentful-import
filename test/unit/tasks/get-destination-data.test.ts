import { times } from 'lodash/util'
import PQueue from 'p-queue'

import getDestinationData from '../../../lib/tasks/get-destination-data'

const sourceData = {
  contentTypes: times(150, (n) => ({ sys: { id: `ct-${n}` } })),
  locales: times(105, (n) => ({ sys: { id: `ct-${n}` } })),
  entries: times(2000, (n) => ({ sys: { id: `e-${n}` } })),
  assets: times(1500, (n) => ({ sys: { id: `a-${n}` } })),
  tags: times(250, (n) => ({ sys: { id: `t-${n}` }, name: `t-${n}` }))
}

function batchQueryResolver ({ query }) {
  const items = query['sys.id[in]'].split(',').map((id) => ({
    sys: { id }
  }))
  return Promise.resolve({ items, total: items.length })
}

function batchPageResolver (allItems) {
  return ({ query }) => {
    const skip = query?.skip || 0
    const limit = query?.limit || 100
    const items = allItems.slice(skip, skip + limit)
    return Promise.resolve({
      items,
      total: allItems.length
    })
  }
}

const mockGetManyContentTypes = jest.fn(batchQueryResolver)
const mockGetManyEntries = jest.fn(batchQueryResolver)
const mockGetManyAssets = jest.fn(batchQueryResolver)
const mockGetManyLocales = jest.fn(batchPageResolver(sourceData.locales))
const mockGetManyTags = jest.fn(batchPageResolver(sourceData.tags))

const mockClient = {
  contentType: { getMany: mockGetManyContentTypes },
  entry: { getMany: mockGetManyEntries },
  asset: { getMany: mockGetManyAssets },
  locale: { getMany: mockGetManyLocales },
  tag: { getMany: mockGetManyTags },
}

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
  mockGetManyContentTypes.mockClear()
  mockGetManyEntries.mockClear()
  mockGetManyAssets.mockClear()
  mockGetManyLocales.mockClear()
  mockGetManyTags.mockClear()
})

function testQueryLength (mockFn: jest.Mock) {
  const query = mockFn.mock.calls[0][0].query['sys.id[in]']
  const queryLength = query.length
  expect(queryLength < 2100).toBeTruthy()
  expect(query[query.length - 1]).not.toBe(',')
}

test('Gets destination content', () => {
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyContentTypes.mock.calls).toHaveLength(2)
      testQueryLength(mockGetManyContentTypes)
      expect(mockGetManyLocales.mock.calls).toHaveLength(2)
      expect(mockGetManyEntries.mock.calls).toHaveLength(20)
      testQueryLength(mockGetManyEntries)
      expect(mockGetManyAssets.mock.calls).toHaveLength(15)
      testQueryLength(mockGetManyAssets)
      expect(mockGetManyTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(105)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(250)
    })
})

test('Gets destination content with content model skipped', () => {
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipContentModel: true,
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyContentTypes.mock.calls).toHaveLength(0)
      expect(mockGetManyLocales.mock.calls).toHaveLength(0)
      expect(mockGetManyEntries.mock.calls).toHaveLength(20)
      expect(mockGetManyTags.mock.calls).toHaveLength(3)
      testQueryLength(mockGetManyEntries)
      expect(mockGetManyAssets.mock.calls).toHaveLength(15)
      testQueryLength(mockGetManyAssets)
      expect(response.contentTypes).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
    })
})

test('Gets destination content with locales skipped', () => {
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipLocales: true,
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyContentTypes.mock.calls).toHaveLength(2)
      testQueryLength(mockGetManyContentTypes)
      expect(mockGetManyLocales.mock.calls).toHaveLength(0)
      expect(mockGetManyEntries.mock.calls).toHaveLength(20)
      expect(mockGetManyTags.mock.calls).toHaveLength(3)
      testQueryLength(mockGetManyEntries)
      expect(mockGetManyAssets.mock.calls).toHaveLength(15)
      testQueryLength(mockGetManyAssets)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(250)
    })
})

test('Gets destination content with contentModelOnly', () => {
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    contentModelOnly: true,
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyContentTypes.mock.calls).toHaveLength(2)
      testQueryLength(mockGetManyContentTypes)
      expect(mockGetManyLocales.mock.calls).toHaveLength(2)
      expect(mockGetManyEntries.mock.calls).toHaveLength(0)
      expect(mockGetManyAssets.mock.calls).toHaveLength(0)
      expect(mockGetManyTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(105)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
    })
})

test('Does not fail with incomplete source data', () => {
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyContentTypes.mock.calls).toHaveLength(0)
      expect(mockGetManyLocales.mock.calls).toHaveLength(0)
      expect(mockGetManyEntries.mock.calls).toHaveLength(0)
      expect(mockGetManyAssets.mock.calls).toHaveLength(0)
      // we always fetch all tags, no matter what's included in source data
      expect(mockGetManyTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(0)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
    })
})

test('Removes Tags key from response if tags endpoint throws error (meaning tags not enabled)', () => {
  mockGetManyTags.mockImplementationOnce(async () => {
    throw new Error('fake error')
  })
  return getDestinationData({
    client: mockClient as any,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })
    .then((response) => {
      expect(mockGetManyTags.mock.calls).toHaveLength(1)
      expect(response.tags).toBeUndefined()
    })
})
