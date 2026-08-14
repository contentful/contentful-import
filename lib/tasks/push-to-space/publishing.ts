import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulEntityError } from '../../utils/errors'
import { ResourcesUnion } from '../../types'
import PQueue from 'p-queue'

/**
 * Scopes a publish to the locales an entity was published for in the source
 * environment. Without this, the CMA publishes every locale in the destination
 * environment. See `lib/utils/resolve-publish-locales`.
 */
export type LocalePublishing = {
  plainClient: any
  spaceId: string
  environmentId: string
  namespace: 'entry' | 'asset'
  localesByEntityId: Map<string, string[]>
  /** Only populated when `unpublishDraftLocales` is enabled. */
  demoteLocalesByEntityId?: Map<string, string[]>
}

/**
 * Publish a list of entities.
 * Does not return a rejected promise in the case of an error, pushing it
 * to an error buffer instead.
 */
export async function publishEntities ({ entities, requestQueue, localePublishing }: {
  entities: any
  requestQueue: PQueue
  localePublishing?: LocalePublishing
}) {
  const entitiesToPublish = entities.filter((entity) => {
    if (!entity || !entity.publish) {
      logEmitter.emit('warning', `Unable to publish ${getEntityName(entity)}`)
      return false
    }
    return true
  })

  if (entitiesToPublish.length === 0) {
    logEmitter.emit('info', 'Skipping publishing since zero valid entities passed')
    return []
  }

  const entity = entities[0].original || entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Publishing ${entities.length} ${type}s`)

  const result = await runQueue(entitiesToPublish, [], requestQueue, localePublishing)
  logEmitter.emit('info', `Successfully published ${result.length} ${type}s`)
  return result
}

export async function archiveEntities ({ entities, requestQueue }) {
  const entitiesToArchive = entities.filter((entity) => {
    if (!entity || !entity.archive) {
      logEmitter.emit('warning', `Unable to archive ${getEntityName(entity)}`)
      return false
    }
    return true
  })

  if (entitiesToArchive.length === 0) {
    logEmitter.emit('info', 'Skipping archiving since zero valid entities passed')
    return []
  }

  const entity = entities[0].original || entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Archiving ${entities.length} ${type}s`)

  const pendingArchivedEntities = entitiesToArchive.map((entity) => {
    return requestQueue.add(async () => {
      try {
        const archivedEntity = await entity.archive()
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
 * The legacy client's `entity.publish()` takes no arguments, so it can only ever
 * publish every locale. The plain client accepts a `locales` list, which the REST
 * adapter turns into an `{ add: { fields: { '*': locales } } }` payload.
 */
async function publishEntityLocales (localePublishing: LocalePublishing, entity, locales: string[]) {
  const { plainClient, spaceId, environmentId, namespace, demoteLocalesByEntityId } = localePublishing

  const published = await plainClient[namespace].publish(
    { spaceId, environmentId, [`${namespace}Id`]: entity.sys.id, locales },
    entity
  )

  // Publishing is additive, so a locale left published by an earlier import has to
  // be unpublished explicitly. Opt-in via `unpublishDraftLocales`.
  const localesToDemote = demoteLocalesByEntityId?.get(entity.sys.id)

  if (!localesToDemote?.length) {
    return published
  }

  logEmitter.emit('info', `Unpublishing locales ${localesToDemote.join(', ')} of ${entity.sys.type} ${getEntityName(entity)}`)

  return plainClient[namespace].unpublish(
    { spaceId, environmentId, [`${namespace}Id`]: entity.sys.id, locales: localesToDemote },
    published
  )
}

async function runQueue (queue, result: ResourcesUnion = [], requestQueue: PQueue, localePublishing?: LocalePublishing) {
  const publishedEntities: ResourcesUnion = []

  for (const entity of queue) {
    const locales = localePublishing?.localesByEntityId.get(entity.sys.id)

    if (locales) {
      logEmitter.emit('info', `Publishing ${entity.sys.type} ${getEntityName(entity)} for locales ${locales.join(', ')}`)
    } else {
      logEmitter.emit('info', `Publishing ${entity.sys.type} ${getEntityName(entity)}`)
    }

    try {
      const publishedEntity = await requestQueue.add(() => locales
        ? publishEntityLocales(localePublishing as LocalePublishing, entity, locales)
        : entity.publish())
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
      return runQueue(unpublishedEntities, result, requestQueue, localePublishing)
    }
  }
  // Return only published entities + last result
  return result
}
