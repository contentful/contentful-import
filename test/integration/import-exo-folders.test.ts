import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/index'
import {
  buildExoFolderContent,
  buildSameSpaceExoFolderContent,
  FOLDER_EXO_FIXTURE_IDS,
  TEST_PREFIX
} from './utils/exo.utils'

const managementToken = process.env.MANAGEMENT_TOKEN as string
const orgId = process.env.ORG_ID as string
const environmentId = 'master'

const DESIGN_TOKEN_SCHEME_ID = 'contentful.folder-group-designToken'
const COMPONENT_TYPE_SCHEME_ID = 'contentful.folder-group-componentType'
const TEMPLATE_SCHEME_ID = 'contentful.folder-group-template'
const FRAGMENT_SCHEME_ID = 'contentful.folder-group-fragment'
const EXPERIENCE_SCHEME_ID = 'contentful.folder-group-experience'
const ALL_PARENT_SCHEME_IDS = [
  DESIGN_TOKEN_SCHEME_ID,
  COMPONENT_TYPE_SCHEME_ID,
  TEMPLATE_SCHEME_ID,
  FRAGMENT_SCHEME_ID,
  EXPERIENCE_SCHEME_ID
]

jest.setTimeout(2 * 60 * 1000) // 2min timeout - covers space/concept create+delete + 2 import runs

function isNotFoundError (err: any) {
  return err?.status === 404 || err?.name === 'NotFound'
}

async function unlinkConceptFromSchemeIfPresent (plainClient: any, schemeId: string, conceptId: string) {
  try {
    const scheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: schemeId })
    const index = (scheme.concepts ?? []).findIndex((c: any) => c.sys.id === conceptId)
    if (index >= 0) {
      await plainClient.conceptScheme.patch(
        { organizationId: orgId, conceptSchemeId: schemeId, version: scheme.sys.version },
        [{ op: 'remove', path: `/concepts/${index}` }]
      )
    }
  } catch (err: any) {
    if (!isNotFoundError(err)) throw err
  }
}

async function linkConceptToSchemeIfAbsent (plainClient: any, schemeId: string, conceptId: string) {
  const scheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: schemeId })
  if (!(scheme.concepts ?? []).some((c: any) => c.sys.id === conceptId)) {
    await plainClient.conceptScheme.patch(
      { organizationId: orgId, conceptSchemeId: schemeId, version: scheme.sys.version },
      [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: conceptId } } }]
    )
  }
}

async function deleteConceptIfPresent (plainClient: any, conceptId: string) {
  try {
    const concept = await plainClient.concept.get({ organizationId: orgId, conceptId })
    await plainClient.concept.delete({ organizationId: orgId, conceptId, version: concept.sys.version })
  } catch (err: any) {
    if (!isNotFoundError(err)) throw err
  }
}

