import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { ComponentTypeProps, DesignTokenProps, ExperienceProps, FragmentProps, TemplateProps } from 'contentful-management'

const FOLDER_CONCEPT_PREFIX = 'folder-'

type ExoFolderEntity = ComponentTypeProps | DesignTokenProps | TemplateProps | FragmentProps | ExperienceProps

function collectFolderConceptIds(entities: ExoFolderEntity[]): Set<string> {
  const ids = new Set<string>()
  for (const entity of entities) {
    for (const concept of entity.metadata?.concepts ?? []) {
      if (concept.sys.id.includes(FOLDER_CONCEPT_PREFIX)) {
        ids.add(concept.sys.id)
      }
    }
  }
  return ids
}

/**
 * For each folder concept referenced by the source ExO entities, patches the
 * concept in the destination org to include the destination spaceId in
 * metadata.spaces. This is required because folder concepts are org-scoped but
 * space-filtered — a concept created in the source space must be explicitly
 * associated with the destination space before entities can reference it.
 *
 * Safe to re-run: if the destination spaceId is already in metadata.spaces the
 * patch is a no-op.
 */
export async function patchFolderConcepts({
  plainClient,
  organizationId,
  spaceId,
  sourceEntities,
}: {
  plainClient: any
  organizationId: string
  spaceId: string
  sourceEntities: {
    designTokens?: DesignTokenProps[]
    componentTypes?: ComponentTypeProps[]
    templates?: TemplateProps[]
    fragments?: FragmentProps[]
    experiences?: ExperienceProps[]
  }
}): Promise<void> {
  const allEntities: ExoFolderEntity[] = [
    ...(sourceEntities.designTokens ?? []),
    ...(sourceEntities.componentTypes ?? []),
    ...(sourceEntities.templates ?? []),
    ...(sourceEntities.fragments ?? []),
    ...(sourceEntities.experiences ?? []),
  ]

  const folderConceptIds = collectFolderConceptIds(allEntities)

  if (folderConceptIds.size === 0) {
    return
  }

  logEmitter.emit('info', `Found ${folderConceptIds.size} ExO folder concept(s) to patch`)

  for (const conceptId of folderConceptIds) {
    let concept: any
    try {
      concept = await plainClient.concept.get({ organizationId, conceptId })
    } catch (err: any) {
      logEmitter.emit('warning', `Could not fetch folder concept ${conceptId}: ${err?.message ?? err}`)
      continue
    }

    const spaces: Array<{ sys: { type: string; linkType: string; id: string } }> = concept.metadata?.spaces ?? []
    const alreadyLinked = spaces.some((s) => s.sys.id === spaceId)

    if (alreadyLinked) {
      logEmitter.emit('info', `Folder concept ${conceptId} already linked to space ${spaceId}, skipping`)
      continue
    }

    const patch = [
      {
        op: 'add',
        path: '/metadata/spaces/-',
        value: { sys: { type: 'Link', linkType: 'Space', id: spaceId } },
      },
    ]

    try {
      await plainClient.concept.patch({ organizationId, conceptId, version: concept.sys.version }, patch)
      logEmitter.emit('info', `Patched folder concept ${conceptId} to include space ${spaceId}`)
    } catch (err: any) {
      logEmitter.emit('warning', `Failed to patch folder concept ${conceptId}: ${err?.message ?? err}`)
    }
  }
}
