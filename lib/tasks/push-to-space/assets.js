import Promise from 'bluebird'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

export function processAssets (assets, options) {
  return Promise.map(assets, (asset) => {
    logEmitter.emit('info', `Processing Asset ${getEntityName(asset)}`)
    return asset.processForAllLocales(options).catch((err) => {
      err.entity = asset
      logEmitter.emit('error', err)
      return Promise.resolve(null)
    })
  }, {concurrency: 4})
}
