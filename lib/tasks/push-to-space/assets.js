import Promise from 'bluebird'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

export function processAssets (assets, { timeout, retryLimit } = {}) {
  return Promise.map(assets, (asset) => {
    logEmitter.emit('info', `Processing Asset ${getEntityName(asset)}`)
    const processingOptions = Object.assign(
      {},
      timeout && { processingCheckWait: timeout },
      retryLimit && { processingCheckRetry: retryLimit }
    )
    return asset.processForAllLocales(processingOptions).catch((err) => {
      err.entity = asset
      logEmitter.emit('error', err)
      return null
    })
  }, { concurrency: 4 })
}
