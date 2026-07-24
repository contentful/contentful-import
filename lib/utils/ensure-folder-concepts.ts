import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { ComponentProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps } from 'contentful-management'

const FOLDER_CONCEPT_PREFIX = 'contentful.folder-'

type ExoFolderEntity = ComponentProps | DesignTokenProps | ExperienceTemplateProps | ExperienceFragmentProps | ExperienceProps

type SourceEntities = {
  designTokens?: DesignTokenProps[]
  components?: ComponentProps[]
  experienceTemplates?: ExperienceTemplateProps[]
  experienceFragments?: ExperienceFragmentProps[]
  experiences?: ExperienceProps[]
}

export const EXO_FOLDER_SCHEME_IDS = {
  designToken: 'contentful.folder-group-designToken',
  componentType: 'contentful.folder-group-componentType',
  template: 'contentful.folder-group-template',
  fragment: 'contentful.folder-group-fragment',
  experience: 'contentful.folder-group-experience',
} as const

const EXO_FOLDER_SCHEME_LABELS: Record<string, string> = {
  [EXO_FOLDER_SCHEME_IDS.designToken]: 'Design Tokens',
  [EXO_FOLDER_SCHEME_IDS.componentType]: 'Component Types',
  [EXO_FOLDER_SCHEME_IDS.template]: 'Templates',
  [EXO_FOLDER_SCHEME_IDS.fragment]: 'Fragments',
  [EXO_FOLDER_SCHEME_IDS.experience]: 'Experiences',
}

const ENTITY_TYPE_TO_SCHEME_ID: Record<keyof SourceEntities, string> = {
  designTokens: EXO_FOLDER_SCHEME_IDS.designToken,
  components: EXO_FOLDER_SCHEME_IDS.componentType,
  experienceTemplates: EXO_FOLDER_SCHEME_IDS.template,
  experienceFragments: EXO_FOLDER_SCHEME_IDS.fragment,
  experiences: EXO_FOLDER_SCHEME_IDS.experience,
}

// Returns Map<sourceConceptId, schemeId> for all folder-prefixed concepts. First entity type wins on collision.
function collectExoFolderConcepts(sourceEntities: SourceEntities): Map<string, string> {
  const conceptToScheme = new Map<string, string>()
  for (const [entityType, schemeId] of Object.entries(ENTITY_TYPE_TO_SCHEME_ID)) {
    for (const entity of (sourceEntities[entityType as keyof SourceEntities] ?? []) as ExoFolderEntity[]) {
      for (const concept of entity.metadata?.concepts ?? []) {
        if (concept.sys.id.startsWith(FOLDER_CONCEPT_PREFIX) && !conceptToScheme.has(concept.sys.id)) {
          conceptToScheme.set(concept.sys.id, schemeId)
        }
      }
    }
  }
  return conceptToScheme
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

/**
 * Ensures all 5 ExO folder group concept schemes exist in the target org,
 * creating any that are missing. Returns a Map<schemeId, schemeObject> for
 * all required schemes, used to link new folder concepts into their scheme.
 */
export async function ensureExoConceptSchemes(
  plainClient: any,
  organizationId: string,
  destinationSpaceId: string,
): Promise<Map<string, any>> {
  const { items } = await plainClient.conceptScheme.getMany({
    organizationId,
    query: { purpose: 'internal' },
  })

  const existingById = new Map<string, any>(items.map((s: any) => [s.sys.id, s]))
  const result = new Map<string, any>()

  for (const schemeId of Object.values(EXO_FOLDER_SCHEME_IDS)) {
    if (existingById.has(schemeId)) {
      result.set(schemeId, existingById.get(schemeId))
      continue
    }

    logEmitter.emit('info', `ExO folder scheme ${schemeId} not found — creating`)
    try {
      const created = await plainClient.conceptScheme.createWithId(
        { organizationId, conceptSchemeId: schemeId },
        {
          prefLabel: { 'en-US': EXO_FOLDER_SCHEME_LABELS[schemeId] },
          metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: destinationSpaceId } }] },
        }
      )
      result.set(schemeId, created)
      logEmitter.emit('info', `Created ExO folder scheme ${schemeId}`)
    } catch (err: any) {
      logEmitter.emit('warning', `Failed to create ExO folder scheme ${schemeId}: ${err?.message ?? err}`)
    }
  }

  return result
}

/**
 * Rewrites metadata.concepts on ExO entities in-place, replacing source folder
 * concept IDs with destination-space-scoped concept IDs from the provided map.
 * Non-folder concepts are left untouched.
 */
export function rewriteEntityFolderConcepts(
  entities: ExoFolderEntity[],
  conceptIdMap: Map<string, string>
): void {
  for (const entity of entities) {
    if (!entity.metadata?.concepts) continue
    entity.metadata.concepts = entity.metadata.concepts.map((link) => {
      const remapped = conceptIdMap.get(link.sys.id)
      if (!remapped) return link
      return { sys: { ...link.sys, id: remapped } }
    })
  }
}

