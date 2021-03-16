import { processAssets } from '../../../../lib/tasks/push-to-space/assets'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

beforeEach(() => {
  logEmitter.emit.mockClear()
})

test('Process assets', () => {
  const processStub = jest.fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))

  return processAssets([
    { sys: { id: '123' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub },
    { sys: { id: '456' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub }
  ])
    .then((response) => {
      expect(processStub.mock.calls).toHaveLength(2)
      expect(logEmitter.emit.mock.calls).toHaveLength(2)
    })
})

test('Process assets fails', () => {
  const failedError = new Error('processing failed')

  const processStub = jest.fn()
    .mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset' } }))
    .mockImplementationOnce(() => Promise.reject(failedError))

  return processAssets([
    { sys: { id: '123' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub },
    { sys: { id: '456' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub }
  ])
    .then((response) => {
      expect(processStub.mock.calls).toHaveLength(2)
      expect(logEmitter.emit.mock.calls).toHaveLength(3)
      expect(logEmitter.emit.mock.calls[0][0]).toBe('info')
      expect(logEmitter.emit.mock.calls[0][1]).toBe('Processing Asset 123')
      expect(logEmitter.emit.mock.calls[1][0]).toBe('info')
      expect(logEmitter.emit.mock.calls[1][1]).toBe('Processing Asset 456')
      expect(logEmitter.emit.mock.calls[2][0]).toBe('error')
      expect(logEmitter.emit.mock.calls[2][1]).toBe(failedError)
    })
})
