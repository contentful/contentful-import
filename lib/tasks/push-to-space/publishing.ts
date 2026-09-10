import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulEntityError } from '../../utils/errors'
import { ResourcesUnion } from '../../types'
import PQueue from 'p-queue'
import { PlainClientAPI } from 'contentful-management'
import {
  destinationScopedThePublish,
  isLocalePublishingRejectedError,
  isLocaleScopingUnavailable,
  markLocaleScopingUnavailable
} from '../../utils/locale-publishing'
import type { LocalePublishPlan } from '../../utils/resolve-publish-locales'

type PublishArchiveParams = {
  entities: any[]
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  requestQueue: PQueue
}

type PublishParams = PublishArchiveParams & {
  /**
   * Scopes each publish to the locales the entity was published for in the source
   * environment. Without this, the CMA publishes every locale in the destination
   * environment. Built by `lib/utils/resolve-publish-locales` from the source
   * `sys.fieldStatus`; absent when the content file carries no per-locale state.
   */
  localePublishing?: LocalePublishPlan
}

function publishEntity(client: PlainClientAPI, spaceId: string, environmentId: string, entity: any, locales?: string[]): Promise<any> {
  const id = entity.sys.id
  const type = entity.sys.type
  if (type === 'Entry') {
    return client.entry.publish({ spaceId, environmentId, entryId: id, locales }, entity)
  }
  if (type === 'Asset') {
    return client.asset.publish({ spaceId, environmentId, assetId: id, locales }, entity)
  }
  if (type === 'ContentType') {
    // Content types are not localized, and contentType.publish takes no locales.
    return client.contentType.publish({ spaceId, environmentId, contentTypeId: id }, entity)
  }
  throw new Error(`publishEntity: unsupported type "${type}"`)
}

function unpublishEntityLocales(client: PlainClientAPI, spaceId: string, environmentId: string, entity: any, locales: string[]): Promise<any> {
  const id = entity.sys.id
  const type = entity.sys.type
  if (type === 'Entry') {
    return client.entry.unpublish({ spaceId, environmentId, entryId: id, locales }, entity)
  }
  if (type === 'Asset') {
    return client.asset.unpublish({ spaceId, environmentId, assetId: id, locales }, entity)
  }
  throw new Error(`unpublishEntityLocales: unsupported type "${type}"`)
}

function archiveEntity(client: PlainClientAPI, spaceId: string, environmentId: string, entity: any): Promise<any> {
  const id = entity.sys.id
  const type = entity.sys.type
  if (type === 'Entry') {
    return client.entry.archive({ spaceId, environmentId, entryId: id })
  }
  if (type === 'Asset') {
    return client.asset.archive({ spaceId, environmentId, assetId: id })
  }
  throw new Error(`archiveEntity: unsupported type "${type}"`)
}

/**
 * Publish a list of entities.
 * Does not return a rejected promise in the case of an error, pushing it
 * to an error buffer instead.
 */
export async function publishEntities({ entities, client, spaceId, environmentId, requestQueue, localePublishing }: PublishParams) {
  if (entities.length === 0) {
    logEmitter.emit('info', 'Skipping publishing since zero valid entities passed')
    return []
  }

  const entity = entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Publishing ${entities.length} ${type}s`)

  const result = await runQueue(entities, [], client, spaceId, environmentId, requestQueue, localePublishing)
  logEmitter.emit('info', `Successfully published ${result.length} ${type}s`)
  return result
}

export async function archiveEntities({ entities, client, spaceId, environmentId, requestQueue }: PublishArchiveParams) {
  if (entities.length === 0) {
    logEmitter.emit('info', 'Skipping archiving since zero valid entities passed')
    return []
  }

  const entity = entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Archiving ${entities.length} ${type}s`)

  const pendingArchivedEntities = entities.map((entity) => {
    return requestQueue.add(async () => {
      try {
        const archivedEntity = await archiveEntity(client, spaceId, environmentId, entity)
        return archivedEntity
      } catch (err: any) {
        if (err instanceof ContentfulEntityError) {
          err.entity = entity
        }
        logEmitter.emit('error', err)
        return null
      }
    })
  })

  const allPossiblyArchivedEntities = await Promise.all(pendingArchivedEntities)
  const allArchivedEntities = allPossiblyArchivedEntities.filter((entity) => entity)

  logEmitter.emit('info', `Successfully archived ${allArchivedEntities.length} ${type}s`)

  return allArchivedEntities
}

