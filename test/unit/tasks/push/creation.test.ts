import { vi, beforeEach, afterEach, expect, test } from 'vitest'

import PQueue from 'p-queue'
import {
  createEntities,
  createLocales,
  createEntries
} from '../../../../lib/tasks/push-to-space/creation'

import { logEmitter } from 'contentful-batch-libs'
import { ContentfulValidationError } from '../../../../lib/utils/errors'
import { EntityTransformed } from '../../../../lib/types'
import { Entry, LocaleProps, TagProps } from 'contentful-management'

vi.mock('contentful-batch-libs', () => ({
  logEmitter: {
    emit: vi.fn()
  },
  getEntityName: (entity?: Entry) =>
    entity && entity.sys ? entity.sys.id : 'unknown'
}))

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
  logEmitter.emit.mockClear()
})

test('Create entities', () => {
  const updateStub = vi
    .fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))
  const target = {
    createAssetWithId: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))
  }
  return createEntities({
    context: { target, type: 'Asset' },
    entities: [
      { original: { sys: {} }, transformed: { sys: { id: '123' } } as any },
      { original: { sys: {} }, transformed: { sys: { id: '456' } } as any }
    ],
    destinationEntitiesById: new Map([
      ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
    ]),
    requestQueue
  }).then(() => {
    expect(target.createAssetWithId.mock.calls).toHaveLength(1)
    expect(updateStub.mock.calls).toHaveLength(1)
    expect(logEmitter.emit.mock.calls).toHaveLength(2)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    console.dir(
      { logLevels, calls: logEmitter.emit.mock.calls },
      { depth: null }
    )
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})

test('Create entities and skip updates', () => {
  const updateStub = vi
    .fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))
  const target = {
    createAssetWithId: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))
  }
  return createEntities({
    context: { target, type: 'Asset' },
    entities: [
      { original: { sys: {} }, transformed: { sys: { id: '123' } } as any },
      { original: { sys: {} }, transformed: { sys: { id: '456' } } as any }
    ],
    destinationEntitiesById: new Map([
      ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
    ]),
    skipUpdates: true,
    requestQueue
  }).then(() => {
    expect(target.createAssetWithId.mock.calls).toHaveLength(1)
    expect(updateStub.mock.calls).toHaveLength(0)
    expect(logEmitter.emit.mock.calls).toHaveLength(2)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})

test('Create entities handle regular errors', () => {
  const updateStub = vi.fn()
  const target = {
    createEntryWithId: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } }))
  }
  const creationError = new Error('could not create entity')
  updateStub.mockImplementationOnce(() => Promise.reject(creationError))

  const entries = [
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: {
        sys: { id: '123' },
        fields: { gonefield: '', existingfield: '' }
      }
    }
  ] as any[]

  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
  ])

  return createEntities({
    context: { target, type: 'Asset' },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    requestQueue
  }).then(result => {
    expect(updateStub.mock.calls).toHaveLength(1)
    expect(logEmitter.emit.mock.calls).toHaveLength(1)
    const warningCount = logEmitter.emit.mock.calls.filter(
      args => args[0] === 'warning'
    ).length
    const errorCount = logEmitter.emit.mock.calls.filter(
      args => args[0] === 'error'
    ).length
    expect(warningCount).toBe(0)
    expect(errorCount).toBe(1)
    expect(logEmitter.emit.mock.calls[0][0]).toBe('error')
    expect(logEmitter.emit.mock.calls[0][1]).toBe(creationError)
    expect(result).toHaveLength(0)
  })
})

test('Create entries', () => {
  const updateStub = vi
    .fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } }))
  const target = {
    createEntryWithId: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } })),
    createEntry: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } }))
  }
  const entries = [
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: { id: '123' } }
    },
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: { id: '456' } }
    },
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: {} }
    }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
  ])
  return createEntries({
    context: { target, skipContentModel: false },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  }).then(() => {
    expect(target.createEntryWithId.mock.calls).toHaveLength(1)
    expect(target.createEntry.mock.calls).toHaveLength(1)
    expect(updateStub.mock.calls).toHaveLength(1)
    expect(logEmitter.emit.mock.calls).toHaveLength(3)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})

test('Create entries and skip updates', () => {
  const updateStub = vi
    .fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } }))
  const target = {
    createEntryWithId: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } })),
    createEntry: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Entry' } }))
  }
  const entries = [
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: { id: '123' } }
    },
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: { id: '456' } }
    },
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: { sys: {} }
    }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
  ])
  return createEntries({
    context: { target, skipContentModel: false },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: true,
    requestQueue
  }).then(() => {
    expect(target.createEntryWithId.mock.calls).toHaveLength(1)
    expect(target.createEntry.mock.calls).toHaveLength(1)
    expect(updateStub.mock.calls).toHaveLength(0)
    expect(logEmitter.emit.mock.calls).toHaveLength(3)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})

