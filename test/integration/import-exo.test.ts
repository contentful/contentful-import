import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/index'
import { buildExoContent, buildUnpublishedComponentContent, EXO_FIXTURE_IDS } from './utils/exo.utils'

const managementToken = process.env.MANAGEMENT_TOKEN as string
const orgId = process.env.ORG_ID as string
const environmentId = 'master'

jest.setTimeout(2 * 60 * 1000) // 2min timeout - covers space create/delete + 6 ExO entity types + publish

// Each describe block below creates its own throwaway space (same pattern as
// import-lib.test.ts) and deletes it in afterAll.

// Covers: "Import of an ExO export file creates all 6 entity types in destination",
// "URN rewriting: cross-space import produces valid URNs pointing to destination space/env",
// and "Publish state is preserved" - one import run, multiple assertions, since all three
// ACs are properties of the same operation rather than independent scenarios.
describe('Importing an ExO export with all 6 entity types', () => {
  let spaceId: string
  let plainClient

  beforeAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.createSpace({ name: 'IMPORT [AUTO] TOOL EXO TMP' }, orgId)
    spaceId = space.sys.id
    plainClient = createClient({ accessToken: managementToken })

    await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildExoContent(EXO_FIXTURE_IDS),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.getSpace(spaceId)
    await space.delete()
  })

  test('creates the DesignToken', async () => {
    const designToken = await plainClient.designToken.get({ spaceId, environmentId, designTokenId: EXO_FIXTURE_IDS.designTokenId })
    expect(designToken.sys.type).toBe('DesignToken')
    expect(designToken.type).toBe('DTCG.Color')
  })

  test('creates and publishes the Component', async () => {
    const component = await plainClient.component.get({ spaceId, environmentId, componentId: EXO_FIXTURE_IDS.componentId })
    expect(component.sys.type).toBe('Component')
    expect(component.sys.publishedVersion).toBeDefined()
  })

  test('creates the DataAssembly as draft', async () => {
    const dataAssembly = await plainClient.dataAssembly.get({ spaceId, environmentId, dataAssemblyId: EXO_FIXTURE_IDS.dataAssemblyId })
    expect(dataAssembly.sys.type).toBe('DataAssembly')
    expect(dataAssembly.sys.publishedVersion).toBeUndefined()
  })

  test('creates and publishes the ExperienceTemplate', async () => {
    const experienceTemplate = await plainClient.experienceTemplate.get({ spaceId, environmentId, experienceTemplateId: EXO_FIXTURE_IDS.experienceTemplateId })
    expect(experienceTemplate.sys.type).toBe('ExperienceTemplate')
    expect(experienceTemplate.sys.publishedVersion).toBeDefined()
  })

  test('creates the ExperienceFragment as draft, with its Component reference intact', async () => {
    const fragment = await plainClient.experienceFragment.get({ spaceId, environmentId, experienceFragmentId: EXO_FIXTURE_IDS.experienceFragmentId })
    expect(fragment.sys.type).toBe('ExperienceFragment')
    expect(fragment.sys.publishedVersion).toBeUndefined()

    // URN stays $self-relative (no rewriting) and still resolves to the sibling Component
    // that was imported alongside it, in this same destination space/environment.
    expect(fragment.sys.component.sys.urn).toBe(
      `crn:contentful:::experience:spaces/$self/environments/$self/components/${EXO_FIXTURE_IDS.componentId}`
    )
    const referencedComponent = await plainClient.component.get({ spaceId, environmentId, componentId: EXO_FIXTURE_IDS.componentId })
    expect(referencedComponent.sys.id).toBe(EXO_FIXTURE_IDS.componentId)
  })

  test('creates and publishes the Experience, with its ExperienceTemplate reference intact', async () => {
    const experience = await plainClient.experience.get({ spaceId, environmentId, experienceId: EXO_FIXTURE_IDS.experienceId })
    expect(experience.sys.type).toBe('Experience')
    expect(experience.sys.publishedVersion).toBeDefined()

    expect(experience.sys.experienceTemplate.sys.urn).toBe(
      `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${EXO_FIXTURE_IDS.experienceTemplateId}`
    )
    const referencedTemplate = await plainClient.experienceTemplate.get({ spaceId, environmentId, experienceTemplateId: EXO_FIXTURE_IDS.experienceTemplateId })
    expect(referencedTemplate.sys.id).toBe(EXO_FIXTURE_IDS.experienceTemplateId)
  })

  // Both tests below run after the six above and re-import into the same space, exercising
  // the UPDATE path (not covered elsewhere in this file) - guards against two real bugs
  // AIS-385 found that only surfaced against the live API, not mocks: sending an immutable
  // field on UPDATE 400ing, and unpublish never propagating on re-import.

  test('re-imports the same content again without error', async () => {
    const result = await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildExoContent(EXO_FIXTURE_IDS),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })

    expect(result).toBeDefined()
  })

  test('propagates an unpublish from source to destination on re-import', async () => {
    await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildUnpublishedComponentContent(EXO_FIXTURE_IDS),
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })

    const component = await plainClient.component.get({ spaceId, environmentId, componentId: EXO_FIXTURE_IDS.componentId })
    expect(component.sys.publishedVersion).toBeUndefined()
  })
})

// Covers: "skipExperienceOrchestration: true skips all ExO tasks even when source file has
// ExO data" - the ticket names a flag that doesn't exist; the real way to skip ExO tasks is
// to explicitly pass includeExperienceOrchestration: false (it now defaults to true, so
// leaving it unset no longer skips ExO tasks).
describe('Importing with includeExperienceOrchestration: false', () => {
  let spaceId: string
  let plainClient

  beforeAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.createSpace({ name: 'IMPORT [AUTO] TOOL EXO SKIP TMP' }, orgId)
    spaceId = space.sys.id
    plainClient = createClient({ accessToken: managementToken })
  })

  afterAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.getSpace(spaceId)
    await space.delete()
  })

  test('does not create any ExO entities even though the source file has ExO data', async () => {
    await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: buildExoContent(EXO_FIXTURE_IDS),
      includeExperienceOrchestration: false,
      useVerboseRenderer: true
    })

    await expect(
      plainClient.component.get({ spaceId, environmentId, componentId: EXO_FIXTURE_IDS.componentId })
    ).rejects.toThrow('The resource could not be found')
  })
})

// Covers: "Import of an old export file (no ExO arrays) completes without errors"
describe('Importing a legacy export file with no ExO entity arrays', () => {
  let spaceId: string

  beforeAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.createSpace({ name: 'IMPORT [AUTO] TOOL EXO LEGACY TMP' }, orgId)
    spaceId = space.sys.id
  })

  afterAll(async () => {
    const legacyClient = createClient({ accessToken: managementToken }, { type: 'legacy' })
    const space = await legacyClient.getSpace(spaceId)
    await space.delete()
  })

  test('completes without error', async () => {
    // If this rejects, Jest fails the test - that IS the "completes without errors" assertion.
    const result = await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: {},
      includeExperienceOrchestration: true,
      useVerboseRenderer: true
    })

    expect(result).toBeDefined()
  })
})