/**
 * Publishes one entity scoped to `locales`, then demotes the locales the content
 * file marks as draft that are still live in the destination.
 *
 * Both halves can find out that the destination cannot honour a locale scope — by
 * rejection or by ignoring it — and both latch that for the rest of the run rather
 * than failing the import. See `lib/utils/locale-publishing`.
 */
async function publishEntityLocales(client: PlainClientAPI, spaceId: string, environmentId: string, entity: any, locales: string[], localesToDemote?: string[]): Promise<any> {
  let published: any

  try {
    published = await publishEntity(client, spaceId, environmentId, entity, locales)
  } catch (err: any) {
    if (!isLocalePublishingRejectedError(err)) {
      throw err
    }

    markLocaleScopingUnavailable(client, `The destination rejected locale-scoped publishing, starting with ${entity.sys.type} ${getEntityName(entity)}.`)

    return publishEntity(client, spaceId, environmentId, entity)
  }

  if (!destinationScopedThePublish(published)) {
    markLocaleScopingUnavailable(client, `The destination published ${entity.sys.type} ${getEntityName(entity)} without honouring the requested locales (${locales.join(', ')}) and reported no per-locale state back.`)

    return published
  }

  // Publishing is additive — the CMA payload verb is `add` — so a locale left
  // published by an earlier import has to be unpublished explicitly. Opt-in via
  // `unpublishDraftLocales`.
  if (!localesToDemote?.length) {
    return published
  }

  logEmitter.emit('info', `Unpublishing locales ${localesToDemote.join(', ')} of ${entity.sys.type} ${getEntityName(entity)}`)

  try {
    return await unpublishEntityLocales(client, spaceId, environmentId, published, localesToDemote)
  } catch (err: any) {
    if (isLocalePublishingRejectedError(err)) {
      markLocaleScopingUnavailable(client, `The destination rejected locale-scoped unpublishing, starting with ${entity.sys.type} ${getEntityName(entity)}.`)
      return published
    }

    if (err instanceof ContentfulEntityError) {
      err.entity = entity
    }
    logEmitter.emit('error', err)

    // The publish itself succeeded. Returning it keeps runQueue from treating the
    // entity as unpublished and retrying it with a now-stale version.
    return published
  }
}

async function runQueue(queue, result: ResourcesUnion = [], client: PlainClientAPI, spaceId: string, environmentId: string, requestQueue: PQueue, localePublishing?: LocalePublishPlan) {
  const publishedEntities: ResourcesUnion = []

  for (const entity of queue) {
    const locales = localePublishing && !isLocaleScopingUnavailable(client)
      ? localePublishing.localesByEntityId.get(entity.sys.id)
      : undefined

    if (locales) {
      logEmitter.emit('info', `Publishing ${entity.sys.type} ${getEntityName(entity)} for locales ${locales.join(', ')}`)
    } else {
      logEmitter.emit('info', `Publishing ${entity.sys.type} ${getEntityName(entity)}`)
    }

    try {
      const publishedEntity = await requestQueue.add(() => locales
        ? publishEntityLocales(client, spaceId, environmentId, entity, locales, localePublishing?.demoteLocalesByEntityId.get(entity.sys.id))
        : publishEntity(client, spaceId, environmentId, entity))
      publishedEntities.push(publishedEntity)
    } catch (err: any) {
      if (err instanceof ContentfulEntityError) {
        err.entity = entity
      }
      logEmitter.emit('error', err)
    }
  }

  result = [
    ...result,
    ...publishedEntities
  ]

  const publishedEntityIds = new Set(publishedEntities.map((entity) => entity.sys.id))
  const unpublishedEntities = queue.filter((entity) => !publishedEntityIds.has(entity.sys.id))

  if (unpublishedEntities.length > 0) {
    if (queue.length === unpublishedEntities.length) {
      // Fail when queue could not publish at least one item
      const unpublishedEntityNames = unpublishedEntities.map(getEntityName).join(', ')
      logEmitter.emit('error', `Could not publish the following entities: ${unpublishedEntityNames}`)
    } else {
      // Rerun queue with unpublished entities
      return runQueue(unpublishedEntities, result, client, spaceId, environmentId, requestQueue, localePublishing)
    }
  }
  // Return only published entities + last result
  return result
}