// ExO folder import (lib/utils/import-exo-folders.ts) is a 5-step process layered on top
// of Contentful's Taxonomy system: it runs as its own "Create ExO Folders" task before
// entity upsert (see docs/exo-import.md, "How ExO Folders Are Imported"). Unlike the rest
// of ExO import, steps 1-4 write to *org-level*, permanent concept/scheme resources shared
// across every space in CONTENTFUL_ORGANIZATION_ID, not just the throwaway space under
// test - so every describe block below carefully cleans up exactly what it creates in
// afterAll, and derives its concept IDs from its own throwaway space ID so concurrent CI
// runs (e.g. two PRs building at once) can never race on the same org-level resource.
describe('Importing ExO entities organized into folders (cross-space)', () => {
  let spaceId: string
  let plainClient: any
  let sourceComponentFolderConceptId: string
  let sourceComponentFolderLabel: string
  let sourceExperienceFolderConceptId: string
  let destComponentFolderConceptId: string
  let destExperienceFolderConceptId: string

  beforeAll(async () => {
    plainClient = createClient({ accessToken: managementToken })

    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.createSpace({ name: 'IMPORT [AUTO] TOOL EXO FOLDER TMP' }, orgId)
    spaceId = space.sys.id

    // Keep the source IDs short enough for the importer-derived destination IDs
    // (which append the destination space ID) to remain within the CMA limit.
    sourceComponentFolderConceptId = `contentful.folder-component-${spaceId}`
    sourceExperienceFolderConceptId = `contentful.folder-experience-${spaceId}`
    destComponentFolderConceptId = `${sourceComponentFolderConceptId}-${spaceId}`
    destExperienceFolderConceptId = `${sourceExperienceFolderConceptId}-${spaceId}`
    sourceComponentFolderLabel = `${TEST_PREFIX} Component Folder`

    // Pre-create a real "source" concept for the Component folder, mirroring what a
    // customer's actual source-space folder concept looks like - lets this suite verify
    // Step 3's prefLabel-copy path against the live API, not just mocks (see
    // test/unit/utils/import-exo-folders.test.ts for that same branch under mocks). No
    // source concept is pre-created for the Experience folder, so that arm instead
    // exercises the fallback-label branch when the source concept can't be found.
    await plainClient.concept.createWithId(
      { organizationId: orgId, conceptId: sourceComponentFolderConceptId },
      { purpose: 'internal', prefLabel: { 'en-US': sourceComponentFolderLabel } }
    )

    await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildExoFolderContent(FOLDER_EXO_FIXTURE_IDS, {
        component: sourceComponentFolderConceptId,
        experience: sourceExperienceFolderConceptId
      }),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    // Unlink from the shared, org-level parent schemes first, then delete the concepts
    // themselves - these are permanent org resources, not scoped to (and so not cleaned
    // up by) the throwaway space's deletion below.
    for (const { schemeId, conceptId } of [
      { schemeId: COMPONENT_TYPE_SCHEME_ID, conceptId: destComponentFolderConceptId },
      { schemeId: EXPERIENCE_SCHEME_ID, conceptId: destExperienceFolderConceptId }
    ]) {
      await unlinkConceptFromSchemeIfPresent(plainClient, schemeId, conceptId)
    }

    for (const conceptId of [sourceComponentFolderConceptId, destComponentFolderConceptId, destExperienceFolderConceptId]) {
      await deleteConceptIfPresent(plainClient, conceptId)
    }

    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.getSpace(spaceId)
    await space.delete()
  })

  test('creates a destination-scoped concept for the Component folder, copying the source prefLabel', async () => {
    const concept = await plainClient.concept.get({ organizationId: orgId, conceptId: destComponentFolderConceptId })
    expect(concept.prefLabel['en-US']).toBe(sourceComponentFolderLabel)
    expect(concept.metadata.spaces.some((s: any) => s.sys.id === spaceId)).toBe(true)
  })

  test('creates a destination-scoped concept for the Experience folder, falling back to the derived ID as its label since no source concept exists', async () => {
    const concept = await plainClient.concept.get({ organizationId: orgId, conceptId: destExperienceFolderConceptId })
    expect(concept.prefLabel['en-US']).toBe(destExperienceFolderConceptId)
    expect(concept.metadata.spaces.some((s: any) => s.sys.id === spaceId)).toBe(true)
  })

  test('links each new concept into its parent folder-group scheme', async () => {
    const componentScheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: COMPONENT_TYPE_SCHEME_ID })
    expect(componentScheme.concepts.some((c: any) => c.sys.id === destComponentFolderConceptId)).toBe(true)

    const experienceScheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: EXPERIENCE_SCHEME_ID })
    expect(experienceScheme.concepts.some((c: any) => c.sys.id === destExperienceFolderConceptId)).toBe(true)
  })

  test('rewrites each entity\'s metadata.concepts to point at the new destination concept, not the source', async () => {
    const component = await plainClient.component.get({ spaceId, environmentId, componentId: FOLDER_EXO_FIXTURE_IDS.componentId })
    expect(component.metadata.concepts[0].sys.id).toBe(destComponentFolderConceptId)

    const experience = await plainClient.experience.get({ spaceId, environmentId, experienceId: FOLDER_EXO_FIXTURE_IDS.experienceId })
    expect(experience.metadata.concepts[0].sys.id).toBe(destExperienceFolderConceptId)
  })

  test('re-import is idempotent: no duplicate concept version bump or scheme link is created', async () => {
    const componentConceptBefore = await plainClient.concept.get({ organizationId: orgId, conceptId: destComponentFolderConceptId })
    const componentSchemeBefore = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: COMPONENT_TYPE_SCHEME_ID })
    const experienceConceptBefore = await plainClient.concept.get({ organizationId: orgId, conceptId: destExperienceFolderConceptId })
    const experienceSchemeBefore = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: EXPERIENCE_SCHEME_ID })

    const result = await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildExoFolderContent(FOLDER_EXO_FIXTURE_IDS, {
        component: sourceComponentFolderConceptId,
        experience: sourceExperienceFolderConceptId
      }),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
    expect(result).toBeDefined()

    const componentConceptAfter = await plainClient.concept.get({ organizationId: orgId, conceptId: destComponentFolderConceptId })
    const componentSchemeAfter = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: COMPONENT_TYPE_SCHEME_ID })
    const experienceConceptAfter = await plainClient.concept.get({ organizationId: orgId, conceptId: destExperienceFolderConceptId })
    const experienceSchemeAfter = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: EXPERIENCE_SCHEME_ID })

    // Nothing was missing to patch on the concept (purpose + space link already present),
    // so createOrPatchChildConcepts should be a no-op - no version bump.
    expect(componentConceptAfter.sys.version).toBe(componentConceptBefore.sys.version)
    expect(experienceConceptAfter.sys.version).toBe(experienceConceptBefore.sys.version)
    // Already linked, so linkChildConceptsToParentGroups should skip the patch entirely -
    // no duplicate entry and no version bump.
    expect(componentSchemeAfter.concepts.filter((c: any) => c.sys.id === destComponentFolderConceptId).length).toBe(1)
    expect(componentSchemeAfter.sys.version).toBe(componentSchemeBefore.sys.version)
    expect(experienceSchemeAfter.concepts.filter((c: any) => c.sys.id === destExperienceFolderConceptId).length).toBe(1)
    expect(experienceSchemeAfter.sys.version).toBe(experienceSchemeBefore.sys.version)
  })
})

