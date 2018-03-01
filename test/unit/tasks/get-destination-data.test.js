import { times } from 'lodash/util'

import getDestinationData from '../../../lib/tasks/get-destination-data'

const sourceData = {
  contentTypes: times(150, (n) => ({sys: {id: `ct-${n}`}})),
  locales: times(5, (n) => ({sys: {id: `ct-${n}`}})),
  entries: times(2000, (n) => ({sys: {id: `e-${n}`}})),
  assets: times(1500, (n) => ({sys: {id: `a-${n}`}}))
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

const mockSpace = {
  getContentTypes: jest.fn(batchQueryResolver),
  getEntries: jest.fn(batchQueryResolver),
  getAssets: jest.fn(batchQueryResolver),
  getLocales: jest.fn(batchQueryResolver)
}

const mockClient = {
  getSpace: jest.fn()
}

afterEach(() => {
  mockSpace.getContentTypes.mockClear()
  mockSpace.getEntries.mockClear()
  mockSpace.getAssets.mockClear()
  mockSpace.getLocales.mockClear()
  mockClient.getSpace.mockClear()
})

function testQueryLength (method) {
  const query = mockSpace[method].mock.calls[0][0]['sys.id[in]']
  const queryLength = query.length
  expect(queryLength < 2100).toBeTruthy()
  expect(query[query.length - 1]).not.toBe(',')
}

test('Gets destination content', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    sourceData
  })
    .then((response) => {
      expect(mockSpace.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockSpace.getLocales.mock.calls).toHaveLength(1)
      testQueryLength('getLocales')
      expect(mockSpace.getEntries.mock.calls).toHaveLength(20)
      testQueryLength('getEntries')
      expect(mockSpace.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(5)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
    })
})

test('Gets destination content with content model skipped', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    sourceData,
    skipContentModel: true
  })
    .then((response) => {
      expect(mockSpace.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockSpace.getLocales.mock.calls).toHaveLength(0)
      expect(mockSpace.getEntries.mock.calls).toHaveLength(20)
      testQueryLength('getEntries')
      expect(mockSpace.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(0)
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
    sourceData,
    skipLocales: true
  })
    .then((response) => {
      expect(mockSpace.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockSpace.getLocales.mock.calls).toHaveLength(0)
      expect(mockSpace.getEntries.mock.calls).toHaveLength(20)
      testQueryLength('getEntries')
      expect(mockSpace.getAssets.mock.calls).toHaveLength(15)
      testQueryLength('getAssets')
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(2000)
      expect(response.assets).toHaveLength(1500)
    })
})

test('Gets destination content with contentModelOnly', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    sourceData,
    contentModelOnly: true
  })
    .then((response) => {
      expect(mockSpace.getContentTypes.mock.calls).toHaveLength(2)
      testQueryLength('getContentTypes')
      expect(mockSpace.getLocales.mock.calls).toHaveLength(1)
      testQueryLength('getLocales')
      expect(mockSpace.getEntries.mock.calls).toHaveLength(0)
      expect(mockSpace.getAssets.mock.calls).toHaveLength(0)
      expect(response.contentTypes).toHaveLength(150)
      expect(response.locales).toHaveLength(5)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
    })
})

test('Does not fail with incomplete source data', () => {
  mockClient.getSpace = jest.fn(() => Promise.resolve(mockSpace))
  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
    sourceData: {}
  })
    .then((response) => {
      expect(mockSpace.getContentTypes.mock.calls).toHaveLength(0)
      expect(mockSpace.getLocales.mock.calls).toHaveLength(0)
      expect(mockSpace.getEntries.mock.calls).toHaveLength(0)
      expect(mockSpace.getAssets.mock.calls).toHaveLength(0)
      expect(response.contentTypes).toHaveLength(0)
      expect(response.locales).toHaveLength(0)
      expect(response.entries).toHaveLength(0)
      expect(response.assets).toHaveLength(0)
    })
})

test('Fails to get destination space', () => {
  const errorNotFound = new Error()
  errorNotFound.name = 'NotFound'
  mockClient.getSpace = jest.fn(() => Promise.reject(errorNotFound))

  return getDestinationData({
    client: mockClient,
    spaceId: 'spaceid',
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