/**
 * For each folder concept referenced by the source ExO entities:
 * 1. Ensures all 5 ExO folder group concept schemes exist in the destination org
 * 2. Derives a deterministic destination-scoped concept ID: `{sourceId}-{destinationSpaceId}`
 * 3. Creates the concept in the destination org if it doesn't exist yet, scoped to destinationSpaceId
 * 4. If it already exists but is missing destinationSpaceId in metadata.spaces or purpose: 'internal', patches them in
 * 5. Links the concept into its folder group scheme if not already present
 *
 * Returns a Map<sourceConceptId, destConceptId> for use in rewriting entity metadata.
 *
 * Same-space imports (sourceSpaceId === destinationSpaceId) are skipped — the existing
 * concepts are already valid for the destination space.
 */
export async function ensureFolderConcepts({
  plainClient,
  organizationId,
  destinationSpaceId,
  sourceEntities,
}: {
  plainClient: any
  organizationId: string
  destinationSpaceId: string
  sourceEntities: SourceEntities
}): Promise<Map<string, string>> {
  const folderConceptToScheme = collectExoFolderConcepts(sourceEntities)

  if (folderConceptToScheme.size === 0) {
    return new Map()
  }

  // TODO, surely we can get space id a different way no?
  const sourceSpaceId = getSourceSpaceId(sourceEntities)

  if (sourceSpaceId === destinationSpaceId) {
    logEmitter.emit('info', 'Source and destination space are the same — skipping folder concept migration')
    return new Map()
  }

  logEmitter.emit('info', `Found ${folderConceptToScheme.size} ExO folder concept(s) to ensure in destination space ${destinationSpaceId}`)

  const schemes = await ensureExoConceptSchemes(plainClient, organizationId, destinationSpaceId)

  // Fetch source concepts so we can copy their prefLabel to the destination concept.
  const sourcePrefLabels = new Map<string, Record<string, string>>()
  for (const sourceConceptId of folderConceptToScheme.keys()) {
    try {
      const sourceConcept = await plainClient.concept.get({ organizationId, conceptId: sourceConceptId })
      if (sourceConcept?.prefLabel) {
        sourcePrefLabels.set(sourceConceptId, sourceConcept.prefLabel)
      }
    } catch {
      // Not critical — fall back to the concept ID as label
    }
  }

  const conceptIdMap = new Map<string, string>()
  for (const sourceId of folderConceptToScheme.keys()) {
    conceptIdMap.set(sourceId, `${sourceId}-${destinationSpaceId}`)
  }

  for (const [sourceConceptId, destConceptId] of conceptIdMap) {
    const schemeId = folderConceptToScheme.get(sourceConceptId)!

    let existing: any
    try {
      existing = await plainClient.concept.get({ organizationId, conceptId: destConceptId })
    } catch (err: any) {
      if (err?.sys?.id !== 'NotFound' && err?.status !== 404) {
        // TODO: this is a little misleading, as it is an expected error for new spaces, and not indicative of a failure, we're just tyring to see whether we need to create or patch the concept.
        // logEmitter.emit('warning', `Could not fetch destination folder concept ${destConceptId}: ${err?.message ?? err}`)
      }
      existing = null
    }

    const spaceLink = { sys: { type: 'Link', linkType: 'Space', id: destinationSpaceId } }
    const prefLabel = sourcePrefLabels.get(sourceConceptId) ?? { 'en-US': destConceptId }

    if (!existing) {
      try {
        await plainClient.concept.createWithId(
          { organizationId, conceptId: destConceptId },
          { purpose: 'internal', prefLabel, metadata: { spaces: [spaceLink] } }
        )
        logEmitter.emit('info', `Created folder concept ${destConceptId} for source ${sourceConceptId}`)
      } catch (err: any) {
        logEmitter.emit('warning', `Failed to create folder concept ${destConceptId}: ${err?.message ?? err}`)
        continue
      }
    } else {
      const patches: Array<{ op: string; path: string; value: any }> = []

      const spaces: Array<{ sys: { id: string } }> = existing.metadata?.spaces ?? []
      if (!spaces.some((s) => s.sys.id === destinationSpaceId)) {
        patches.push({ op: 'add', path: '/metadata/spaces/-', value: spaceLink })
      }

      if ((existing as any).purpose !== 'internal') {
        patches.push({ op: 'add', path: '/purpose', value: 'internal' })
      }

      if (patches.length > 0) {
        try {
          await plainClient.concept.patch(
            { organizationId, conceptId: destConceptId, version: existing.sys.version },
            patches
          )
          logEmitter.emit('info', `Patched folder concept ${destConceptId} (${patches.map(p => p.path).join(', ')})`)
        } catch (err: any) {
          logEmitter.emit('warning', `Failed to patch folder concept ${destConceptId}: ${err?.message ?? err}`)
        }
      } else {
        logEmitter.emit('info', `Folder concept ${destConceptId} already up to date, skipping`)
      }
    }

    const scheme = schemes.get(schemeId)
    if (!scheme) continue

    const alreadyInScheme = (scheme.concepts ?? []).some((c: any) => c.sys.id === destConceptId)
    if (alreadyInScheme) {
      continue
    }

    try {
      const updated = await plainClient.conceptScheme.patch(
        { organizationId, conceptSchemeId: schemeId, version: scheme.sys.version },
        [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: destConceptId } } }]
      )
      schemes.set(schemeId, updated)
      logEmitter.emit('info', `Added folder concept ${destConceptId} to scheme ${schemeId}`)
    } catch (err: any) {
      logEmitter.emit('warning', `Failed to add folder concept ${destConceptId} to scheme ${schemeId}: ${err?.message ?? err}`)
    }
  }

  return conceptIdMap
}
