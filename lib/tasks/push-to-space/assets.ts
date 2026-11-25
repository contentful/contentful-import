import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulAssetError, ContentfulEntityError } from '../../utils/errors'
import { PlainClientAPI } from 'contentful-management'

const stat = promisify(fs.stat)

export async function getAssetStreamForURL(url, assetsDirectory) {
  const [, assetPath] = url.split('//')
  const filePath = join(assetsDirectory, assetPath)
  try {
    await stat(filePath)
    return fs.createReadStream(filePath)
  } catch (err) {
    const error = new ContentfulAssetError(
      'Cannot open asset from filesystem',
      filePath
    )
    throw error
  }
}

const ASSET_PROCESSING_CHECK_WAIT = 3000
const ASSET_PROCESSING_CHECK_RETRIES = 10

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Mirrors the SDK's processForLocale, but only the HTTP calls go through the
// queue so an asset waiting on processing doesn't hold a rate-limit slot.
async function processAndWaitForUrl(client: PlainClientAPI, spaceId: string, environmentId: string, locale: string, asset, processingOptions, requestQueue) {
  const {
    processingCheckWait = ASSET_PROCESSING_CHECK_WAIT,
    processingCheckRetries = ASSET_PROCESSING_CHECK_RETRIES
  } = processingOptions
  const assetId = asset.sys.id

  await requestQueue.add(() => client.raw.put(
    `/spaces/${spaceId}/environments/${environmentId}/assets/${assetId}/files/${locale}/process`,
    null,
    { headers: { 'X-Contentful-Version': asset.sys.version } }
  ))

  for (let checkCount = 0; ; checkCount++) {
    const latest = await requestQueue.add(() => client.asset.get({ spaceId, environmentId, assetId }))
    if (latest.fields.file?.[locale]?.url) {
      return latest
    }
    if (checkCount >= processingCheckRetries) {
      const error = new Error('Asset is taking longer then expected to process.')
      error.name = 'AssetProcessingTimeout'
      throw error
    }
    await wait(processingCheckWait)
  }
}

async function processAssetForLocale(client: PlainClientAPI, spaceId: string, environmentId: string, locale: string, asset, processingOptions, requestQueue) {
  try {
    return await processAndWaitForUrl(client, spaceId, environmentId, locale, asset, processingOptions, requestQueue)
  } catch (err: any) {
    if (err instanceof ContentfulEntityError) {
      err.entity = asset
    }
    logEmitter.emit('error', err)
    throw err
  }
}

// From
// https://stackoverflow.com/questions/67339630/how-to-get-last-resolved-promise-from-a-list-of-resolved-promises-in-javascript
async function lastResult(promises: Promise<any>[]) {
  if (!promises.length) throw new RangeError('No last result from no promises')
  const results: any[] = []
  await Promise.all(
    promises.map((p) =>
      p.then((v) => {
        results.push(v)
      })
    )
  )
  return results[results.length - 1]
}

type ProcessAssetsParams = {
  assets: any[];
  client: PlainClientAPI;
  spaceId: string;
  environmentId: string;
  timeout?: number;
  retryLimit?: number;
  requestQueue: any;
};

export async function processAssets({
  assets,
  client,
  spaceId,
  environmentId,
  timeout,
  retryLimit,
  requestQueue
}: ProcessAssetsParams) {
  const processingOptions = Object.assign(
    {},
    timeout && { processingCheckWait: timeout },
    retryLimit && { processingCheckRetries: retryLimit }
  )

  const pendingProcessingAssets = assets.map(async (asset) => {
    logEmitter.emit('info', `Processing Asset ${getEntityName(asset)}`)

    // We want to do what processForAllLocale does, but as the rate
    // limit is only enforced if every request goes through the
    // requestQueue, we need to duplicate the logic here
    const locales = Object.keys(asset.fields.file || {})

    let latestAssetVersion = asset

    try {
      // The last resolved promise will return the most up to date asset
      // version which we need for next import steps (e.g. publishing)
      latestAssetVersion = await lastResult(
        locales.map((locale) =>
          processAssetForLocale(client, spaceId, environmentId, locale, asset, processingOptions, requestQueue)
        )
      )
    } catch (err) {
      logEmitter.emit('warning', `Asset ${getEntityName(asset)} processing failed and will be skipped`)
      return null
    }
    return latestAssetVersion
  })

  const potentiallyProcessedAssets = await Promise.all(pendingProcessingAssets)

  // This filters out all process attempts which failed
  return potentiallyProcessedAssets.filter((asset) => asset)
}
