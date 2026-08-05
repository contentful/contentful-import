import {
  ensureParentFolderGroupsExist,
  deriveChildConceptMap,
  createOrPatchChildConcepts,
  linkChildConceptsToParentGroups,
  rewriteEntityFolderConcepts,
  importExoFolders,
  PARENT_FOLDER_GROUP_IDS,
} from '../../../lib/utils/import-exo-folders'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: { emit: jest.fn() },
}))

const SOURCE_SPACE = 'space-source'
const DEST_SPACE = 'space-dest'
const ORG = 'org-1'

function makeEntity(conceptIds: string[] = [], spaceId = SOURCE_SPACE) {
  return {
    sys: { space: { sys: { id: spaceId } } },
    metadata: {
      concepts: conceptIds.map((id) => ({ sys: { id, type: 'Link', linkType: 'TaxonomyConcept' } })),
    },
  } as any
}

function makeScheme(id: string, conceptIds: string[] = [], version = 1) {
  return {
    sys: { id, version },
    concepts: conceptIds.map((cid) => ({ sys: { id: cid, type: 'Link', linkType: 'TaxonomyConcept' } })),
  }
}

function makeConcept(id: string, { prefLabel = { 'en-US': id }, spaces = [] as string[], purpose = 'internal', version = 1 } = {}) {
  return {
    sys: { id, version },
    purpose,
    prefLabel,
    metadata: { spaces: spaces.map((spaceId) => ({ sys: { id: spaceId } })) },
  }
}

function makeClient({
  existingConcepts = new Map<string, any>(),
  existingSchemes = new Map<string, any>(),
}: {
  existingConcepts?: Map<string, any>
  existingSchemes?: Map<string, any>
} = {}) {
  return {
    concept: {
      get: jest.fn().mockImplementation(({ conceptId }: { conceptId: string }) => {
        const c = existingConcepts.get(conceptId)
        if (c) return Promise.resolve(c)
        const err: any = new Error('Not Found')
        err.status = 404
        return Promise.reject(err)
      }),
      createWithId: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
    },
    conceptScheme: {
      getMany: jest.fn().mockResolvedValue({ items: [...existingSchemes.values()] }),
      createWithId: jest.fn().mockImplementation(({ conceptSchemeId }: { conceptSchemeId: string }) =>
        Promise.resolve(makeScheme(conceptSchemeId))
      ),
      patch: jest.fn().mockImplementation(({ conceptSchemeId, version }: any) => {
        const scheme = existingSchemes.get(conceptSchemeId) ?? makeScheme(conceptSchemeId)
        return Promise.resolve({ ...scheme, sys: { ...scheme.sys, version: version + 1 } })
      }),
    },
  }
}

const ALL_PARENT_GROUPS: Map<string, any> = new Map(
  Object.values(PARENT_FOLDER_GROUP_IDS).map((id) => [id, makeScheme(id)])
)

afterEach(() => jest.clearAllMocks())

// ---------------------------------------------------------------------------
// Step 1: ensureParentFolderGroupsExist
// ---------------------------------------------------------------------------

