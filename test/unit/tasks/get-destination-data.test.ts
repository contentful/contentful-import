import { afterEach, beforeEach, expect, test, vi } from 'vitest'
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

function batchQueryResolver (query) {
  const items = query['sys.id[in]'].split(',').map((id) => ({
    sys: {
      id
    }
  }))
  return Promise.resolve({
    items
  })
}

function batchPageResolver (sourceData) {
  return (query) => {
    const skip = query.skip || 0
    const limit = query.limit || 100
    const items = sourceData.slice(skip, skip + limit)
    return Promise.resolve({
      items,
      total: sourceData.length
    })
  }
}

const mockEnvironment = {
  getContentTypes: vi.fn(batchQueryResolver),
  getEntries: vi.fn(batchQueryResolver),
  getAssets: vi.fn(batchQueryResolver),
  getLocales: vi.fn(batchPageResolver(sourceData.locales)),
  getTags: vi.fn(batchPageResolver(sourceData.tags)) // resolve 250 tags
}

const mockSpace = {
  getEnvironment: vi.fn(() => Promise.resolve(mockEnvironment))
}

const mockClient = {
  getSpace: vi.fn()
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
  mockEnvironment.getContentTypes.mockClear()
  mockEnvironment.getEntries.mockClear()
  mockEnvironment.getAssets.mockClear()
  mockEnvironment.getLocales.mockClear()
  mockEnvironment.getTags.mockClear()
  mockSpace.getEnvironment.mockClear()
  mockClient.getSpace.mockClear()
})

function testQueryLength (method) {
  const query = mockEnvironment[method].mock.calls[0][0]['sys.id[in]']
  const queryLength = query.length
  expect(queryLength < 2100).toBeTruthy()
  expect(query[query.length - 1]).not.toBe(',')
}

test('Gets destination content', () => {
  mockClient.getSpace = vi.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(2)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(105)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(250)
    })
})

test('Gets destination content with content model skipped', () => {
  mockClient.getSpace = vi.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipContentModel: true,
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(3)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
    })
})

test('Gets destination content with locales skipped', () => {
  mockClient.getSpace = vi.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipLocales: true,
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(3)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(250)
    })
})

test('Gets destination content with contentModelOnly', () => {
  mockClient.getSpace = vi.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    contentModelOnly: true,
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(2)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(105)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
    })
})

test('Does not fail with incomplete source data', () => {
  mockClient.getSpace = vi.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(0)
      // we always fetch all tags, no matter what's included in source data
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(3)
      expect(response.contentTypes).toHaveLength(0)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(250)
    })
})

test('Removes Tags key from response if tags endpoint throws error (meaning tags not enabled)', () => {
  mockEnvironment.getTags.mockImplementation(async () => {
    throw new Error('fake error')
  })
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })
    .then((response) => {
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      expect(response.tags).toBeUndefined()
    })
})

test('Fails to get destination space', async () => {
  const errorNotFound = new Error()
  errorNotFound.name = 'NotFound'
  mockClient.getSpace = vi.fn(() => Promise.reject(errorNotFound))

  const wrappedFunc = () => {
    return getDestinationData({
      client: mockClient,
      spaceId: 'spaceid',
      environmentId: 'master',
      sourceData,
      skipContentModel: true,
      requestQueue
    })
  }

  let err
  await wrappedFunc()
    .catch(e => { err = e })

  expect(err.name).toEqual('NotFound')
})
