import PQueue from 'p-queue'
import fs from 'fs'
import { Stream } from 'stream'
import {
  processAssets,
  getAssetStreamForURL
} from '../../../../lib/tasks/push-to-space/assets'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { MockedFs } from '../../../types'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: {
    emit: jest.fn()
  }
}))

const mockEmit = jest.mocked(logEmitter.emit)

jest.mock('fs')

const assetPaths = [
  'assets/images/contentful-en.jpg',
  'assets/images/contentful-de.jpg'
]

const spaceId = 'test-space'
const environmentId = 'master'

let requestQueue

const processedFile = { url: '//images.example.com/file.jpg' }

function processedAsset(id: string, locales: string[]) {
  return {
    sys: { id, type: 'Asset' },
    fields: { file: Object.fromEntries(locales.map((locale) => [locale, processedFile])) }
  }
}

function makeClient({ put = jest.fn().mockResolvedValue(undefined), get }: { put?: jest.Mock, get: jest.Mock }) {
  return makePlainClientMock({ raw: { put }, asset: { get } })
}

function sourceAsset(id: string) {
  return {
    sys: { id, version: 1 },
    fields: { file: { 'en-US': { upload: 'file object' }, 'en-GB': { upload: 'file object' } } },
  }
}

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
  mockEmit.mockClear();
  (fs as unknown as MockedFs).__setMockFiles(assetPaths)
})

test('Process assets', async () => {
  const put = jest.fn().mockResolvedValue(undefined)
  const get = jest.fn().mockImplementation(({ assetId }) => Promise.resolve(processedAsset(assetId, ['en-US', 'en-GB'])))
  const client = makeClient({ put, get })

  const assets = await processAssets({
    assets: [sourceAsset('123'), sourceAsset('456')],
    client,
    spaceId,
    environmentId,
    requestQueue
  })

  expect(assets).toHaveLength(2)
  // One process call per asset and locale
  expect(put.mock.calls.map(([url]) => url)).toEqual([
    `/spaces/${spaceId}/environments/${environmentId}/assets/123/files/en-US/process`,
    `/spaces/${spaceId}/environments/${environmentId}/assets/123/files/en-GB/process`,
    `/spaces/${spaceId}/environments/${environmentId}/assets/456/files/en-US/process`,
    `/spaces/${spaceId}/environments/${environmentId}/assets/456/files/en-GB/process`
  ])
  expect(put.mock.calls[0][2]).toEqual({ headers: { 'X-Contentful-Version': 1 } })
  expect(get).toHaveBeenCalledTimes(4)
  expect(mockEmit.mock.calls).toHaveLength(2)
})

test('Poll until the processed url is present', async () => {
  const get = jest
    .fn()
    .mockResolvedValueOnce({ sys: { id: '123' }, fields: { file: { 'en-US': { upload: 'file object' } } } })
    .mockResolvedValueOnce(processedAsset('123', ['en-US']))
  const client = makeClient({ get })

  const assets = await processAssets({
    assets: [{ sys: { id: '123', version: 1 }, fields: { file: { 'en-US': { upload: 'file object' } } } }],
    client,
    spaceId,
    environmentId,
    timeout: 10,
    requestQueue
  })

  expect(get).toHaveBeenCalledTimes(2)
  expect(assets[0].fields.file['en-US'].url).toBeTruthy()
})

test('Waiting for processing does not hold a queue slot', async () => {
  let pendingDuringWait
  const get = jest
    .fn()
    .mockImplementationOnce(() => {
      setTimeout(() => { pendingDuringWait = requestQueue.pending }, 25)
      return Promise.resolve({ sys: { id: '123' }, fields: { file: { 'en-US': {} } } })
    })
    .mockResolvedValueOnce(processedAsset('123', ['en-US']))
  const client = makeClient({ get })

  await processAssets({
    assets: [{ sys: { id: '123', version: 1 }, fields: { file: { 'en-US': {} } } }],
    client,
    spaceId,
    environmentId,
    timeout: 100,
    requestQueue
  })

  expect(pendingDuringWait).toBe(0)
})

