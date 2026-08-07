import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ComponentProps, DataAssemblyProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps } from 'contentful-management'

type PublishableExoEntity = ComponentProps | ExperienceTemplateProps | ExperienceFragmentProps | DataAssemblyProps | ExperienceProps

/**
 * Find all ExO entities in source content which are published, and filter the
 * created/upserted destination entities down to just those. Mirrors publishEntities
 * in push-to-space.ts, but ExO source entities aren't wrapped in { original, transformed }
 * and are plain JSON rather than SDK-wrapped instances, so ExO entities get their own gate here.
 */
export function filterExoEntitiesToPublish<T extends { sys: { id: string; version: number } }>(
  entities: T[],
  sourceEntities: PublishableExoEntity[]
): T[] {
  const entityIdsToPublish = new Set(
    sourceEntities.filter((entity) => entity.sys.publishedVersion).map((entity) => entity.sys.id)
  )
  return entities.filter((entity) => entityIdsToPublish.has(entity.sys.id))
}

/**
 * Inverse of filterExoEntitiesToPublish. Finds entities that are currently published at the
 * destination but draft (or absent) in source, so a source-side unpublish propagates on re-import.
 */
export function filterExoEntitiesToUnpublish<T extends { sys: { id: string; version: number; publishedVersion?: number } }>(
  entities: T[],
  sourceEntities: PublishableExoEntity[]
): T[] {
  const entityIdsPublishedInSource = new Set(
    sourceEntities.filter((entity) => entity.sys.publishedVersion).map((entity) => entity.sys.id)
  )
  return entities.filter((entity) => entity.sys.publishedVersion && !entityIdsPublishedInSource.has(entity.sys.id))
}

export async function publishExoEntity<T>(type: string, entity: { sys: { id: string } }, publish: () => Promise<T>): Promise<T | null> {
  try {
    const result = await publish()
    logEmitter.emit('info', `PUBLISH ${type} ${entity.sys.id}`)
    return result
  } catch (err) {
    logEmitter.emit('error', err)
    return null
  }
}

export async function unpublishExoEntity<T>(type: string, entity: { sys: { id: string } }, unpublish: () => Promise<T>): Promise<T | null> {
  try {
    const result = await unpublish()
    logEmitter.emit('info', `UNPUBLISH ${type} ${entity.sys.id}`)
    return result
  } catch (err) {
    logEmitter.emit('error', err)
    return null
  }
}
