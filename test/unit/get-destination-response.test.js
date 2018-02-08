import getDestinationResponse from '../../lib/get-destination-response'

import getOutdatedDestinationContentStub from 'contentful-batch-libs/dist/get/get-outdated-destination-content'

const managementClient = Symbol('managementClient')
const spaceId = Symbol('spaceId')
const contentModelOnly = Symbol('contentModelOnly')

const sourceResponse = {
  entries: [
    { sys: { id: 'entry1' } },
    { sys: { id: 'entry2' } }
  ],
  assets: [
    { sys: { id: 'asset1' } },
    { sys: { id: 'asset2' } }
  ]
}

jest.mock('contentful-batch-libs/dist/get/get-outdated-destination-content', () => {
  return jest.fn(() => Promise.resolve({
    entries: [
      { sys: { id: 'entry1' } },
      { sys: { id: 'entry2' } }
    ],
    assets: [
      { sys: { id: 'asset1' } },
      { sys: { id: 'asset2' } }
    ],
    locales: [
      { sys: { id: 'locale1' } },
      { sys: { id: 'locale2' } }
    ],
    contentTypes: [
      { sys: { id: 'contentType1' } },
      { sys: { id: 'contentType2' } }
    ]
  }))
})

afterEach(() => {
  getOutdatedDestinationContentStub.mockClear()
})

test('Gets complete destination response', () => {
  const skipLocales = false
  const skipContentModel = false

  return getDestinationResponse({
    managementClient,
    spaceId,
    sourceResponse,
    contentModelOnly,
    skipLocales,
    skipContentModel
  })
    .then((result) => {
      expect(getOutdatedDestinationContentStub.mock.calls).toHaveLength(1)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].managementClient).toBe(managementClient)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].spaceId).toBe(spaceId)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].sourceResponse).toEqual(sourceResponse)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].entryIds).toEqual(['entry1', 'entry2'])
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].assetIds).toEqual(['asset1', 'asset2'])
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].contentModelOnly).toBe(contentModelOnly)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].skipLocales).toBe(skipLocales)
      expect(getOutdatedDestinationContentStub.mock.calls[0][0].skipContentModel).toBe(skipContentModel)
      expect(result.entries).toHaveLength(2)
      expect(result.assets).toHaveLength(2)
      expect(result.locales).toHaveLength(2)
      expect(result.contentTypes).toHaveLength(2)
      expect(Object.keys(result)).toHaveLength(4)
    })
})

test('Gets destination response with content model skipped', () => {
  const skipLocales = false
  const skipContentModel = true

  return getDestinationResponse({
    managementClient,
    spaceId,
    sourceResponse,
    contentModelOnly,
    skipLocales,
    skipContentModel
  })
    .then((result) => {
      expect(getOutdatedDestinationContentStub.mock.calls).toHaveLength(1)
      expect(result.entries).toHaveLength(2)
      expect(result.assets).toHaveLength(2)
      expect(result.locales).toHaveLength(0)
      expect(result.contentTypes).toHaveLength(0)
      expect(Object.keys(result)).toHaveLength(4)
    })
})

test('Gets destination response with locales skipped', () => {
  const skipLocales = true
  const skipContentModel = false

  return getDestinationResponse({
    managementClient,
    spaceId,
    sourceResponse,
    contentModelOnly,
    skipLocales,
    skipContentModel
  })
    .then((result) => {
      expect(getOutdatedDestinationContentStub.mock.calls).toHaveLength(1)
      expect(result.entries).toHaveLength(2)
      expect(result.assets).toHaveLength(2)
      expect(result.locales).toHaveLength(0)
      expect(result.contentTypes).toHaveLength(2)
      expect(Object.keys(result)).toHaveLength(4)
    })
})
