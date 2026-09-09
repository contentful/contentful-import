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
const sourceOrganizationId = process.env.SOURCE_ORG_ID
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

const describeCrossOrg = sourceOrganizationId && sourceOrganizationId !== orgId ? describe : describe.skip

jest.setTimeout(2 * 60 * 1000) // 2min timeout - covers space/concept create+delete + 2 import runs

function isNotFoundError (err: any) {
  return err?.status === 404 || err?.name === 'NotFound'
}

// Matches the CMA plain client's error shape for a stale sys.version on PATCH/PUT (see
// handleCreationErrors in lib/tasks/push-to-space/creation.ts for the same check).
function isVersionMismatchError (err: any) {
  return err?.error?.sys?.id === 'VersionMismatch'
}

const VERSION_CONFLICT_MAX_ATTEMPTS = 3
const VERSION_CONFLICT_RETRY_DELAY_MS = 250

// The 5 parent folder-group schemes are shared, org-wide resources - test-integration
// runs on every PR against the same org, so two concurrent CI runs can genuinely both
// read the same scheme, then race to patch it, and lose the optimistic-concurrency check
// on sys.version. Retrying with a fresh read closes that race instead of failing the test
// (or, worse in afterAll, aborting cleanup) on ordinary CI-level concurrency.
async function withVersionConflictRetry<T> (operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (err: any) {
      if (!isVersionMismatchError(err) || attempt >= VERSION_CONFLICT_MAX_ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, VERSION_CONFLICT_RETRY_DELAY_MS * attempt))
    }
  }
}

async function unlinkConceptFromSchemeIfPresent (plainClient: any, organizationId: string, schemeId: string, conceptId: string) {
  try {
    await withVersionConflictRetry(async () => {
      const scheme = await plainClient.conceptScheme.get({ organizationId, conceptSchemeId: schemeId })
      const index = (scheme.concepts ?? []).findIndex((c: any) => c.sys.id === conceptId)
      if (index >= 0) {
        await plainClient.conceptScheme.patch(
          { organizationId, conceptSchemeId: schemeId, version: scheme.sys.version },
          [{ op: 'remove', path: `/concepts/${index}` }]
        )
      }
    })
  } catch (err: any) {
    if (!isNotFoundError(err)) throw err
  }
}

async function linkConceptToSchemeIfAbsent (plainClient: any, organizationId: string, schemeId: string, conceptId: string) {
  await withVersionConflictRetry(async () => {
    const scheme = await plainClient.conceptScheme.get({ organizationId, conceptSchemeId: schemeId })
    if (!(scheme.concepts ?? []).some((c: any) => c.sys.id === conceptId)) {
      await plainClient.conceptScheme.patch(
        { organizationId, conceptSchemeId: schemeId, version: scheme.sys.version },
        [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: conceptId } } }]
      )
    }
  })
}

