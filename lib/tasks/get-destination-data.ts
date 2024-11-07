import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { AssetProps, ContentTypeProps, EntryProps, LocaleProps, TagProps, WebhookProps } from 'contentful-management'
import { OriginalSourceData } from '../types'
import PQueue from 'p-queue'

const BATCH_CHAR_LIMIT = 1990
const BATCH_SIZE_LIMIT = 100

const METHODS = {
  contentTypes: { name: 'content types', method: 'getContentTypes' },
  locales: { name: 'locales', method: 'getLocales' },
  entries: { name: 'entries', method: 'getEntries' },
  assets: { name: 'assets', method: 'getAssets' },
  tags: { name: 'tags', method: 'getTags' }
}

type BatchedIdQueryParams = {
  requestQueue: PQueue
  environment: any
  type: keyof typeof METHODS
  ids: string[]
}

type BatchedPageQueryParams = Omit<BatchedIdQueryParams, 'ids'>

async function batchedIdQuery ({ environment, type, ids, requestQueue }: BatchedIdQueryParams) {
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

async function batchedPageQuery ({ environment, type, requestQueue }: BatchedPageQueryParams) {
  const method = METHODS[type].method
  const entityTypeName = METHODS[type].name

  let totalFetched = 0
  const { items, total } = await requestQueue.add(async () => {
    const response = await environment[method]({
      skip: 0,
      limit: BATCH_SIZE_LIMIT
    })
    totalFetched += response.items.length
    logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${entityTypeName}`)

    return { items: response.items, total: response.total }
  })

  const batches = getPagedBatches(totalFetched, total)

  const remainingTotalResponses = batches.map(({ skip }) => {
    return requestQueue.add(async () => {
      const response = await environment[method]({
        skip,
        limit: BATCH_SIZE_LIMIT
      })
      totalFetched = totalFetched + response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${entityTypeName}`)

      return response.items
    })
  })
  const remainingResponses = await Promise.all(remainingTotalResponses)

  return items.concat(remainingResponses.flat())
}

function getIdBatches (ids) {
  const batches: string[] = []
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

function getPagedBatches(totalFetched: number, total: number) {
  const batches: { skip: number }[] = []
  if (totalFetched >= total) {
    return batches
  }

  let skip = totalFetched
  while (skip < total) {
    batches.push({ skip })
    skip += BATCH_SIZE_LIMIT
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

type GetDestinationDataParams = {
  client: any
  spaceId: string
  environmentId: string
  sourceData: OriginalSourceData
  contentModelOnly?: boolean
  skipLocales?: boolean
  skipContentModel?: boolean
  requestQueue: PQueue
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
}: GetDestinationDataParams) {
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
    const contentTypeIds = sourceData.contentTypes?.map((e) => e.sys.id)
    if (contentTypeIds) {
      result.contentTypes = batchedIdQuery({
        environment,
        type: 'contentTypes',
        ids: contentTypeIds,
        requestQueue
      })
    }

    if (!skipLocales) {
      const localeIds = sourceData.locales?.map((e) => e.sys.id)
      if (localeIds && localeIds.length) {
        result.locales = batchedPageQuery({
          environment,
          type: 'locales',
          requestQueue
        })
      }
    }
  }

  // include tags even if contentModelOnly = true
  try {
    result.tags = await batchedPageQuery({ environment, type: 'tags', requestQueue })
  } catch (_) {
    // users without access to Tags will get 404
    // if they dont have access, remove tags array so they're not handled in future steps
    delete result.tags
  }

  if (contentModelOnly) {
    return Promise.props(result)
  }

  const entryIds = sourceData.entries?.map((e) => e.sys.id)
  const assetIds = sourceData.assets?.map((e) => e.sys.id)
  if (entryIds) {
    result.entries = batchedIdQuery({
      environment,
      type: 'entries',
      ids: entryIds,
      requestQueue
    })
  }
  if (assetIds) {
    result.assets = batchedIdQuery({
      environment,
      type: 'assets',
      ids: assetIds,
      requestQueue
    })
  }

  result.webhooks = []

  return Promise.props(result)
}
