import Promise from 'bluebird'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { AssetProps, ComponentProps, ContentTypeProps, DataAssemblyProps, DesignTokenProps, EntryProps, ExperienceProps, ExperienceFragmentProps, LocaleProps, PlainClientAPI, TagProps, ExperienceTemplateProps, WebhookProps, ReleaseProps } from 'contentful-management'
import { OriginalSourceData } from '../types'
import { isExoEntitlementError, spaceHasExoM1Entitlement } from '../utils/publish-exo-entities'
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
  designTokens: { name: 'design tokens', namespace: 'designToken' },
  components: { name: 'components', namespace: 'component' },
  experienceTemplates: { name: 'experience templates', namespace: 'experienceTemplate' },
  experienceFragments: { name: 'experience fragments', namespace: 'experienceFragment' },
  dataAssemblies: { name: 'data assemblies', namespace: 'dataAssembly' },
  experiences: { name: 'experiences', namespace: 'experience' },
  releases: { name: 'releases', namespace: 'release' }
}

const ENTITY_METHODS = {
  contentTypes: { name: 'content types', ns: 'contentType' },
  entries: { name: 'entries', ns: 'entry' },
  assets: { name: 'assets', ns: 'asset' },
  locales: { name: 'locales', ns: 'locale' },
  tags: { name: 'tags', ns: 'tag' },
  releases: { name: 'releases', ns: 'release' }
} as const

type BatchedIdQueryParams = {
  requestQueue: PQueue
  type: keyof typeof OFFSET_QUERY_METHODS
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  ids: string[]
}

type BatchedPageQueryParams = {
  requestQueue: PQueue
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  type: 'locales' | 'tags'
}

type CursorPaginatedQueryParams = {
  requestQueue: PQueue
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  type: keyof typeof CURSOR_QUERY_METHODS
}