// dataAssemblies intentionally excluded - ExO folders aren't supported for that entity
// type (see PR contentful/contentful-import#1682's description), so there's no
// ENTITY_TYPE_TO_PARENT_GROUP_ID mapping to exercise there.
describe('Importing ExO entities organized into folders (same-space)', () => {
  let spaceId: string
  let plainClient: any
  let folderConceptId: string

  beforeAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.createSpace({ name: 'IMPORT [AUTO] TOOL EXO FOLDER SAMESPACE TMP' }, orgId)
    spaceId = space.sys.id
    plainClient = createClient({ accessToken: managementToken })
    folderConceptId = `contentful.folder-samespace-${spaceId}`

    await plainClient.concept.createWithId(
      { organizationId: orgId, conceptId: folderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': folderConceptId },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: spaceId } }] }
      }
    )
    await linkConceptToSchemeIfAbsent(plainClient, COMPONENT_TYPE_SCHEME_ID, folderConceptId)

    await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildSameSpaceExoFolderContent(FOLDER_EXO_FIXTURE_IDS, folderConceptId, spaceId),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    const destConceptId = `${folderConceptId}-${spaceId}`

    try {
      for (const schemeId of ALL_PARENT_SCHEME_IDS) {
        await unlinkConceptFromSchemeIfPresent(plainClient, schemeId, destConceptId)
      }

      await deleteConceptIfPresent(plainClient, destConceptId)
      await unlinkConceptFromSchemeIfPresent(plainClient, COMPONENT_TYPE_SCHEME_ID, folderConceptId)
      await deleteConceptIfPresent(plainClient, folderConceptId)
    } finally {
      const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
      const space = await legacyClient.getSpace(spaceId)
      await space.delete()
    }
  })

  test('skips folder import entirely and leaves the source concept ID on the entity untouched', async () => {
    const component = await plainClient.component.get({ spaceId, environmentId, componentId: FOLDER_EXO_FIXTURE_IDS.componentId })
    expect(component.metadata.concepts[0].sys.id).toBe(folderConceptId)

    // No destination-scoped concept should have been created for this space, since the
    // folder import step is skipped entirely when source === destination space.
    await expect(
      plainClient.concept.get({ organizationId: orgId, conceptId: `${folderConceptId}-${spaceId}` })
    ).rejects.toThrow()
  })
})
