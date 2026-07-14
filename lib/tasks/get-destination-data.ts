import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { AssetProps, ComponentTypeProps, ContentTypeProps, DataAssemblyProps, EntryProps, ExperienceProps, FragmentProps, LocaleProps, TagProps, TemplateProps, WebhookProps } from 'contentful-management'
import { OriginalSourceData } from '../types'
import PQueue from 'p-queue'

const BATCH_CHAR_LIMIT = 1990
const BATCH_SIZE_LIMIT = 100

const OFFSET_QUERY_METHODS = {
  contentTypes: { name: 'content types', method: 'getContentTypes' },
  locales: { name: 'locales', method: 'getLocales' },
  entries: { name: 'entries', method: 'getEntries' },
  assets: { name: 'assets', method: 'getAssets' },
  tags: { name: 'tags', method: 'getTags' }
}

const CURSOR_QUERY_METHODS = {
  componentTypes: { name: 'component types', namespace: 'componentType' },
  templates: { name: 'templates', namespace: 'template' },
  fragments: { name: 'fragments', namespace: 'fragment' },
  dataAssemblies: { name: 'data assemblies', namespace: 'dataAssembly' },
  experiences: { name: 'experiences', namespace: 'experience' }
  // TODO: add designTokens once the contentful-management SDK exposes a designToken plain client API
}

type BatchedIdQueryParams = {
  requestQueue: PQueue
  environment: any
  type: keyof typeof OFFSET_QUERY_METHODS
  ids: string[]
}

type BatchedPageQueryParams = Omit<BatchedIdQueryParams, 'ids'>

type CursorPaginatedQueryParams = {
  requestQueue: PQueue
  plainClient: any
  spaceId: string
  environmentId: string
  type: keyof typeof CURSOR_QUERY_METHODS
}

async function batchedIdQuery({ environment, type, ids, requestQueue }: BatchedIdQueryParams) {
  const method = OFFSET_QUERY_METHODS[type].method
  const entityTypeName = OFFSET_QUERY_METHODS[type].name
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

async function batchedPageQuery({ environment, type, requestQueue }: BatchedPageQueryParams) {
  const method = OFFSET_QUERY_METHODS[type].method
  const entityTypeName = OFFSET_QUERY_METHODS[type].name

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

function getIdBatches(ids) {
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

async function cursorPaginatedQuery ({ plainClient, spaceId, environmentId, type, requestQueue }: CursorPaginatedQueryParams) {
  const { name: entityTypeName, namespace } = CURSOR_QUERY_METHODS[type]

  let totalFetched = 0
  let pageNext: string | undefined = undefined
  const allItems: any[] = []

  do {
    const items: any[] = await requestQueue.add(async () => {
      const response = await plainClient[namespace].getMany({
        spaceId,
        environmentId,
        query: { limit: BATCH_SIZE_LIMIT, ...(pageNext && { pageNext }) }
      })
      totalFetched += response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} ${entityTypeName}`)
      pageNext = response.pages?.next
      return response.items
    })
    allItems.push(...items)
  } while (pageNext)

  return allItems
}

type AllDestinationData = {
  contentTypes: Promise<ContentTypeProps[]>
  tags: Promise<TagProps[]>
  locales: Promise<LocaleProps[]>
  entries: Promise<EntryProps[]>
  assets: Promise<AssetProps[]>
  webhooks?: Promise<WebhookProps[]>
  componentTypes?: Promise<ComponentTypeProps[]>
  templates?: Promise<TemplateProps[]>
  fragments?: Promise<FragmentProps[]>
  dataAssemblies?: Promise<DataAssemblyProps[]>
  experiences?: Promise<ExperienceProps[]>
  // TODO: add designTokens once the contentful-management SDK exposes a designToken plain client API
}

type GetDestinationDataParams = {
  client: any
  plainClient?: any
  spaceId: string
  environmentId: string
  sourceData: OriginalSourceData
  contentModelOnly?: boolean
  skipLocales?: boolean
  skipContentModel?: boolean
  includeExperienceOrchestration?: boolean
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

export default async function getDestinationData({
  client,
  plainClient,
  spaceId,
  environmentId,
  sourceData,
  contentModelOnly,
  skipLocales,
  skipContentModel,
  includeExperienceOrchestration,
  requestQueue
}: GetDestinationDataParams) {
  const space = await client.getSpace(spaceId)
  const environment = await space.getEnvironment(environmentId)
  const result: AllDestinationData = {
    contentTypes: [],
    tags: [],
    locales: [],
    entries: [],
    assets: [],
    experiences: [],
    templates: [],
    componentTypes: [],
    fragments: [],
    dataAssemblies: [],
    // designTokens: [], // TODO: add designTokens once the contentful-management SDK exposes a designToken plain client API
    webhooks: [],
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
  if (entryIds && entryIds.length) {
    result.entries = batchedIdQuery({
      environment,
      type: 'entries',
      ids: entryIds,
      requestQueue
    })
  }
  if (assetIds && assetIds.length) {
    result.assets = batchedIdQuery({
      environment,
      type: 'assets',
      ids: assetIds,
      requestQueue
    })
  }

  if (includeExperienceOrchestration && plainClient) {
    result.componentTypes = cursorPaginatedQuery({ plainClient, spaceId, environmentId, type: 'componentTypes', requestQueue })
    result.templates = cursorPaginatedQuery({ plainClient, spaceId, environmentId, type: 'templates', requestQueue })
    result.fragments = cursorPaginatedQuery({ plainClient, spaceId, environmentId, type: 'fragments', requestQueue })
    result.dataAssemblies = cursorPaginatedQuery({ plainClient, spaceId, environmentId, type: 'dataAssemblies', requestQueue })
    result.experiences = cursorPaginatedQuery({ plainClient, spaceId, environmentId, type: 'experiences', requestQueue })
    // TODO: fetch destination designTokens here once the contentful-management SDK exposes a designToken plain client API
  }

  return Promise.props(result)
}