async function deleteConceptIfPresent (plainClient: any, organizationId: string, conceptId: string) {
  try {
    const concept = await plainClient.concept.get({ organizationId, conceptId })
    await plainClient.concept.delete({ organizationId, conceptId, version: concept.sys.version })
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
  let sourceSpaceId: string
  let destinationSpaceId: string
  let plainClient: any
  let sourceComponentFolderConceptId: string
  let sourceComponentFolderLabel: string
  let sourceExperienceFolderConceptId: string
  let destComponentFolderConceptId: string
  let destExperienceFolderConceptId: string

  beforeAll(async () => {
    plainClient = createClient({ accessToken: managementToken })

    const sourceSpace = await plainClient.space.create({ organizationId: orgId }, { name: 'IMPORT [AUTO] TOOL EXO FOLDER SOURCE TMP' })
    sourceSpaceId = sourceSpace.sys.id
    const destinationSpace = await plainClient.space.create({ organizationId: orgId }, { name: 'IMPORT [AUTO] TOOL EXO FOLDER DESTINATION TMP' })
    destinationSpaceId = destinationSpace.sys.id

    // Keep the source IDs short enough for the importer-derived destination IDs
    // (which append the destination space ID) to remain within the CMA limit.
    sourceComponentFolderConceptId = `contentful.folder-component-${sourceSpaceId}`
    sourceExperienceFolderConceptId = `contentful.folder-experience-${sourceSpaceId}`
    destComponentFolderConceptId = `${sourceComponentFolderConceptId}-${destinationSpaceId}`
    destExperienceFolderConceptId = `${sourceExperienceFolderConceptId}-${destinationSpaceId}`
    sourceComponentFolderLabel = `${TEST_PREFIX} Component Folder`

    // Pre-create real source concepts, mirroring what a customer's actual source-space
    // folder concepts look like. This verifies source-org reads and destination-org
    // writes against the live API.
    await plainClient.concept.createWithId(
      { organizationId: orgId, conceptId: sourceComponentFolderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': sourceComponentFolderLabel },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: sourceSpaceId } }] }
      }
    )
    await plainClient.concept.createWithId(
      { organizationId: orgId, conceptId: sourceExperienceFolderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': `${TEST_PREFIX} Experience Folder` },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: sourceSpaceId } }] }
      }
    )

    await runContentfulImport({
      spaceId: destinationSpaceId,
      environmentId,
      managementToken,
      content: buildExoFolderContent(FOLDER_EXO_FIXTURE_IDS, {
        component: sourceComponentFolderConceptId,
        experience: sourceExperienceFolderConceptId
      }, sourceSpaceId),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    try {
      // Unlink from the shared, org-level parent schemes first, then delete the concepts
      // themselves - these are permanent org resources, not scoped to (and so not cleaned
      // up by) the throwaway space's deletion below.
      for (const { schemeId, conceptId } of [
        { schemeId: COMPONENT_TYPE_SCHEME_ID, conceptId: destComponentFolderConceptId },
        { schemeId: EXPERIENCE_SCHEME_ID, conceptId: destExperienceFolderConceptId }
      ]) {
        await unlinkConceptFromSchemeIfPresent(plainClient, orgId, schemeId, conceptId)
      }

      for (const conceptId of [sourceComponentFolderConceptId, sourceExperienceFolderConceptId, destComponentFolderConceptId, destExperienceFolderConceptId]) {
        await deleteConceptIfPresent(plainClient, orgId, conceptId)
      }
    } finally {
      // Always delete both throwaway spaces, even if org-level concept/scheme cleanup
      // above failed - the resources are independent and one failing should not leak the other.
      await plainClient.space.delete({ spaceId: destinationSpaceId })
      await plainClient.space.delete({ spaceId: sourceSpaceId })
    }
  })

  test('creates a destination-scoped concept for the Component folder, copying the source prefLabel', async () => {
    const concept = await plainClient.concept.get({ organizationId: orgId, conceptId: destComponentFolderConceptId })
    expect(concept.prefLabel['en-US']).toBe(sourceComponentFolderLabel)
    expect(concept.metadata.spaces.some((s: any) => s.sys.id === destinationSpaceId)).toBe(true)
  })

  test('creates a destination-scoped concept for the Experience folder, copying the source prefLabel', async () => {
    const concept = await plainClient.concept.get({ organizationId: orgId, conceptId: destExperienceFolderConceptId })
    expect(concept.prefLabel['en-US']).toBe(`${TEST_PREFIX} Experience Folder`)
    expect(concept.metadata.spaces.some((s: any) => s.sys.id === destinationSpaceId)).toBe(true)
  })

  test('links each new concept into its parent folder-group scheme', async () => {
    const componentScheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: COMPONENT_TYPE_SCHEME_ID })
    expect(componentScheme.concepts.some((c: any) => c.sys.id === destComponentFolderConceptId)).toBe(true)

    const experienceScheme = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: EXPERIENCE_SCHEME_ID })
    expect(experienceScheme.concepts.some((c: any) => c.sys.id === destExperienceFolderConceptId)).toBe(true)
  })

  test('rewrites each entity\'s metadata.concepts to point at the new destination concept, not the source', async () => {
    const component = await plainClient.component.get({ spaceId: destinationSpaceId, environmentId, componentId: FOLDER_EXO_FIXTURE_IDS.componentId })
    expect(component.metadata.concepts[0].sys.id).toBe(destComponentFolderConceptId)

    const experience = await plainClient.experience.get({ spaceId: destinationSpaceId, environmentId, experienceId: FOLDER_EXO_FIXTURE_IDS.experienceId })
    expect(experience.metadata.concepts[0].sys.id).toBe(destExperienceFolderConceptId)
  })

  test('re-import is idempotent: no duplicate concept version bump or scheme link is created', async () => {
    const componentConceptBefore = await plainClient.concept.get({ organizationId: orgId, conceptId: destComponentFolderConceptId })
    const componentSchemeBefore = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: COMPONENT_TYPE_SCHEME_ID })
    const experienceConceptBefore = await plainClient.concept.get({ organizationId: orgId, conceptId: destExperienceFolderConceptId })
    const experienceSchemeBefore = await plainClient.conceptScheme.get({ organizationId: orgId, conceptSchemeId: EXPERIENCE_SCHEME_ID })

    const result = await runContentfulImport({
      spaceId: destinationSpaceId,
      environmentId,
      managementToken,
      content: buildExoFolderContent(FOLDER_EXO_FIXTURE_IDS, {
        component: sourceComponentFolderConceptId,
        experience: sourceExperienceFolderConceptId
      }, sourceSpaceId),
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

describeCrossOrg('Importing ExO folders across organizations', () => {
  let sourceSpaceId: string
  let destinationSpaceId: string
  let sourceClient: any
  let destinationClient: any
  let sourceComponentFolderConceptId: string
  let sourceExperienceFolderConceptId: string
  let destComponentFolderConceptId: string
  let destExperienceFolderConceptId: string

  beforeAll(async () => {
    sourceClient = createClient({ accessToken: managementToken })
    destinationClient = createClient({ accessToken: managementToken })

    const sourceSpace = await sourceClient.space.create(
      { organizationId: sourceOrganizationId },
      { name: 'IMPORT [AUTO] TOOL EXO CROSS-ORG SOURCE TMP' }
    )
    sourceSpaceId = sourceSpace.sys.id
    const destinationSpace = await destinationClient.space.create(
      { organizationId: orgId },
      { name: 'IMPORT [AUTO] TOOL EXO CROSS-ORG DESTINATION TMP' }
    )
    destinationSpaceId = destinationSpace.sys.id

    sourceComponentFolderConceptId = `contentful.folder-cross-org-component-${sourceSpaceId}`
    sourceExperienceFolderConceptId = `contentful.folder-cross-org-experience-${sourceSpaceId}`
    destComponentFolderConceptId = `${sourceComponentFolderConceptId}-${destinationSpaceId}`
    destExperienceFolderConceptId = `${sourceExperienceFolderConceptId}-${destinationSpaceId}`

    // The destination schemes are intentionally not created here. This suite
    // assumes the destination organization has already provisioned the required
    // platform schemes, matching the importer contract.
    await destinationClient.conceptScheme.get({
      organizationId: orgId,
      conceptSchemeId: COMPONENT_TYPE_SCHEME_ID
    })
    await destinationClient.conceptScheme.get({
      organizationId: orgId,
      conceptSchemeId: EXPERIENCE_SCHEME_ID
    })

    await sourceClient.concept.createWithId(
      { organizationId: sourceOrganizationId, conceptId: sourceComponentFolderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': `${TEST_PREFIX} Cross Org Component Folder` },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: sourceSpaceId } }] }
      }
    )
    await sourceClient.concept.createWithId(
      { organizationId: sourceOrganizationId, conceptId: sourceExperienceFolderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': `${TEST_PREFIX} Cross Org Experience Folder` },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: sourceSpaceId } }] }
      }
    )

    await runContentfulImport({
      spaceId: destinationSpaceId,
      environmentId,
      managementToken,
      content: buildExoFolderContent(FOLDER_EXO_FIXTURE_IDS, {
        component: sourceComponentFolderConceptId,
        experience: sourceExperienceFolderConceptId
      }, sourceSpaceId),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    try {
      if (destinationClient) {
        await unlinkConceptFromSchemeIfPresent(destinationClient, orgId, COMPONENT_TYPE_SCHEME_ID, destComponentFolderConceptId)
        await unlinkConceptFromSchemeIfPresent(destinationClient, orgId, EXPERIENCE_SCHEME_ID, destExperienceFolderConceptId)
        await deleteConceptIfPresent(destinationClient, orgId, destComponentFolderConceptId)
        await deleteConceptIfPresent(destinationClient, orgId, destExperienceFolderConceptId)
      }
      if (sourceClient) {
        await deleteConceptIfPresent(sourceClient, sourceOrganizationId as string, sourceComponentFolderConceptId)
        await deleteConceptIfPresent(sourceClient, sourceOrganizationId as string, sourceExperienceFolderConceptId)
      }
    } finally {
      if (destinationClient && destinationSpaceId) await destinationClient.space.delete({ spaceId: destinationSpaceId })
      if (sourceClient && sourceSpaceId) await sourceClient.space.delete({ spaceId: sourceSpaceId })
    }
  })

  test('copies source labels into destination-scoped concepts', async () => {
    const componentConcept = await destinationClient.concept.get({
      organizationId: orgId,
      conceptId: destComponentFolderConceptId
    })
    const experienceConcept = await destinationClient.concept.get({
      organizationId: orgId,
      conceptId: destExperienceFolderConceptId
    })

    expect(componentConcept.prefLabel['en-US']).toBe(`${TEST_PREFIX} Cross Org Component Folder`)
    expect(experienceConcept.prefLabel['en-US']).toBe(`${TEST_PREFIX} Cross Org Experience Folder`)
    expect(componentConcept.metadata.spaces.some((s: any) => s.sys.id === destinationSpaceId)).toBe(true)
    expect(experienceConcept.metadata.spaces.some((s: any) => s.sys.id === destinationSpaceId)).toBe(true)
  })

  test('links destination concepts into destination parent schemes', async () => {
    const componentScheme = await destinationClient.conceptScheme.get({
      organizationId: orgId,
      conceptSchemeId: COMPONENT_TYPE_SCHEME_ID
    })
    const experienceScheme = await destinationClient.conceptScheme.get({
      organizationId: orgId,
      conceptSchemeId: EXPERIENCE_SCHEME_ID
    })

    expect(componentScheme.concepts.some((c: any) => c.sys.id === destComponentFolderConceptId)).toBe(true)
    expect(experienceScheme.concepts.some((c: any) => c.sys.id === destExperienceFolderConceptId)).toBe(true)
  })

  test('rewrites destination ExO entity metadata to destination concept IDs', async () => {
    const component = await destinationClient.component.get({
      spaceId: destinationSpaceId,
      environmentId,
      componentId: FOLDER_EXO_FIXTURE_IDS.componentId
    })
    const experience = await destinationClient.experience.get({
      spaceId: destinationSpaceId,
      environmentId,
      experienceId: FOLDER_EXO_FIXTURE_IDS.experienceId
    })

    expect(component.metadata.concepts[0].sys.id).toBe(destComponentFolderConceptId)
    expect(experience.metadata.concepts[0].sys.id).toBe(destExperienceFolderConceptId)
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
    plainClient = createClient({ accessToken: managementToken })
    const space = await plainClient.space.create({ organizationId: orgId }, { name: 'IMPORT [AUTO] TOOL EXO FOLDER SAMESPACE TMP' })
    spaceId = space.sys.id
    folderConceptId = `contentful.folder-samespace-${spaceId}`

    await plainClient.concept.createWithId(
      { organizationId: orgId, conceptId: folderConceptId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': folderConceptId },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: spaceId } }] }
      }
    )
    await linkConceptToSchemeIfAbsent(plainClient, orgId, COMPONENT_TYPE_SCHEME_ID, folderConceptId)

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
        await unlinkConceptFromSchemeIfPresent(plainClient, orgId, schemeId, destConceptId)
      }

      await deleteConceptIfPresent(plainClient, orgId, destConceptId)
      await unlinkConceptFromSchemeIfPresent(plainClient, orgId, COMPONENT_TYPE_SCHEME_ID, folderConceptId)
      await deleteConceptIfPresent(plainClient, orgId, folderConceptId)
    } finally {
      await plainClient.space.delete({ spaceId })
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