async function batchedIdQuery({ client, spaceId, environmentId, type, ids, requestQueue }: BatchedIdQueryParams) {
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

async function batchedPageQuery({ client, spaceId, environmentId, type, requestQueue }: BatchedPageQueryParams) {
  const { name, ns } = ENTITY_METHODS[type]

  let totalFetched = 0
  const { items, total } = await requestQueue.add(async () => {
    const response = await client[ns].getMany({
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
      const response = await client[ns].getMany({
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

async function cursorPaginatedQuery({ client, spaceId, environmentId, type, requestQueue }: CursorPaginatedQueryParams) {
  const { name: entityTypeName, namespace } = CURSOR_QUERY_METHODS[type]

  let totalFetched = 0
  let pageNext: string | undefined = undefined
  const allItems: any[] = []

  do {
    const items: any[] = await requestQueue.add(async () => {
      let response: any

      if (type === 'releases') {
        response = await client.release.query({
          environmentId,
          spaceId,
          query: {
            "metadata.annotations.Contentful:Timeline.type[nin]": "Staging",
            "sys.schemaVersion": "Release.v2",
            "sys.status[in]": "active",
            // "entities.sys.linkType": "Entry | Asset | Experience | ExperienceFragment",
          }
        });
      } else {
        response = await (client[namespace] as any).getMany({
          spaceId,
          environmentId,
          query: { limit: BATCH_SIZE_LIMIT, ...(pageNext && { pageNext }) }
        })
      }
      totalFetched += response.items.length
      logEmitter.emit('info', `Fetched ${totalFetched} ${entityTypeName}`)
      pageNext = response.pages?.next
      return response.items
    })
    allItems.push(...items)
  } while (pageNext)

  return allItems
}

// A destination space without the ExO entitlement 403s on every ExO endpoint. That's a normal,
// expected outcome (most spaces don't have ExO enabled) rather than a fatal error, so it's
// handled the same way the `tags` fetch above handles spaces without Tags access: warn and
// fall back to an empty array instead of failing the whole destination-data fetch.
async function cursorPaginatedQueryOrWarn(params: CursorPaginatedQueryParams): Promise<any[]> {
  try {
    return await cursorPaginatedQuery(params)
  } catch (err) {
    const { name: entityTypeName } = CURSOR_QUERY_METHODS[params.type]
    if (isExoEntitlementError(err)) {
      logEmitter.emit('error', new Error(`Skipping ${entityTypeName} import: Experience Orchestration (ExO) is not enabled for this space`))
    } else {
      logEmitter.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
    return []
  }
}

type AllDestinationData = {
  contentTypes: Promise<ContentTypeProps[]>
  tags: Promise<TagProps[]>
  locales: Promise<LocaleProps[]>
  entries: Promise<EntryProps[]>
  assets: Promise<AssetProps[]>
  releases: Promise<ReleaseProps[]>
  webhooks?: Promise<WebhookProps[]>
  components?: Promise<ComponentProps[]>
  experienceTemplates?: Promise<ExperienceTemplateProps[]>
  experienceFragments?: Promise<ExperienceFragmentProps[]>
  dataAssemblies?: Promise<DataAssemblyProps[]>
  experiences?: Promise<ExperienceProps[]>
  designTokens?: Promise<DesignTokenProps[]>
}

type GetDestinationDataParams = {
  client: PlainClientAPI
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
  spaceId,
  environmentId,
  sourceData,
  contentModelOnly,
  skipLocales,
  skipContentModel,
  includeExperienceOrchestration,
  requestQueue
}: GetDestinationDataParams) {
  const result: AllDestinationData = {
    contentTypes: [],
    tags: [],
    locales: [],
    entries: [],
    assets: [],
    experiences: [],
    experienceTemplates: [],
    components: [],
    experienceFragments: [],
    dataAssemblies: [],
    designTokens: [],
    webhooks: [],
    releases: []
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
  if (entryIds && entryIds.length) {
    result.entries = batchedIdQuery({
      client,
      spaceId,
      environmentId,
      type: 'entries',
      ids: entryIds,
      requestQueue
    })
  }
  if (assetIds && assetIds.length) {
    result.assets = batchedIdQuery({
      client,
      spaceId,
      environmentId,
      type: 'assets',
      ids: assetIds,
      requestQueue
    })
  }

  const allReleases = await cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'releases', requestQueue })

  result.releases = allReleases




  if (includeExperienceOrchestration && client) {
    // dataAssemblies is excluded here — confirmed live it isn't actually gated by exoM1,
    // unlike the other 5, so it always uses its own fetch-and-catch below instead.
    const sourceHasDesignTokens = Boolean(sourceData.designTokens?.length)
    const sourceHasComponents = Boolean(sourceData.components?.length)
    const sourceHasExperienceTemplates = Boolean(sourceData.experienceTemplates?.length)
    const sourceHasExperienceFragments = Boolean(sourceData.experienceFragments?.length)
    const sourceHasExperiences = Boolean(sourceData.experiences?.length)

    let entitled: boolean | null = true
    if (sourceHasDesignTokens || sourceHasComponents || sourceHasExperienceTemplates || sourceHasExperienceFragments || sourceHasExperiences) {
      entitled = await spaceHasExoM1Entitlement(client, spaceId)
    }

    if (entitled === false) {
      logEmitter.emit('error', new Error('Skipping Experience Orchestration import: Experience Orchestration (ExO) is not enabled for this space'))
    } else {
      // null (inconclusive check) falls through here too, same as true.
      if (sourceHasDesignTokens) {
        result.designTokens = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'designTokens', requestQueue })
      }
      if (sourceHasComponents) {
        result.components = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'components', requestQueue })
      }
      if (sourceHasExperienceTemplates) {
        result.experienceTemplates = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'experienceTemplates', requestQueue })
      }
      if (sourceHasExperienceFragments) {
        result.experienceFragments = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'experienceFragments', requestQueue })
      }
      if (sourceHasExperiences) {
        result.experiences = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'experiences', requestQueue })
      }
    }

    if (sourceData.dataAssemblies?.length) {
      result.dataAssemblies = cursorPaginatedQueryOrWarn({ client, spaceId, environmentId, type: 'dataAssemblies', requestQueue })
    }
  }

  return Promise.props(result)
}
