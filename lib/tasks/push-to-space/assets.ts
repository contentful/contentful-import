import fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulAssetError, ContentfulEntityError } from '../../utils/errors'

const stat = promisify(fs.stat)

export async function getAssetStreamForURL (url, assetsDirectory) {
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

async function processAssetForLocale (locale, asset, processingOptions) {
  try {
    return await asset.processForLocale(locale, processingOptions)
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
async function lastResult (promises) {
  if (!promises.length) throw new RangeError('No last result from no promises')
  const results = []
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
  timeout?: number;
  retryLimit?: number;
  requestQueue: any;
  locales?: string[];
};

export async function processAssets ({
  assets,
  timeout,
  retryLimit,
  requestQueue
}: ProcessAssetsParams) {
  const processingOptions = Object.assign(
    {},
    timeout && { processingCheckWait: timeout },
    retryLimit && { processingCheckRetry: retryLimit }
  )

  const pendingProcessingAssets = assets.map(async (asset) => {
    logEmitter.emit('info', `Processing Asset ${getEntityName(asset)}`)

    // We want to do what processForAllLocale does, but as the rate
    // limit is only enforced if we have a dedicated requestQueue item
    // for every processForLocale call, we need to duplicate the logic
    // here
    const locales = Object.keys(asset.fields.file || {})

    let latestAssetVersion = asset

    try {
      // The last resolved promise will return the most up to date asset
      // version which we need for next import steps (e.g. publishing)
      latestAssetVersion = await lastResult(
        locales.map((locale) => {
          return requestQueue.add(() =>
            processAssetForLocale(locale, asset, processingOptions)
          )
        })
      )
    } catch (err) {
      // Handle any error that arises during the processing of any locale
      return null
    }
    return latestAssetVersion
  })

  const potentiallyProcessedAssets = await Promise.all(pendingProcessingAssets)

  // This filters out all process attempts which failed
  return potentiallyProcessedAssets.filter((asset) => asset)
}