describe('ensureParentFolderGroupsExist', () => {
  it('returns all 5 schemes when all exist', async () => {
    const client = makeClient({ existingSchemes: ALL_PARENT_GROUPS })
    const result = await ensureParentFolderGroupsExist(client, ORG)

    expect(result.size).toBe(5)
    expect(client.conceptScheme.createWithId).not.toHaveBeenCalled()
  })

  it('returns empty map when any parent group is missing', async () => {
    const partial = new Map([
      [PARENT_FOLDER_GROUP_IDS.designToken, makeScheme(PARENT_FOLDER_GROUP_IDS.designToken)],
      [PARENT_FOLDER_GROUP_IDS.componentType, makeScheme(PARENT_FOLDER_GROUP_IDS.componentType)],
    ])
    const client = makeClient({ existingSchemes: partial })
    const result = await ensureParentFolderGroupsExist(client, ORG)

    expect(result.size).toBe(0)
    expect(client.conceptScheme.createWithId).not.toHaveBeenCalled()
  })

  it('returns empty map when no parent groups exist', async () => {
    const client = makeClient()
    const result = await ensureParentFolderGroupsExist(client, ORG)

    expect(result.size).toBe(0)
  })

  it('filters out non-folder-group schemes from the result', async () => {
    const schemes: Map<string, any> = new Map(ALL_PARENT_GROUPS)
    schemes.set('some-other-scheme', makeScheme('some-other-scheme'))
    const client = makeClient({ existingSchemes: schemes })
    const result = await ensureParentFolderGroupsExist(client, ORG)

    expect(result.size).toBe(5)
    expect(result.has('some-other-scheme')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Step 2: deriveChildConceptMap
// ---------------------------------------------------------------------------

describe('deriveChildConceptMap', () => {
  it('returns empty map when source entities have no folder concepts', () => {
    const result = deriveChildConceptMap({ designTokens: [makeEntity(['tag-abc'])] }, DEST_SPACE)
    expect(result.size).toBe(0)
  })

  it('returns empty map when source entities are empty', () => {
    const result = deriveChildConceptMap({}, DEST_SPACE)
    expect(result.size).toBe(0)
  })

  it('derives deterministic destination concept ID', () => {
    const sourceId = 'contentful.folder-brand-colors-cBllAkZ9'
    const result = deriveChildConceptMap({ designTokens: [makeEntity([sourceId])] }, DEST_SPACE)

    expect(result.get(sourceId)?.destConceptId).toBe(`${sourceId}-${DEST_SPACE}`)
  })

  it('assigns correct parentGroupId per entity type', () => {
    const result = deriveChildConceptMap({
      designTokens: [makeEntity(['contentful.folder-a-AA'])],
      components: [makeEntity(['contentful.folder-b-BB'])],
      experienceTemplates: [makeEntity(['contentful.folder-c-CC'])],
      experienceFragments: [makeEntity(['contentful.folder-d-DD'])],
      experiences: [makeEntity(['contentful.folder-e-EE'])],
    }, DEST_SPACE)

    expect(result.get('contentful.folder-a-AA')?.parentGroupId).toBe(PARENT_FOLDER_GROUP_IDS.designToken)
    expect(result.get('contentful.folder-b-BB')?.parentGroupId).toBe(PARENT_FOLDER_GROUP_IDS.componentType)
    expect(result.get('contentful.folder-c-CC')?.parentGroupId).toBe(PARENT_FOLDER_GROUP_IDS.template)
    expect(result.get('contentful.folder-d-DD')?.parentGroupId).toBe(PARENT_FOLDER_GROUP_IDS.fragment)
    expect(result.get('contentful.folder-e-EE')?.parentGroupId).toBe(PARENT_FOLDER_GROUP_IDS.experience)
  })

  it('deduplicates the same concept ID across entity types', () => {
    const sharedId = 'contentful.folder-shared-ABC'
    const result = deriveChildConceptMap({
      designTokens: [makeEntity([sharedId])],
      components: [makeEntity([sharedId])],
      experiences: [makeEntity([sharedId])],
    }, DEST_SPACE)

    expect(result.size).toBe(1)
  })

  it('ignores non-folder-prefixed concepts', () => {
    const result = deriveChildConceptMap({
      components: [makeEntity(['tag-abc', 'contentful.folder-hero-XYZ', 'category-def'])],
    }, DEST_SPACE)

    expect(result.size).toBe(1)
    expect(result.has('contentful.folder-hero-XYZ')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Step 3: createOrPatchChildConcepts
// ---------------------------------------------------------------------------

describe('createOrPatchChildConcepts', () => {
  it('creates a new concept with purpose, prefLabel, and space link', async () => {
    const sourceId = 'contentful.folder-brand-colors-cBllAkZ9'
    const destId = `${sourceId}-${DEST_SPACE}`
    const sourceConcept = makeConcept(sourceId, { prefLabel: { 'en-US': 'Brand Colors' } })
    const client = makeClient({ existingConcepts: new Map([[sourceId, sourceConcept]]) })

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).toHaveBeenCalledWith(
      { organizationId: ORG, conceptId: destId },
      {
        purpose: 'internal',
        prefLabel: { 'en-US': 'Brand Colors' },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: DEST_SPACE } }] },
      }
    )
  })

  it('falls back to destConceptId as prefLabel when source concept fetch fails', async () => {
    const sourceId = 'contentful.folder-missing-src-AA'
    const destId = `${sourceId}-${DEST_SPACE}`
    const client = makeClient()

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ prefLabel: { 'en-US': destId } })
    )
  })

  it('patches purpose when existing concept is missing it', async () => {
    const sourceId = 'contentful.folder-a-AA'
    const destId = `${sourceId}-${DEST_SPACE}`
    const existing = makeConcept(destId, { purpose: 'extension', spaces: [DEST_SPACE] })
    const client = makeClient({ existingConcepts: new Map([[destId, existing]]) })

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).not.toHaveBeenCalled()
    expect(client.concept.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: destId }),
      expect.arrayContaining([{ op: 'add', path: '/purpose', value: 'internal' }])
    )
  })

  it('patches space link when existing concept is missing destination space', async () => {
    const sourceId = 'contentful.folder-a-AA'
    const destId = `${sourceId}-${DEST_SPACE}`
    const existing = makeConcept(destId, { spaces: ['some-other-space'] })
    const client = makeClient({ existingConcepts: new Map([[destId, existing]]) })

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).not.toHaveBeenCalled()
    expect(client.concept.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptId: destId }),
      expect.arrayContaining([
        { op: 'add', path: '/metadata/spaces/-', value: { sys: { type: 'Link', linkType: 'Space', id: DEST_SPACE } } },
      ])
    )
  })

  it('patches both purpose and space in a single call when both are missing', async () => {
    const sourceId = 'contentful.folder-a-AA'
    const destId = `${sourceId}-${DEST_SPACE}`
    const existing = makeConcept(destId, { purpose: 'extension', spaces: [] })
    const client = makeClient({ existingConcepts: new Map([[destId, existing]]) })

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.patch).toHaveBeenCalledTimes(1)
    const patches = client.concept.patch.mock.calls[0][1]
    expect(patches).toHaveLength(2)
  })

  it('does not patch when existing concept is already up to date', async () => {
    const sourceId = 'contentful.folder-a-AA'
    const destId = `${sourceId}-${DEST_SPACE}`
    const existing = makeConcept(destId, { spaces: [DEST_SPACE] })
    const client = makeClient({ existingConcepts: new Map([[destId, existing]]) })

    const childConceptMap = new Map([[sourceId, { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).not.toHaveBeenCalled()
    expect(client.concept.patch).not.toHaveBeenCalled()
  })

  it('logs a warning and continues when createWithId fails', async () => {
    const client = makeClient()
    client.concept.createWithId
      .mockRejectedValueOnce(new Error('create failed'))
      .mockResolvedValue({})

    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: `contentful.folder-a-AA-${DEST_SPACE}`, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
      ['contentful.folder-b-BB', { destConceptId: `contentful.folder-b-BB-${DEST_SPACE}`, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await createOrPatchChildConcepts(client, ORG, DEST_SPACE, childConceptMap)

    expect(client.concept.createWithId).toHaveBeenCalledTimes(2)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Failed to create child folder concept'))
  })
})

// ---------------------------------------------------------------------------
// Step 4: linkChildConceptsToParentGroups
// ---------------------------------------------------------------------------

describe('linkChildConceptsToParentGroups', () => {
  it('links a child concept to its parent group', async () => {
    const destId = `contentful.folder-a-AA-${DEST_SPACE}`
    const parentGroups = new Map(ALL_PARENT_GROUPS)
    const client = makeClient()

    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await linkChildConceptsToParentGroups(client, ORG, childConceptMap, parentGroups)

    expect(client.conceptScheme.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: PARENT_FOLDER_GROUP_IDS.designToken }),
      [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: destId } } }]
    )
  })

  it('skips linking when concept is already in the scheme', async () => {
    const destId = `contentful.folder-a-AA-${DEST_SPACE}`
    const parentGroups = new Map([
      [PARENT_FOLDER_GROUP_IDS.designToken, makeScheme(PARENT_FOLDER_GROUP_IDS.designToken, [destId])],
    ])
    const client = makeClient()

    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await linkChildConceptsToParentGroups(client, ORG, childConceptMap, parentGroups)

    expect(client.conceptScheme.patch).not.toHaveBeenCalled()
  })

  it('keeps scheme version current across multiple patches to the same scheme', async () => {
    const destId1 = `contentful.folder-a-AA-${DEST_SPACE}`
    const destId2 = `contentful.folder-b-BB-${DEST_SPACE}`
    const parentGroups = new Map([[PARENT_FOLDER_GROUP_IDS.designToken, makeScheme(PARENT_FOLDER_GROUP_IDS.designToken, [], 1)]])
    const client = makeClient()

    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: destId1, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
      ['contentful.folder-b-BB', { destConceptId: destId2, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await linkChildConceptsToParentGroups(client, ORG, childConceptMap, parentGroups)

    const calls = client.conceptScheme.patch.mock.calls
    expect(calls[0][0].version).toBe(1)
    expect(calls[1][0].version).toBe(2) // incremented after first patch
  })

  it('skips when parentGroup is not in the map', async () => {
    const client = makeClient()
    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: `contentful.folder-a-AA-${DEST_SPACE}`, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await linkChildConceptsToParentGroups(client, ORG, childConceptMap, new Map())

    expect(client.conceptScheme.patch).not.toHaveBeenCalled()
  })

  it('logs warning and continues when patch fails', async () => {
    const client = makeClient()
    client.conceptScheme.patch.mockRejectedValueOnce(new Error('patch failed'))

    const destId = `contentful.folder-a-AA-${DEST_SPACE}`
    const parentGroups = new Map([[PARENT_FOLDER_GROUP_IDS.designToken, makeScheme(PARENT_FOLDER_GROUP_IDS.designToken)]])
    const childConceptMap = new Map([
      ['contentful.folder-a-AA', { destConceptId: destId, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }],
    ])
    await linkChildConceptsToParentGroups(client, ORG, childConceptMap, parentGroups)

    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Failed to link child concept'))
  })
})

