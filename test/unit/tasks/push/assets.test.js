import PQueue from 'p-queue'
import fs from 'fs'
import { Stream } from 'stream'
import { processAssets, getAssetStreamForURL } from '../../../../lib/tasks/push-to-space/assets'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

jest.mock('fs')

const assetPaths = ['assets/images/contentful-en.jpg', 'assets/images/contentful-de.jpg']

let requestQueue

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
  logEmitter.emit.mockClear()
  fs.__setMockFiles(assetPaths)
})

test('Process assets', () => {
  const processStub = jest.fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))

  return processAssets({
    assets: [
      { sys: { id: '123' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub },
      { sys: { id: '456' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub }
    ],
    requestQueue
  })
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

  return processAssets({
    assets: [
      { sys: { id: '123' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub },
      { sys: { id: '456' }, fields: { file: { 'en-US': 'file object', 'en-GB': {} } }, processForAllLocales: processStub }
    ],
    requestQueue
  })
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

test('Get asset stream for url: Throw error if filePath does not exist', async () => {
  const fileUrl = 'https://images/nonexistentfile.jpg'
  await expect(getAssetStreamForURL(fileUrl, 'assets')).rejects.toThrow('Cannot open asset from filesystem')
})

test('Get asset stream for url: Create stream if filepath exists', async () => {
  const createReadStreamSpy = jest.spyOn(fs, 'createReadStream')
  const fileUrl = 'https://images/contentful-en.jpg'
  const stream = await getAssetStreamForURL(fileUrl, 'assets')

  expect(createReadStreamSpy).toHaveBeenCalledTimes(1)
  expect(stream instanceof Stream).toBe(true)
})
