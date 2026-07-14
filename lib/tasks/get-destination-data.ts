import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { AssetProps, ContentTypeProps, EntryProps, LocaleProps, PlainClientAPI, TagProps, WebhookProps } from 'contentful-management'
import { OriginalSourceData } from '../types'
import PQueue from 'p-queue'

const BATCH_CHAR_LIMIT = 1990
const BATCH_SIZE_LIMIT = 100

type BatchedIdQueryParams = {
  requestQueue: PQueue
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  type: 'contentTypes' | 'entries' | 'assets'
  ids: string[]
}

type BatchedPageQueryParams = {
  requestQueue: PQueue
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  type: 'locales' | 'tags'
}

const ENTITY_METHODS = {
  contentTypes: { name: 'content types', ns: 'contentType' },
  entries: { name: 'entries', ns: 'entry' },
  assets: { name: 'assets', ns: 'asset' },
  locales: { name: 'locales', ns: 'locale' },
  tags: { name: 'tags', ns: 'tag' },
} as const

async function batchedIdQuery ({ client, spaceId, environmentId, type, ids, requestQueue }: BatchedIdQueryParams) {
  const { name, ns } = ENTITY_METHODS[type]
  const batches = getIdBatches(ids)

  let totalFetched = 0

  const allPendingResponses = batches.map((idBatch) => {
    return requestQueue.add(async () => {
      const response = await (client[ns] as any).getMany({
        spaceId,
        environmentId,
        query: {
          'sys.id[in]': idBatch,
          limit: idBatch.split(',').length
        }
      })
      totalFetched = totalFetched + response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${name}`)

      return response.items
    })
  })

  const responses = await Promise.all(allPendingResponses)

  return responses.flat()
}

async function batchedPageQuery ({ client, spaceId, environmentId, type, requestQueue }: BatchedPageQueryParams) {
  const { name, ns } = ENTITY_METHODS[type]

  let totalFetched = 0
  const { items, total } = await requestQueue.add(async () => {
    const response = await (client[ns] as any).getMany({
      spaceId,
      environmentId,
      query: {
        skip: 0,
        limit: BATCH_SIZE_LIMIT
      }
    })
    totalFetched += response.items.length
    logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${name}`)

    return { items: response.items, total: response.total }
  })

  const batches = getPagedBatches(totalFetched, total)

  const remainingTotalResponses = batches.map(({ skip }) => {
    return requestQueue.add(async () => {
      const response = await (client[ns] as any).getMany({
        spaceId,
        environmentId,
        query: {
          skip,
          limit: BATCH_SIZE_LIMIT
        }
      })
      totalFetched = totalFetched + response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} of ${response.total} ${name}`)

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
  client: PlainClientAPI
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
        client,
        spaceId,
        environmentId,
        type: 'contentTypes',
        ids: contentTypeIds,
        requestQueue
      })
    }

    if (!skipLocales) {
      const localeIds = sourceData.locales?.map((e) => e.sys.id)
      if (localeIds && localeIds.length) {
        result.locales = batchedPageQuery({
          client,
          spaceId,
          environmentId,
          type: 'locales',
          requestQueue
        })
      }
    }
  }

  // include tags even if contentModelOnly = true
  try {
    result.tags = await batchedPageQuery({ client, spaceId, environmentId, type: 'tags', requestQueue })
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
      client,
      spaceId,
      environmentId,
      type: 'entries',
      ids: entryIds,
      requestQueue
    })
  }
  if (assetIds) {
    result.assets = batchedIdQuery({
      client,
      spaceId,
      environmentId,
      type: 'assets',
      ids: assetIds,
      requestQueue
    })
  }

  result.webhooks = []

  return Promise.props(result)
}
