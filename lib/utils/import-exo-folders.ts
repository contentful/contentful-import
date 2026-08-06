import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { ComponentProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps } from 'contentful-management'

// ─── Constants ───────────────────────────────────────────────────────────────

const FOLDER_CONCEPT_PREFIX = 'contentful.folder-'

export const PARENT_FOLDER_GROUP_IDS = {
  designToken: 'contentful.folder-group-designToken',
  componentType: 'contentful.folder-group-componentType',
  template: 'contentful.folder-group-template',
  fragment: 'contentful.folder-group-fragment',
  experience: 'contentful.folder-group-experience',
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

type ExoFolderEntity = ComponentProps | DesignTokenProps | ExperienceTemplateProps | ExperienceFragmentProps | ExperienceProps

export type SourceEntities = {
  designTokens?: DesignTokenProps[]
  components?: ComponentProps[]
  experienceTemplates?: ExperienceTemplateProps[]
  experienceFragments?: ExperienceFragmentProps[]
  experiences?: ExperienceProps[]
}

// Maps sourceConceptId → { destConceptId, parentGroupId }
type ChildConceptMap = Map<string, { destConceptId: string; parentGroupId: string }>

// Maps parentGroupId → live scheme object (with sys.version for patching)
type ParentGroupMap = Map<string, any>

// ─── Private helpers ──────────────────────────────────────────────────────────

const ENTITY_TYPE_TO_PARENT_GROUP_ID: Record<keyof SourceEntities, string> = {
  designTokens: PARENT_FOLDER_GROUP_IDS.designToken,
  components: PARENT_FOLDER_GROUP_IDS.componentType,
  experienceTemplates: PARENT_FOLDER_GROUP_IDS.template,
  experienceFragments: PARENT_FOLDER_GROUP_IDS.fragment,
  experiences: PARENT_FOLDER_GROUP_IDS.experience,
}

function getSourceSpaceId(sourceEntities: SourceEntities): string | undefined {
  for (const entities of Object.values(sourceEntities)) {
    for (const entity of entities ?? []) {
      const spaceId = (entity as any).sys?.space?.sys?.id
      if (spaceId) return spaceId
    }
  }
  return undefined
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────
/**
 * Ensure all 5 ExO folder group concept schemes exist in the target org.
 * Returns Map of all conceptSchemes if all are present, empty Map if any are missing.
 * Return Map is used in step 4 to link child concepts in.
 */
export async function ensureParentFolderGroupsExist(
  plainClient: any,
  organizationId: string,
): Promise<ParentGroupMap> {
  const { items } = await plainClient.conceptScheme.getMany({
    organizationId,
    query: { purpose: 'internal' },
  })

  const existingIds = new Set<string>(items.map((s: any) => s.sys.id))
  const allParentFolderGroupsExist = Object.values(PARENT_FOLDER_GROUP_IDS).every((id) => existingIds.has(id))

  if (!allParentFolderGroupsExist) {
    return new Map()
  }

  const parentGroupIdSet = new Set(Object.values(PARENT_FOLDER_GROUP_IDS))
  return new Map<string, any>(
    items.filter((s: any) => parentGroupIdSet.has(s.sys.id)).map((s: any) => [s.sys.id, s])
  )
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

/**
 * Step 2: Derive the child concept map from source entities.
 * Scans each source entity's metadata.concepts for folder-prefixed concept IDs
 * and derives the deterministic destination-scoped concept ID for each.
 * Returns a Map<sourceConceptId, { destConceptId, parentGroupId }>.
 * Pure — no API calls.
 */
export function deriveChildConceptMap(
  sourceEntities: SourceEntities,
  destinationSpaceId: string,
): ChildConceptMap {
  const childConceptMap: ChildConceptMap = new Map()

  for (const [entityType, parentGroupId] of Object.entries(ENTITY_TYPE_TO_PARENT_GROUP_ID)) {
    for (const entity of (sourceEntities[entityType as keyof SourceEntities] ?? []) as ExoFolderEntity[]) {
      for (const concept of entity.metadata?.concepts ?? []) {
        if (concept.sys.id.startsWith(FOLDER_CONCEPT_PREFIX) && !childConceptMap.has(concept.sys.id)) {
          childConceptMap.set(concept.sys.id, {
            destConceptId: `${concept.sys.id}-${destinationSpaceId}`,
            parentGroupId,
          })
        }
      }
    }
  }

  return childConceptMap
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

/**
 * Step 3: Create or patch each destination child concept.
 * - If the concept doesn't exist: creates it with purpose:'internal', the source
 *   concept's prefLabel, and metadata.spaces scoped to the destination space.
 * - If it already exists: patches in any missing pieces (purpose:'internal' and/or
 *   the destination space link). Handles concepts created by earlier broken runs.
 */
export async function createOrPatchChildConcepts(
  plainClient: any,
  organizationId: string,
  destinationSpaceId: string,
  childConceptMap: ChildConceptMap,
): Promise<void> {
  const spaceLink = { sys: { type: 'Link', linkType: 'Space', id: destinationSpaceId } }

  for (const [sourceConceptId, { destConceptId }] of childConceptMap) {
    // Fetch the source concept to copy its prefLabel to the destination.
    let prefLabel: Record<string, string> = { 'en-US': destConceptId }
    try {
      const sourceConcept = await plainClient.concept.get({ organizationId, conceptId: sourceConceptId })
      if (sourceConcept?.prefLabel) prefLabel = sourceConcept.prefLabel
    } catch {
      // Non-critical — fall back to the dest concept ID as label
    }

    // Check whether the destination concept already exists.
    let existing: any = null
    try {
      existing = await plainClient.concept.get({ organizationId, conceptId: destConceptId })
    } catch (err: any) {
      if (err?.name !== 'NotFound') {
        logEmitter.emit('warning', `Could not fetch destination child concept ${destConceptId}: ${err?.message ?? err}`)
      }
      // Ignore 404 errors — they just mean the concept doesn't exist yet. Log any other errors.
    }

    if (!existing) {
      try {
        await plainClient.concept.createWithId(
          { organizationId, conceptId: destConceptId },
          { purpose: 'internal', prefLabel, metadata: { spaces: [spaceLink] } }
        )
        logEmitter.emit('info', `Created child folder concept ${destConceptId}`)
      } catch (err: any) {
        logEmitter.emit('warning', `Failed to create child folder concept ${destConceptId}: ${err?.message ?? err}`)
      }
    } else {
      const patches: Array<{ op: string; path: string; value: any }> = []

      if ((existing as any).purpose !== 'internal') {
        patches.push({ op: 'add', path: '/purpose', value: 'internal' })
      }

      const spaces: Array<{ sys: { id: string } }> = existing.metadata?.spaces ?? []
      if (!spaces.some((s) => s.sys.id === destinationSpaceId)) {
        patches.push({ op: 'add', path: '/metadata/spaces/-', value: spaceLink })
      }

      if (patches.length > 0) {
        try {
          await plainClient.concept.patch(
            { organizationId, conceptId: destConceptId, version: existing.sys.version },
            patches
          )
          logEmitter.emit('info', `Patched child folder concept ${destConceptId} (${patches.map((p) => p.path).join(', ')})`)
        } catch (err: any) {
          logEmitter.emit('warning', `Failed to patch child folder concept ${destConceptId}: ${err?.message ?? err}`)
        }
      }
    }
  }
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

/**
 * Step 4: Link each child concept into its parent folder group scheme.
 * Patches the scheme's concepts[] array if the child is not already listed.
 * Mutates parentGroups in-place to keep sys.version current across multiple patches
 * to the same scheme.
 */
export async function linkChildConceptsToParentGroups(
  plainClient: any,
  organizationId: string,
  childConceptMap: ChildConceptMap,
  parentGroups: ParentGroupMap,
): Promise<void> {
  for (const [, { destConceptId, parentGroupId }] of childConceptMap) {
    const parentGroup = parentGroups.get(parentGroupId)
    if (!parentGroup) continue

    const alreadyLinked = (parentGroup.concepts ?? []).some((c: any) => c.sys.id === destConceptId)
    if (alreadyLinked) continue

    try {
      const updated = await plainClient.conceptScheme.patch(
        { organizationId, conceptSchemeId: parentGroupId, version: parentGroup.sys.version },
        [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: destConceptId } } }]
      )
      parentGroups.set(parentGroupId, updated)
      logEmitter.emit('info', `Linked child concept ${destConceptId} to parent group ${parentGroupId}`)
    } catch (err: any) {
      logEmitter.emit('warning', `Failed to link child concept ${destConceptId} to parent group ${parentGroupId}: ${err?.message ?? err}`)
    }
  }
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────

/**
 * Step 5: Rewrite folder concept IDs on source entities in-place.
 * Replaces each source concept ID in metadata.concepts[] with the corresponding
 * destination concept ID. Non-folder concepts are left untouched.
 * Pure — no API calls. Mutations are picked up by the subsequent entity upserts.
 */
export function rewriteEntityFolderConcepts(
  entities: ExoFolderEntity[],
  childConceptMap: ChildConceptMap,
): void {
  for (const entity of entities) {
    if (!entity.metadata?.concepts) continue
    entity.metadata.concepts = entity.metadata.concepts.map((link) => {
      const entry = childConceptMap.get(link.sys.id)
      if (!entry) return link
      return { sys: { ...link.sys, id: entry.destConceptId } }
    })
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Orchestrates the full ExO folder import for a cross-space import.
 * Runs steps 1–5 in sequence. Step 5 mutates sourceEntities in-place so the
 * subsequent entity upserts in push-to-space carry the correct destination concept IDs.
 *
 * Same-space imports are skipped entirely — existing folder concepts are already valid.
 */
export async function importExoFolders({
  plainClient,
  organizationId,
  destinationSpaceId,
  sourceEntities,
}: {
  plainClient: any
  organizationId: string
  destinationSpaceId: string
  sourceEntities: SourceEntities
}): Promise<void> {
  const sourceSpaceId = getSourceSpaceId(sourceEntities)
  if (sourceSpaceId === destinationSpaceId) {
    logEmitter.emit('info', 'Source and destination space are the same — skipping ExO folder import')
    return
  }

  // Step 1
  const parentGroups = await ensureParentFolderGroupsExist(plainClient, organizationId)

  if (parentGroups.size === 0) {
    return Promise.reject(new Error('One or more ExO folder group concept schemes are missing in the destination org. Please create them before importing.'))
  }

  // Step 2
  const childConceptMap = deriveChildConceptMap(sourceEntities, destinationSpaceId)
  if (childConceptMap.size === 0) return

  logEmitter.emit('info', `Importing ${childConceptMap.size} ExO folder concept(s) into destination space ${destinationSpaceId}`)

  // Step 3
  await createOrPatchChildConcepts(plainClient, organizationId, destinationSpaceId, childConceptMap)

  // Step 4
  await linkChildConceptsToParentGroups(plainClient, organizationId, childConceptMap, parentGroups)

  // Step 5
  const allEntities = [
    ...(sourceEntities.designTokens ?? []),
    ...(sourceEntities.components ?? []),
    ...(sourceEntities.experienceTemplates ?? []),
    ...(sourceEntities.experienceFragments ?? []),
    ...(sourceEntities.experiences ?? []),
  ]
  rewriteEntityFolderConcepts(allEntities, childConceptMap)
}