// ---------------------------------------------------------------------------
// Step 5: rewriteEntityFolderConcepts
// ---------------------------------------------------------------------------

describe('rewriteEntityFolderConcepts', () => {
  function makeChildConceptMap(entries: [string, string][]) {
    return new Map(entries.map(([src, dest]) => [src, { destConceptId: dest, parentGroupId: PARENT_FOLDER_GROUP_IDS.designToken }]))
  }

  it('rewrites folder concept IDs in entity metadata', () => {
    const sourceId = 'contentful.folder-brand-colors-cBllAkZ9'
    const destId = `${sourceId}-${DEST_SPACE}`
    const entity = makeEntity([sourceId, 'some-non-folder-tag'])

    rewriteEntityFolderConcepts([entity], makeChildConceptMap([[sourceId, destId]]))

    expect(entity.metadata.concepts[0].sys.id).toBe(destId)
    expect(entity.metadata.concepts[1].sys.id).toBe('some-non-folder-tag')
  })

  it('leaves entities without metadata untouched', () => {
    const entity = { sys: {} } as any
    rewriteEntityFolderConcepts([entity], makeChildConceptMap([['contentful.folder-a-AA', 'dest']]))
    expect(entity.metadata).toBeUndefined()
  })

  it('does nothing when the map is empty', () => {
    const entity = makeEntity(['contentful.folder-abc-XYZ'])
    rewriteEntityFolderConcepts([entity], new Map())
    expect(entity.metadata.concepts[0].sys.id).toBe('contentful.folder-abc-XYZ')
  })

  it('rewrites concepts across multiple entities', () => {
    const e1 = makeEntity(['contentful.folder-a-AA'])
    const e2 = makeEntity(['contentful.folder-b-BB'])
    rewriteEntityFolderConcepts([e1, e2], makeChildConceptMap([
      ['contentful.folder-a-AA', 'contentful.folder-a-AA-dest'],
      ['contentful.folder-b-BB', 'contentful.folder-b-BB-dest'],
    ]))

    expect(e1.metadata.concepts[0].sys.id).toBe('contentful.folder-a-AA-dest')
    expect(e2.metadata.concepts[0].sys.id).toBe('contentful.folder-b-BB-dest')
  })
})

