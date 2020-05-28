import {each} from 'lodash/collection'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'

import creation from '../../../../lib/tasks/push-to-space/creation'
import publishing from '../../../../lib/tasks/push-to-space/publishing'
import assets from '../../../../lib/tasks/push-to-space/assets'

jest.mock('../../../../lib/tasks/push-to-space/creation', () => ({
  createEntities: jest.fn((context) => {
    // Actually return one content type to get editor interfaces imported
    if (context.type === 'ContentType') {
      return Promise.resolve([
        {
          sys: {
            id: 'someId',
            type: 'ContentType',
            publishedVersion: 1
          }
        }
      ])
    }
    return Promise.resolve([])
  }),
  createEntries: jest.fn(() => Promise.resolve([])),
  createLocales: jest.fn(() => Promise.resolve([]))
}))
jest.mock('../../../../lib/tasks/push-to-space/publishing', () => ({
  publishEntities: jest.fn((entitiesToPublish) => {
    // Actually return one content type to get editor interfaces imported
    if (entitiesToPublish[0] && entitiesToPublish[0].sys.type === 'ContentType') {
      return Promise.resolve([{
        sys: {
          id: 'someId',
          type: 'ContentType'
        }
      }])
    }
    return Promise.resolve([])
  }),
  archiveEntities: jest.fn(() => Promise.resolve([])),
  unpublishEntities: jest.fn(() => Promise.resolve())
}))
jest.mock('../../../../lib/tasks/push-to-space/assets', () => ({
  processAssets: jest.fn(() => Promise.resolve([]))
}))

const sourceData = {
  locales: [],
  contentTypes: [
    {
      original: {
        sys: {
          id: 'someId',
          type: 'ContentType',
          publishedVersion: 1
        }
      }
    }
  ],
  assets: [],
  editorInterfaces: [
    {
      sys: {
        type: 'EditorInterface',
        contentType: {
          sys: {
            id: 'someId'
          }
        }
      }
    }
  ],
  entries: []
}

const destinationData = {}

const editorInterfaceUpdateMock = jest.fn()

const clientMock = {
  getSpace: jest.fn(() => Promise.resolve({
    getEnvironment: jest.fn(() => Promise.resolve({
      getEditorInterfaceForContentType: () => {
        return Promise.resolve({
          sys: {
            type: 'EditorInterface',
            contentType: {
              sys: {
                id: 'someId'
              }
            }
          },
          update: editorInterfaceUpdateMock
        })
      }
    }))
  }))
}

afterEach(() => {
  each(creation, (fn) => fn.mockClear())
  each(publishing, (fn) => fn.mockClear())
  each(assets, (fn) => fn.mockClear())
  editorInterfaceUpdateMock.mockClear()
})

test('Push content to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    prePublishDelay: 0,
    timeout: 40000,
    retryLimit: 20
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(3)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(creation.createLocales.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(3)
      expect(publishing.archiveEntities.mock.calls).toHaveLength(2)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls[0][1]).toEqual({retryLimit: 20, timeout: 40000})
    })
})

test('Push only content types and locales to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    prePublishDelay: 0,
    contentModelOnly: true
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(1)
      expect(creation.createEntries.mock.calls).toHaveLength(0)
      expect(creation.createLocales.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(0)
    })
})

test('Push only content types', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    prePublishDelay: 0,
    contentModelOnly: true,
    skipLocales: true
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(1)
      expect(creation.createEntries.mock.calls).toHaveLength(0)
      expect(publishing.publishEntities.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(0)
    })
})

test('Push only entries and assets to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    prePublishDelay: 0,
    skipContentModel: true
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(2)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(2)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(0)
    })
})

test('Push only entries and assets to destination space and skip publishing', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    prePublishDelay: 0,
    skipContentModel: true,
    skipContentPublishing: true
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(2)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(0)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(0)
    })
})
