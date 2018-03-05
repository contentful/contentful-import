import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

const BATCH_CHAR_LIMIT = 1990
const BATCH_SIZE_LIMIT = 100

const METHODS = {
  contentTypes: { name: 'content types', method: 'getContentTypes' },
  locales: { name: 'locales', method: 'getLocales' },
  entries: { name: 'entries', method: 'getEntries' },
  assets: { name: 'assets', method: 'getAssets' }
}

function batchedIdQuery (environment, type, ids) {
  const method = METHODS[type].method
  const entityTypeName = METHODS[type].name
  return Promise.reduce(getIdBatches(ids), (fullResponse, batch) => {
    return environment[method]({
      'sys.id[in]': batch,
      limit: batch.split(',').length
    })
      .then((response) => {
        fullResponse = [
          ...fullResponse,
          ...response.items
        ]
        logEmitter.emit('info', `Fetched ${fullResponse.length} of ${response.total} ${entityTypeName}`)
        return fullResponse
      })
  }, [])
}

function getIdBatches (ids) {
  const batches = []
  let currentBatch = ''
  let currentSize = 0
  while (ids.length > 0) {
    let id = ids.splice(0, 1)
    currentBatch += id
    currentSize = currentSize + 1
    if (currentSize === BATCH_SIZE_LIMIT || currentBatch.length > BATCH_CHAR_LIMIT || ids.length === 0) {
      batches.push(currentBatch)
      currentBatch = ''
      currentSize = 0
    } else {
      currentBatch += ','
    }
  }
  return batches
}

/**
 * Gets content from a space which will have content copied to it, based on a
 * collection of existing content.
 *
 * Only the supplied entry/asset IDs will be retrieved. All contentTypes
 * and Locales will be retrieved.
 */

export default function getDestinationData ({
  client,
  spaceId,
  environmentId,
  sourceData,
  contentModelOnly,
  skipLocales,
  skipContentModel
}) {
  return client.getSpace(spaceId)
    .then((space) => space.getEnvironment(environmentId))
    .then((environment) => {
      const result = {
        contentTypes: [],
        locales: [],
        entries: [],
        assets: []
      }

      // Make sure all required properties are available and at least an empty array
      sourceData = {
        ...result,
        ...sourceData
      }

      if (!skipContentModel) {
        const contentTypeIds = sourceData.contentTypes.map((e) => e.sys.id)
        result.contentTypes = batchedIdQuery(environment, 'contentTypes', contentTypeIds)

        if (!skipLocales) {
          const localeIds = sourceData.locales.map((e) => e.sys.id)
          result.locales = batchedIdQuery(environment, 'locales', localeIds)
        }
      }

      if (contentModelOnly) {
        return Promise.props(result)
      }

      const entryIds = sourceData.entries.map((e) => e.sys.id)
      const assetIds = sourceData.assets.map((e) => e.sys.id)
      result.entries = batchedIdQuery(environment, 'entries', entryIds)
      result.assets = batchedIdQuery(environment, 'assets', assetIds)
      result.webhooks = []

      return Promise.props(result)
    })
}
