import { times } from 'lodash/util'

import getDestinationData from '../../../lib/tasks/get-destination-data'

const sourceData = {
  contentTypes: times(150, (n) => ({sys: {id: `ct-${n}`}})),
  locales: times(5, (n) => ({sys: {id: `ct-${n}`}})),
  entries: times(2000, (n) => ({sys: {id: `e-${n}`}})),
  assets: times(1500, (n) => ({sys: {id: `a-${n}`}})),
  tags: times(100, (n) => ({sys: {id: `t-${n}`}, name: `t-${n}`}))
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

const mockEnvironment = {
  getContentTypes: jest.fn(batchQueryResolver),
  getEntries: jest.fn(batchQueryResolver),
  getAssets: jest.fn(batchQueryResolver),
  getLocales: jest.fn(batchQueryResolver),
  getTags: jest.fn().mockReturnValue(Promise.resolve(sourceData.tags)) //resolve 100 tags
}

const mockSpace = {
  getEnvironment: jest.fn(() => Promise.resolve(mockEnvironment))
}

const mockClient = {
  getSpace: jest.fn()
}

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
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(1)
      testQueryLength('getLocales')
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(5)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(100)
    })
})

test('Gets destination content with content model skipped', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipContentModel: true
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(0)
      expect(response.tags).toHaveLength(100)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
    })
})

test('Gets destination content with locales skipped', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipLocales: true
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(20)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      testQueryLength('getEntries')
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
      expect(response.tags).toHaveLength(100)
    })
})

test('Gets destination content with contentModelOnly', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    contentModelOnly: true
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(1)
      testQueryLength('getLocales')
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(5)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(100)
    })
})

test('Does not fail with incomplete source data', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {}
  })
    .then((response) => {
      expect(mockEnvironment.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getLocales.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getEntries.mock.calls).toHaveLength(0)
      expect(mockEnvironment.getAssets.mock.calls).toHaveLength(0)
      // we always fetch all tags, no matter what's included in source data
      expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
      expect(response.contentTypes).toHaveLength(0)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
      expect(response.tags).toHaveLength(100)
    })
})

test('Removes Tags key from response if tags endpoint throws error (meaning tags not enabled)', () => {

  mockEnvironment.getTags.mockImplementation(() => {
    throw new Error()
  })
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData: {}
  })
  .then((response) => {
    expect(mockEnvironment.getTags.mock.calls).toHaveLength(1)
    expect(response.tags).toBeUndefined()
  })

})

test('Fails to get destination space', () => {
  const errorNotFound = new Error()
  errorNotFound.name = 'NotFound'
  mockClient.getSpace = jest.fn(() => Promise.reject(errorNotFound))

  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    environmentId: 'master',
    sourceData,
    skipContentModel: true
  })
    .then(() => {
      throw new Error('should not succeed')
    })
    .catch((err) => {
      expect(err.name).toEqual('NotFound')
    })
})
