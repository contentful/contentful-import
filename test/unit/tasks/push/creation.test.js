import {createEntities, createLocales, createEntries} from '../../../../lib/tasks/push-to-space/creation'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

afterEach(() => {
  logEmitter.emit.mockClear()
})

test('Create entities', () => {
  const updateStub = jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Asset'}}))
  const target = {
    createAssetWithId: jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Asset'}}))
  }
  return createEntities({target, type: 'Asset'}, [
    { original: { sys: {} }, transformed: { sys: {id: '123'} } },
    { original: { sys: {} }, transformed: { sys: {id: '456'} } }
  ], [
    {sys: {id: '123', version: 6}, update: updateStub}
  ])
    .then((response) => {
      expect(target.createAssetWithId.mock.calls).toHaveLength(1)
      expect(updateStub.mock.calls).toHaveLength(1)
      expect(logEmitter.emit.mock.calls).toHaveLength(2)
      const logLevels = logEmitter.emit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entities handle regular errors', () => {
  const updateStub = jest.fn()
  const target = {
    createEntryWithId: jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Entry'}}))
  }
  const creationError = new Error('could not create entity')
  updateStub.mockImplementationOnce(() => Promise.reject(creationError))

  const entries = [{
    original: { sys: {contentType: {sys: {id: 'ctid'}}} },
    transformed: { sys: {id: '123'}, fields: {gonefield: '', existingfield: ''} }
  }]
  const destinationEntries = [
    {sys: {id: '123', version: 6}, update: updateStub}
  ]

  return createEntities({target, type: 'Asset'}, entries, destinationEntries)
    .then((result) => {
      expect(updateStub.mock.calls).toHaveLength(1)
      expect(logEmitter.emit.mock.calls).toHaveLength(1)
      const warningCount = logEmitter.emit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = logEmitter.emit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      expect(logEmitter.emit.mock.calls[0][0]).toBe('error')
      expect(logEmitter.emit.mock.calls[0][1]).toBe(creationError)
      expect(result).toHaveLength(1)
      expect(result[0]).toBeNull()
    })
})

test('Create entries', () => {
  const updateStub = jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Entry'}}))
  const target = {
    createEntryWithId: jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Entry'}})),
    createEntry: jest.fn().mockReturnValue(Promise.resolve({sys: {type: 'Entry'}}))
  }
  const entries = [
    { original: { sys: {contentType: {sys: {id: 'ctid'}}} }, transformed: { sys: {id: '123'} } },
    { original: { sys: {contentType: {sys: {id: 'ctid'}}} }, transformed: { sys: {id: '456'} } },
    { original: { sys: {contentType: {sys: {id: 'ctid'}}} }, transformed: { sys: {} } }
  ]
  const destinationEntries = [
    {sys: {id: '123', version: 6}, update: updateStub}
  ]
  return createEntries({target, skipContentModel: false}, entries, destinationEntries)
    .then((response) => {
      expect(target.createEntryWithId.mock.calls).toHaveLength(1)
      expect(target.createEntry.mock.calls).toHaveLength(1)
      expect(updateStub.mock.calls).toHaveLength(1)
      expect(logEmitter.emit.mock.calls).toHaveLength(3)
      const logLevels = logEmitter.emit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entries and remove unknown fields', () => {
  const updateStub = jest.fn()
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
  updateStub.mockImplementationOnce(() => Promise.reject(errorUnkownField))
  updateStub.mockImplementationOnce(() => Promise.resolve({
    sys: {type: 'Entry', id: '123'},
    fields: {}
  }))

  const entries = [{
    original: { sys: {contentType: {sys: {id: 'ctid'}}} },
    transformed: { sys: {id: '123'}, fields: {gonefield: '', existingfield: ''} }
  }]
  const destinationEntries = [
    {sys: {id: '123', version: 6}, update: updateStub}
  ]

  return createEntries({target: {}, skipContentModel: true}, entries, destinationEntries)
    .then((response) => {
      expect(updateStub.mock.calls).toHaveLength(2)
      expect('existingfield' in entries[0].transformed.fields).toBeTruthy()
      expect('gonefield' in entries[0].transformed.fields).toBeFalsy()
      expect(logEmitter.emit.mock.calls).toHaveLength(1)
      const logLevels = logEmitter.emit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})

test('Create entries and handle regular errors', () => {
  const updateStub = jest.fn()
  const creationError = new Error('Some creation error')
  updateStub.mockImplementationOnce(() => Promise.reject(creationError))

  const entries = [{
    original: { sys: {contentType: {sys: {id: 'ctid'}}} },
    transformed: { sys: {id: '123'}, fields: {gonefield: '', existingfield: ''} }
  }]
  const destinationEntries = [
    {sys: {id: '123', version: 6}, update: updateStub}
  ]

  return createEntries({target: {}}, entries, destinationEntries)
    .then((result) => {
      expect(updateStub.mock.calls).toHaveLength(1)
      expect(logEmitter.emit.mock.calls).toHaveLength(1)
      const warningCount = logEmitter.emit.mock.calls.filter((args) => args[0] === 'warning').length
      const errorCount = logEmitter.emit.mock.calls.filter((args) => args[0] === 'error').length
      expect(warningCount).toBe(0)
      expect(errorCount).toBe(1)
      expect(logEmitter.emit.mock.calls[0][0]).toBe('error')
      expect(logEmitter.emit.mock.calls[0][1]).toBe(creationError)
      expect(result).toHaveLength(1)
      expect(result[0]).toBeNull()
    })
})

test('Fails to create locale if it already exists', () => {
  const target = {
    createLocale: jest.fn(() => Promise.reject(errorValidationFailed))
  }
  const errorValidationFailed = new Error()
  errorValidationFailed.error = {
    sys: {id: 'ValidationFailed'},
    details: {
      errors: [{name: 'taken'}]
    }
  }
  const entity = { original: { sys: {} }, transformed: { sys: {} } }

  return createLocales({target, type: 'Locale'}, [entity], [{sys: {}}])
    .then((entities) => {
      expect(entities[0]).toBe(entity)
      const logLevels = logEmitter.emit.mock.calls.map((args) => args[0])
      expect(logLevels.indexOf('error') !== -1).toBeFalsy()
    })
})