// ---------------------------------------------------------------------------
// Orchestrator: importExoFolders
// ---------------------------------------------------------------------------

describe('importExoFolders', () => {
  const BASE_ARGS = { organizationId: ORG, destinationSpaceId: DEST_SPACE }

  it('skips all work when source and destination space are the same', async () => {
    const client = makeClient({ existingSchemes: ALL_PARENT_GROUPS })
    await importExoFolders({
      plainClient: client,
      ...BASE_ARGS,
      destinationSpaceId: SOURCE_SPACE,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-a-AA'])] },
    })

    expect(client.conceptScheme.getMany).not.toHaveBeenCalled()
    expect(logEmitter.emit).toHaveBeenCalledWith('info', expect.stringContaining('same'))
  })

  it('skips concept work when no folder concepts are referenced', async () => {
    const client = makeClient({ existingSchemes: ALL_PARENT_GROUPS })
    await importExoFolders({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['tag-abc'])] },
    })

    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('rejects when parent groups are missing', async () => {
    const client = makeClient()
    await expect(
      importExoFolders({
        plainClient: client,
        ...BASE_ARGS,
        sourceEntities: { designTokens: [makeEntity(['contentful.folder-a-AA'])] },
      })
    ).rejects.toThrow()
  })

  it('runs all steps in sequence: creates concept, links to scheme, rewrites entity metadata', async () => {
    const sourceId = 'contentful.folder-brand-colors-cBllAkZ9'
    const destId = `${sourceId}-${DEST_SPACE}`
    const sourceConcept = makeConcept(sourceId, { prefLabel: { 'en-US': 'Brand Colors' } })
    const client = makeClient({
      existingSchemes: ALL_PARENT_GROUPS,
      existingConcepts: new Map([[sourceId, sourceConcept]]),
    })
    const entity = makeEntity([sourceId])

    await importExoFolders({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [entity] },
    })

    // Step 3: created the dest concept
    expect(client.concept.createWithId).toHaveBeenCalledWith(
      { organizationId: ORG, conceptId: destId },
      expect.objectContaining({ purpose: 'internal', prefLabel: { 'en-US': 'Brand Colors' } })
    )
    // Step 4: linked to parent group
    expect(client.conceptScheme.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: PARENT_FOLDER_GROUP_IDS.designToken }),
      expect.arrayContaining([expect.objectContaining({ value: expect.objectContaining({ sys: expect.objectContaining({ id: destId }) }) })])
    )
    // Step 5: entity metadata rewritten in-place
    expect(entity.metadata.concepts[0].sys.id).toBe(destId)
  })
})
