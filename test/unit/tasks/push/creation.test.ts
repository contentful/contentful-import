import PQueue from 'p-queue'
import { createEntities, createLocales, createEntries } from '../../../../lib/tasks/push-to-space/creation'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulValidationError } from '../../../../lib/utils/errors'
import { EntityTransformed } from '../../../../lib/types'
import { LocaleProps, TagProps } from 'contentful-management'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

const mockEmit = jest.mocked(logEmitter.emit)

let requestQueue

import { PlainClientAPI } from 'contentful-management'

function makeClient (overrides: Record<string, any> = {}) {
  return {
    asset: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Asset' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Asset' } }),
      update: jest.fn().mockResolvedValue({ sys: { type: 'Asset' } }),
    },
    contentType: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'ContentType' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'ContentType' } }),
      update: jest.fn().mockResolvedValue({ sys: { type: 'ContentType' } }),
    },
    entry: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      update: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
    },
    locale: {
      create: jest.fn().mockResolvedValue({ sys: { type: 'Locale' } }),
      update: jest.fn().mockResolvedValue({ sys: { type: 'Locale' } }),
    },
    tag: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Tag' } }),
    },
    webhook: {
      create: jest.fn().mockResolvedValue({ sys: { type: 'Webhook' } }),
      update: jest.fn().mockResolvedValue({ sys: { type: 'Webhook' } }),
    },
    ...overrides,
  }
}

const spaceId = 'test-space'
const environmentId = 'master'

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
})

afterEach(() => {
  mockEmit.mockClear()
})

test('Create entities', () => {
  const client = makeClient()
  return createEntities({
    context: { client, spaceId, environmentId, type: 'Asset' },
    entities: [
      { original: { sys: {} }, transformed: { sys: { id: '123' } } as any },
      { original: { sys: {} }, transformed: { sys: { id: '456' } } as any }
    ],
    destinationEntitiesById: new Map([
      ['123', { sys: { id: '123', version: 6 } }]
    ]),
    requestQueue
  })
    .then(() => {
      expect(client.asset.createWithId.mock.calls).toHaveLength(1)
      expect(client.asset.update.mock.calls).toHaveLength(1)
      expect(mockEmit.mock.calls).toHaveLength(2)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entities and skip updates', () => {
  const client = makeClient()
  return createEntities({
    context: { client, spaceId, environmentId, type: 'Asset' },
    entities: [
      { original: { sys: {} }, transformed: { sys: { id: '123' } } as any },
      { original: { sys: {} }, transformed: { sys: { id: '456' } } as any }
    ],
    destinationEntitiesById: new Map([
      ['123', { sys: { id: '123', version: 6 } }]
    ]),
    skipUpdates: true,
    requestQueue
  })
    .then(() => {
      expect(client.asset.createWithId.mock.calls).toHaveLength(1)
      expect(client.asset.update.mock.calls).toHaveLength(0)
      expect(mockEmit.mock.calls).toHaveLength(2)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entities handle regular errors', () => {
  const creationError = new Error('could not create entity')
  const client = makeClient({
    asset: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Asset' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Asset' } }),
      update: jest.fn().mockRejectedValueOnce(creationError),
    },
  })

  const entries = [{
    original: { sys: { contentType: { sys: { id: 'ctid' } } } },
    transformed: { sys: { id: '123' }, fields: { gonefield: '', existingfield: '' } }
  }] as any[]

  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])

  return createEntities({
    context: { client, spaceId, environmentId, type: 'Asset' },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    requestQueue
  })
    .then((result) => {
      expect(client.asset.update.mock.calls).toHaveLength(1)
      expect(mockEmit.mock.calls).toHaveLength(1)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      expect(mockEmit.mock.calls[0][0]).toBe('error')
      expect(mockEmit.mock.calls[0][1]).toBe(creationError)
      expect(result).toHaveLength(0)
    })
})

test('Create entries', () => {
  const client = makeClient()
  const entries = [
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: { id: '123' } } },
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: { id: '456' } } },
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: {} } }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])
  return createEntries({
    context: { client, spaceId, environmentId, type: 'Entry', skipContentModel: false },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  })
    .then(() => {
      expect(client.entry.createWithId.mock.calls).toHaveLength(1)
      expect(client.entry.create.mock.calls).toHaveLength(1)
      expect(client.entry.update.mock.calls).toHaveLength(1)
      expect(mockEmit.mock.calls).toHaveLength(3)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entries and skip updates', () => {
  const client = makeClient()
  const entries = [
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: { id: '123' } } },
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: { id: '456' } } },
    { original: { sys: { contentType: { sys: { id: 'ctid' } } } }, transformed: { sys: {} } }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])
  return createEntries({
    context: { client, spaceId, environmentId, type: 'Entry', skipContentModel: false },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: true,
    requestQueue
  })
    .then(() => {
      expect(client.entry.createWithId.mock.calls).toHaveLength(1)
      expect(client.entry.create.mock.calls).toHaveLength(1)
      expect(client.entry.update.mock.calls).toHaveLength(0)
      expect(mockEmit.mock.calls).toHaveLength(3)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entries and remove unknown fields', () => {
  const errorUnkownField = new Error()
  errorUnkownField.name = 'UnknownField'
  errorUnkownField.message = JSON.stringify({
    details: {
      errors: [{
        name: 'unknown',
        path: ['fields', 'gonefield']
      }]
    }
  })

  const client = makeClient({
    entry: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      update: jest.fn()
        .mockRejectedValueOnce(errorUnkownField)
        .mockResolvedValueOnce({ sys: { type: 'Entry', id: '123' }, fields: {} }),
    },
  })

  const entries = [{
    original: { sys: { contentType: { sys: { id: 'ctid' } } } },
    transformed: { sys: { id: '123' }, fields: { gonefield: '', existingfield: '' } }
  }]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])

  return createEntries({
    context: { client, spaceId, environmentId, type: 'Entry', skipContentModel: true },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  })
    .then(() => {
      expect(client.entry.update.mock.calls).toHaveLength(2)
      expect('existingfield' in entries[0].transformed.fields).toBeTruthy()
      expect('gonefield' in entries[0].transformed.fields).toBeFalsy()
      expect(mockEmit.mock.calls).toHaveLength(1)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entries and handle regular errors', () => {
  const creationError = new Error('Some creation error')
  const client = makeClient({
    entry: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      update: jest.fn().mockRejectedValueOnce(creationError),
    },
  })

  const entries = [{
    original: { sys: { contentType: { sys: { id: 'ctid' } } } },
    transformed: { sys: { id: '123' }, fields: { gonefield: '', existingfield: '' } }
  }]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])

  return createEntries({
    context: { client, spaceId, environmentId, type: 'Entry' },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  })
    .then((result) => {
      expect(client.entry.update.mock.calls).toHaveLength(1)
      expect(mockEmit.mock.calls).toHaveLength(1)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      expect(mockEmit.mock.calls[0][0]).toBe('error')
      expect(mockEmit.mock.calls[0][1]).toBe(creationError)
      expect(result).toHaveLength(0)
    })
})