test('Return most up to date processed asset version', async () => {
  const get = jest
    .fn()
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(processedAsset('123', ['en-US', 'en-GB'])), 100))) // This call takes longer and therefore should be the
    // one to inform the final asset shape
    .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(processedAsset('123', ['en-GB'])), 50)))
  const client = makeClient({ get })

  const assets = await processAssets({
    assets: [sourceAsset('123')],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
  expect(assets).toHaveLength(1)
  expect(get).toHaveBeenCalledTimes(2)
  // We expect a url property to be present for both locales, as the
  // last call that is resolved has this shape
  expect(assets[0].fields.file['en-US'].url).toBeTruthy()
  expect(assets[0].fields.file['en-GB'].url).toBeTruthy()
})

test('Process assets fails', async () => {
  const failedError = new Error('processing failed')

  const put = jest
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(failedError)
    .mockResolvedValueOnce(undefined)
  const get = jest.fn().mockImplementation(({ assetId }) => Promise.resolve(processedAsset(assetId, ['en-US', 'en-GB'])))
  const client = makeClient({ put, get })

  const assets = await processAssets({
    assets: [sourceAsset('123'), sourceAsset('456')],
    client,
    spaceId,
    environmentId,
    requestQueue
  })
  // We expect two calls for the first asset (one for each locale)
  // and two for the second asset of which one fails
  expect(put.mock.calls).toHaveLength(4)
  expect(assets).toHaveLength(1)
  expect(mockEmit.mock.calls).toHaveLength(4)
  expect(mockEmit.mock.calls[0][0]).toBe('info')
  expect(mockEmit.mock.calls[0][1]).toBe('Processing Asset 123')
  expect(mockEmit.mock.calls[1][0]).toBe('info')
  expect(mockEmit.mock.calls[1][1]).toBe('Processing Asset 456')
  expect(mockEmit.mock.calls[2][0]).toBe('error')
  expect(mockEmit.mock.calls[2][1]).toBe(failedError)
  expect(mockEmit.mock.calls[3][0]).toBe('warning')
  expect(mockEmit.mock.calls[3][1]).toContain('456')
  expect(mockEmit.mock.calls[3][1]).toContain('skipped')
})

test('Skip the asset when processing times out', async () => {
  const get = jest.fn().mockResolvedValue({ sys: { id: '123' }, fields: { file: { 'en-US': {} } } })
  const client = makeClient({ get })

  const assets = await processAssets({
    assets: [{ sys: { id: '123', version: 1 }, fields: { file: { 'en-US': {} } } }],
    client,
    spaceId,
    environmentId,
    timeout: 1,
    retryLimit: 2,
    requestQueue
  })

  expect(assets).toHaveLength(0)
  // First check plus two retries
  expect(get).toHaveBeenCalledTimes(3)
  expect(mockEmit.mock.calls[1][0]).toBe('error')
  expect(mockEmit.mock.calls[1][1].name).toBe('AssetProcessingTimeout')
  expect(mockEmit.mock.calls[2][0]).toBe('warning')
})

test('Get asset stream for url: Throw error if filePath does not exist', async () => {
  const fileUrl = 'https://images/nonexistentfile.jpg'
  await expect(getAssetStreamForURL(fileUrl, 'assets')).rejects.toThrow(
    'Cannot open asset from filesystem'
  )
})

test('Get asset stream for url: Create stream if filepath exists', async () => {
  const createReadStreamSpy = jest.spyOn(fs, 'createReadStream')
  const fileUrl = 'https://images/contentful-en.jpg'
  const stream = await getAssetStreamForURL(fileUrl, 'assets')

  expect(createReadStreamSpy).toHaveBeenCalledTimes(1)
  expect(stream instanceof Stream).toBe(true)
})
