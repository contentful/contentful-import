import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { AssetProps, ContentTypeProps, EntryProps, LocaleProps, TagProps, WebhookProps } from 'contentful-management'

const BATCH_CHAR_LIMIT = 1990
const BATCH_SIZE_LIMIT = 100

const METHODS = {
  contentTypes: { name: 'content types', method: 'getContentTypes' },
  locales: { name: 'locales', method: 'getLocales' },
  entries: { name: 'entries', method: 'getEntries' },
  assets: { name: 'assets', method: 'getAssets' }
}

async function batchedIdQuery ({ environment, type, ids, requestQueue }) {
  const method = METHODS[type].method
  const entityTypeName = METHODS[type].name
  const batches = getIdBatches(ids)

  let totalFetched = 0

  const allPendingResponses = batches.map((idBatch) => {
    // TODO: add batch count to indicate that it's running
    return requestQueue.add(async () => {
      const response = await environment[method]({
        'sys.id[in]': idBatch,
        limit: idBatch.split(',').length
      })
      totalFetched = totalFetched + response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${entityTypeName}`)

      return response.items
    })
  })

  const responses = await Promise.all(allPendingResponses)

  return responses.flat()
}

function getIdBatches (ids) {
  const batches = []
  let currentBatch = ''
  let currentSize = 0
  while (ids.length > 0) {
    const id = ids.splice(0, 1)
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

type AllDestinationData = {
  contentTypes: Promise<ContentTypeProps[]>
  tags: Promise<TagProps[]>
  locales: Promise<LocaleProps[]>
  entries: Promise<EntryProps[]>
  assets: Promise<AssetProps[]>
  // TODO Why are webhooks optional?
  webhooks?: Promise<WebhookProps[]>
}

/**
 * Gets content from a space which will have content copied to it, based on a
 * collection of existing content.
 *
 * Only the supplied entry/asset/contentType/locale IDs will be retrieved.
 * All tags will be retrieved.
 *
 */

export default async function getDestinationData ({
  client,
  spaceId,
  environmentId,
  sourceData,
  contentModelOnly,
  skipLocales,
  skipContentModel,
  requestQueue
}) {
  const space = await client.getSpace(spaceId)
  const environment = await space.getEnvironment(environmentId)
  const result: AllDestinationData = {
    contentTypes: [],
    tags: [],
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
    result.contentTypes = batchedIdQuery({
      environment,
      type: 'contentTypes',
      ids: contentTypeIds,
      requestQueue
    })

    if (!skipLocales) {
      const localeIds = sourceData.locales.map((e) => e.sys.id)
      result.locales = batchedIdQuery({
        environment,
        type: 'locales',
        ids: localeIds,
        requestQueue
      })
    }
  }

  // include tags even if contentModelOnly = true
  result.tags = environment.getTags().then(response => response.items).catch((e) => {
    // users without access to Tags will get 404
    // if they dont have access, remove tags array so they're not handled in future steps
    delete result.tags
  })

  if (contentModelOnly) {
    return Promise.props(result)
  }

  const entryIds = sourceData.entries.map((e) => e.sys.id)
  const assetIds = sourceData.assets.map((e) => e.sys.id)
  result.entries = batchedIdQuery({
    environment,
    type: 'entries',
    ids: entryIds,
    requestQueue
  })
  result.assets = batchedIdQuery({
    environment,
    type: 'assets',
    ids: assetIds,
    requestQueue
  })
  result.webhooks = []

  return Promise.props(result)
}