test('Create entries and remove unknown fields', () => {
  const updateStub = vi.fn()
  const errorUnkownField = new Error()
  errorUnkownField.name = 'UnknownField'
  errorUnkownField.message = JSON.stringify({
    details: {
      errors: [
        {
          name: 'unknown',
          path: ['fields', 'gonefield']
        }
      ]
    }
  })
  updateStub.mockImplementationOnce(() => Promise.reject(errorUnkownField))
  updateStub.mockImplementationOnce(() =>
    Promise.resolve({
      sys: { type: 'Entry', id: '123' },
      fields: {}
    })
  )

  const entries = [
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: {
        sys: { id: '123' },
        fields: { gonefield: '', existingfield: '' }
      }
    }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
  ])

  return createEntries({
    context: { target: {}, skipContentModel: true },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  }).then(() => {
    expect(updateStub.mock.calls).toHaveLength(2)
    expect('existingfield' in entries[0].transformed.fields).toBeTruthy()
    expect('gonefield' in entries[0].transformed.fields).toBeFalsy()
    expect(logEmitter.emit.mock.calls).toHaveLength(1)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})

test('Create entries and handle regular errors', () => {
  const updateStub = vi.fn()
  const creationError = new Error('Some creation error')
  updateStub.mockImplementationOnce(() => Promise.reject(creationError))

  const entries = [
    {
      original: { sys: { contentType: { sys: { id: 'ctid' } } } },
      transformed: {
        sys: { id: '123' },
        fields: { gonefield: '', existingfield: '' }
      }
    }
  ]
  const destinationEntries = new Map([
    ['123', { sys: { id: '123', version: 6 }, update: updateStub }]
  ])

  return createEntries({
    context: { target: {} },
    entities: entries,
    destinationEntitiesById: destinationEntries,
    skipUpdates: false,
    requestQueue
  }).then(result => {
    expect(updateStub.mock.calls).toHaveLength(1)
    expect(logEmitter.emit.mock.calls).toHaveLength(1)
    const warningCount = logEmitter.emit.mock.calls.filter(
      args => args[0] === 'warning'
    ).length
    const errorCount = logEmitter.emit.mock.calls.filter(
      args => args[0] === 'error'
    ).length
    expect(warningCount).toBe(0)
    expect(errorCount).toBe(1)
    expect(logEmitter.emit.mock.calls[0][0]).toBe('error')
    expect(logEmitter.emit.mock.calls[0][1]).toBe(creationError)
    expect(result).toHaveLength(0)
  })
})

test('Create private tags', () => {
  const target = {
    createTag: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Tag' } }))
  }
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
    context: { target, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  }).then(() => {
    expect(target.createTag.mock.calls).toHaveLength(1)
    expect(target.createTag).toHaveBeenCalledWith(
      'testTag',
      'Test Tag',
      'private'
    )
  })
})

test('Create default private tags', () => {
  const target = {
    createTag: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Tag' } }))
  }
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
    context: { target, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  }).then(() => {
    expect(target.createTag.mock.calls).toHaveLength(1)
    expect(target.createTag).toHaveBeenCalledWith(
      'testTag',
      'Test Tag',
      'private'
    )
  })
})

test('Create public tags', () => {
  const target = {
    createTag: vi
      .fn()
      .mockReturnValue(Promise.resolve({ sys: { type: 'Tag' } }))
  }
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
    context: { target, type: 'Tag' },
    entities: tags,
    destinationEntitiesById: new Map(),
    requestQueue
  }).then(() => {
    expect(target.createTag.mock.calls).toHaveLength(1)
    expect(target.createTag).toHaveBeenCalledWith(
      'testTag',
      'Test Tag',
      'public'
    )
  })
})

test('Fails to create locale if it already exists', () => {
  const target = {
    createLocale: vi.fn(() => Promise.reject(errorValidationFailed))
  }
  const errorValidationFailed = new ContentfulValidationError()
  errorValidationFailed.error = {
    sys: { id: 'ValidationFailed' },
    details: {
      errors: [{ name: 'taken' }]
    }
  }
  const entity = {
    original: { sys: {} },
    transformed: { sys: {} }
  } as EntityTransformed<LocaleProps, any>

  return createLocales({
    context: { target, type: 'Locale' },
    entities: [entity],
    destinationEntitiesById: new Map(),
    requestQueue
  }).then(entities => {
    expect(entities[0]).toBe(entity)
    const logLevels = logEmitter.emit.mock.calls.map(args => args[0])
    expect(logLevels.indexOf('error') !== -1).toBeFalsy()
  })
})
