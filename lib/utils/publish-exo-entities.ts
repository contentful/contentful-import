import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ComponentTypeProps, DataAssemblyProps, ExperienceProps, FragmentProps, TemplateProps } from 'contentful-management'

type PublishableExoEntity = ComponentTypeProps | TemplateProps | FragmentProps | DataAssemblyProps | ExperienceProps

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