test('Create private tags', () => {
  const client = makeClient()
  const tags = [
    {
      original: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          visibility: 'private',
          type: 'Tag'
        }
      },
      transformed: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          visibility: 'private',
          type: 'Tag'
        }
      }
    }
  ] as EntityTransformed<TagProps, any>[]

  return createEntities({
    context: { client, spaceId, environmentId, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  })
    .then(() => {
      expect(client.tag.createWithId.mock.calls).toHaveLength(1)
      expect(client.tag.createWithId).toHaveBeenCalledWith(
        { spaceId, environmentId, tagId: 'testTag' },
        { name: 'Test Tag', sys: { visibility: 'private' } }
      )
    })
})

test('Create default private tags', () => {
  const client = makeClient()
  const tags = [
    {
      original: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          type: 'Tag'
        }
      },
      transformed: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          type: 'Tag'
        }
      }
    }
  ] as EntityTransformed<TagProps, any>[]

  return createEntities({
    context: { client, spaceId, environmentId, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  })
    .then(() => {
      expect(client.tag.createWithId.mock.calls).toHaveLength(1)
      expect(client.tag.createWithId).toHaveBeenCalledWith(
        { spaceId, environmentId, tagId: 'testTag' },
        { name: 'Test Tag', sys: { visibility: 'private' } }
      )
    })
})

test('Create public tags', () => {
  const client = makeClient()
  const tags = [
    {
      original: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          type: 'Tag',
          visibility: 'public'
        }
      },
      transformed: {
        name: 'Test Tag',
        sys: {
          id: 'testTag',
          type: 'Tag',
          visibility: 'public'
        }
      }
    }
  ] as EntityTransformed<TagProps, any>[]

  return createEntities({
    context: { client, spaceId, environmentId, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  })
    .then(() => {
      expect(client.tag.createWithId.mock.calls).toHaveLength(1)
      expect(client.tag.createWithId).toHaveBeenCalledWith(
        { spaceId, environmentId, tagId: 'testTag' },
        { name: 'Test Tag', sys: { visibility: 'public' } }
      )
    })
})

test('Create entities handles VersionMismatch as a warning', () => {
  const versionMismatchError = new Error('Version mismatch')
  ;(versionMismatchError as any).error = { sys: { id: 'VersionMismatch' } }

  const client = makeClient({
    entry: {
      createWithId: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      create: jest.fn().mockResolvedValue({ sys: { type: 'Entry' } }),
      update: jest.fn().mockRejectedValueOnce(versionMismatchError),
    },
  })

  const entities = [{
    original: { sys: { id: '123', type: 'Entry' } },
    transformed: { sys: { id: '123' } }
  }] as any[]

  const destinationEntities = new Map([
    ['123', { sys: { id: '123', version: 6 } }]
  ])

  return createEntities({
    context: { client, spaceId, environmentId, type: 'Entry' },
    entities,
    destinationEntitiesById: destinationEntities,
    requestQueue
  })
    .then((result) => {
      expect(client.entry.update.mock.calls).toHaveLength(1)
      expect(result).toHaveLength(0)
      const warningCount = mockEmit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = mockEmit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(1)
      expect(errorCount).toBe(0)
      const warningCall = mockEmit.mock.calls.find((args) => args[0] === 'warning')
      expect(warningCall).toBeDefined()
      expect(warningCall![1]).toContain('skipped')
    })
})

test('Fails to create locale if it already exists', () => {
  const errorValidationFailed = new ContentfulValidationError()
  errorValidationFailed.error = {
    sys: { id: 'ValidationFailed' },
    details: {
      errors: [{ name: 'taken' }]
    }
  }

  const client = makeClient({
    locale: {
      create: jest.fn().mockRejectedValue(errorValidationFailed),
      update: jest.fn().mockResolvedValue({ sys: { type: 'Locale' } }),
    },
  })

  const entity = { original: { sys: { } }, transformed: { sys: { } } } as EntityTransformed<LocaleProps, any>

  return createLocales({
    context: { client, spaceId, environmentId, type: 'Locale' },
    entities: [entity],
    destinationEntitiesById: new Map(),
    requestQueue
  })
    .then((entities) => {
      expect(entities[0]).toBe(entity)
      const logLevels = mockEmit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})
