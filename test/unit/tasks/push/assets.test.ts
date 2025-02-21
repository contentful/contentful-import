import PQueue from 'p-queue'
import fs from 'fs'
import { Stream } from 'stream'
import {
  processAssets,
  getAssetStreamForURL
} from '../../../../lib/tasks/push-to-space/assets'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { MockedFs } from '../../../types'
import { Mock } from 'vitest'

vi.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: vi.fn()
  }
}))

vi.mock('fs')

const assetPaths = [
  'assets/images/contentful-en.jpg',
  'assets/images/contentful-de.jpg'
]

let requestQueue

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  });
  (logEmitter.emit as Mock).mockClear();
  (fs as unknown as MockedFs).__setMockFiles(assetPaths)
})

test('Process assets', async () => {
  const processStub = vi
    .fn()
    .mockReturnValue(Promise.resolve({ sys: { type: 'Asset' } }))

  const assets = await processAssets({
    assets: [
      {
        sys: { id: '123' },
        fields: { file: { 'en-US': 'file object', 'en-GB': {} } },
        processForLocale: processStub
      },
      {
        sys: { id: '456' },
        fields: { file: { 'en-US': 'file object', 'en-GB': {} } },
        processForLocale: processStub
      }
    ],
    locales: ['en-US', 'en-GB'],
    requestQueue
  })

  // We expect two assets to be returned
  expect(assets).toHaveLength(2)
  // We expect 4 calls, one for each locale
  expect(processStub.mock.calls).toHaveLength(4)
  expect(processStub.mock.calls[0][0]).toBe('en-US')
  expect(processStub.mock.calls[1][0]).toBe('en-GB')
  expect(processStub.mock.calls[2][0]).toBe('en-US')
  expect(processStub.mock.calls[3][0]).toBe('en-GB')
  expect((logEmitter.emit as Mock).mock.calls).toHaveLength(2)
})

test('Return most up to date processed asset version', async () => {
  const processStub = vi
    .fn()
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
      sys: { id: '123' },
      fields: {
        file: {
          'en-US': {
            url: 'updated-url-which-show-this-process-was-succesful'
          },
          'en-GB': {
            url: 'updated-url-which-show-this-process-was-succesful'
          }
        }
      }
    }), 100))) // This call takes longer and therefore should be the
    // one to inform the final asset shape
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
      sys: { id: '123' },
      fields: {
        file: {
          'en-US': {
            url: 'updated-url-which-show-this-process-was-succesful'
          }
        }
      }
    }), 50)))

  const assets = await processAssets({
    assets: [
      {
        sys: { id: '123' },
        fields: { file: { 'en-US': 'file object', 'en-GB': {} } },
        processForLocale: processStub
      }
    ],
    locales: ['en-US', 'en-GB'],
    requestQueue
  })
  expect(assets).toHaveLength(1)
  expect(processStub.mock.calls).toHaveLength(2)
  // We expect a url property to be present for both locales, as the
  // last call that is resolved has this shape
  expect(assets[0].fields.file['en-US'].url).toBeTruthy()
  expect(assets[0].fields.file['en-GB'].url).toBeTruthy()
})

test('Process assets fails', async () => {
  const failedError = new Error('processing failed')

  const processStub = vi
    .fn()
    .mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset' } }))
    .mockImplementationOnce(() => Promise.resolve({ sys: { type: 'Asset' } }))
    .mockImplementationOnce(() => Promise.reject(failedError))

  await processAssets({
    assets: [
      {
        sys: { id: '123' },
        fields: { file: { 'en-US': 'file object', 'en-GB': {} } },
        processForLocale: processStub
      },
      {
        sys: { id: '456' },
        fields: { file: { 'en-US': 'file object', 'en-GB': {} } },
        processForLocale: processStub
      }
    ],
    locales: ['en-US', 'en-GB'],
    requestQueue
  })
  // We expect two calls for the first asset (one for each locale)
  // and two for the second asset of which one fails
  expect(processStub.mock.calls).toHaveLength(4)
  expect((logEmitter.emit as Mock).mock.calls).toHaveLength(3)
  expect((logEmitter.emit as Mock).mock.calls[0][0]).toBe('info')
  expect((logEmitter.emit as Mock).mock.calls[0][1]).toBe('Processing Asset 123')
  expect((logEmitter.emit as Mock).mock.calls[1][0]).toBe('info')
  expect((logEmitter.emit as Mock).mock.calls[1][1]).toBe('Processing Asset 456')
  expect((logEmitter.emit as Mock).mock.calls[2][0]).toBe('error')
  expect((logEmitter.emit as Mock).mock.calls[2][1]).toBe(failedError)
})

test('Get asset stream for url: Throw error if filePath does not exist', async () => {
  const fileUrl = 'https://images/nonexistentfile.jpg'
  await expect(getAssetStreamForURL(fileUrl, 'assets')).rejects.toThrow(
    'Cannot open asset from filesystem'
  )
})

test('Get asset stream for url: Create stream if filepath exists', async () => {
  const createReadStreamSpy = vi.spyOn(fs, 'createReadStream')
  const fileUrl = 'https://images/contentful-en.jpg'
  const stream = await getAssetStreamForURL(fileUrl, 'assets')

  expect(createReadStreamSpy).toHaveBeenCalledTimes(1)
  expect(stream instanceof Stream).toBe(true)
})
