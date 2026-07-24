import { ensureFolderConcepts, ensureExoConceptSchemes, rewriteEntityFolderConcepts, EXO_FOLDER_SCHEME_IDS } from '../../../lib/utils/ensure-folder-concepts'
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
      patch: jest.fn().mockImplementation(({ conceptSchemeId, version }: any, ops: any[]) => {
        const scheme = existingSchemes.get(conceptSchemeId) ?? makeScheme(conceptSchemeId)
        const updated = { ...scheme, sys: { ...scheme.sys, version: version + 1 } }
        return Promise.resolve(updated)
      }),
    },
  }
}

const ALL_SCHEMES = Object.values(EXO_FOLDER_SCHEME_IDS).map((id) => makeScheme(id))

const BASE_ARGS = { organizationId: ORG, destinationSpaceId: DEST_SPACE }

afterEach(() => jest.clearAllMocks())

// ---------------------------------------------------------------------------
// ensureExoConceptSchemes
// ---------------------------------------------------------------------------

describe('ensureExoConceptSchemes', () => {
  it('returns existing schemes without creating anything', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    const result = await ensureExoConceptSchemes(client, ORG, DEST_SPACE)

    expect(result.size).toBe(5)
    expect(client.conceptScheme.createWithId).not.toHaveBeenCalled()
  })

  it('creates missing schemes scoped to the destination space', async () => {
    const client = makeClient()
    const result = await ensureExoConceptSchemes(client, ORG, DEST_SPACE)

    expect(client.conceptScheme.createWithId).toHaveBeenCalledTimes(5)
    expect(client.conceptScheme.createWithId).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: EXO_FOLDER_SCHEME_IDS.template }),
      expect.objectContaining({
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: DEST_SPACE } }] },
      })
    )
    expect(result.size).toBe(5)
  })

  it('creates only missing schemes, leaves existing ones untouched', async () => {
    const existingSchemes = new Map([
      [EXO_FOLDER_SCHEME_IDS.template, makeScheme(EXO_FOLDER_SCHEME_IDS.template)],
    ])
    const client = makeClient({ existingSchemes })
    await ensureExoConceptSchemes(client, ORG, DEST_SPACE)

    expect(client.conceptScheme.createWithId).toHaveBeenCalledTimes(4)
    expect(client.conceptScheme.createWithId).not.toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: EXO_FOLDER_SCHEME_IDS.template }),
      expect.anything()
    )
  })

  it('continues when a scheme creation fails', async () => {
    const client = makeClient()
    client.conceptScheme.createWithId
      .mockRejectedValueOnce(new Error('create failed'))
      .mockResolvedValue(makeScheme('x'))

    const result = await ensureExoConceptSchemes(client, ORG, DEST_SPACE)

    expect(client.conceptScheme.createWithId).toHaveBeenCalledTimes(5)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Failed to create ExO folder scheme'))
    expect(result.size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// ensureFolderConcepts
// ---------------------------------------------------------------------------

describe('ensureFolderConcepts', () => {
  it('returns empty map when there are no source entities', async () => {
    const client = makeClient({ existingSchemes: new Map(ALL_SCHEMES.map((s) => [s.sys.id, s])) })
    const result = await ensureFolderConcepts({ plainClient: client, ...BASE_ARGS, sourceEntities: {} })
    expect(result.size).toBe(0)
    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('returns empty map when entities have no metadata concepts', async () => {
    const client = makeClient({ existingSchemes: new Map(ALL_SCHEMES.map((s) => [s.sys.id, s])) })
    const result = await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [{ sys: { space: { sys: { id: SOURCE_SPACE } } }, metadata: { concepts: [] } } as any] },
    })
    expect(result.size).toBe(0)
    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('returns empty map when no concepts have the contentful.folder- prefix', async () => {
    const client = makeClient({ existingSchemes: new Map(ALL_SCHEMES.map((s) => [s.sys.id, s])) })
    const result = await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { componentTypes: [makeEntity(['tag-abc', 'category-xyz'])] },
    })
    expect(result.size).toBe(0)
    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('short-circuits when source and destination space are the same', async () => {
    const client = makeClient({ existingSchemes: new Map(ALL_SCHEMES.map((s) => [s.sys.id, s])) })
    const result = await ensureFolderConcepts({
      plainClient: client,
      organizationId: ORG,
      destinationSpaceId: SOURCE_SPACE,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-abc'])] },
    })
    expect(result.size).toBe(0)
    expect(client.concept.get).not.toHaveBeenCalled()
    expect(logEmitter.emit).toHaveBeenCalledWith('info', expect.stringContaining('same'))
  })

  it('creates a new destination-scoped concept when it does not exist', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    const result = await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-brand-colors-cBllAkZ9'])] },
    })

    const destId = `contentful.folder-brand-colors-cBllAkZ9-${DEST_SPACE}`
    expect(client.concept.get).toHaveBeenCalledWith({ organizationId: ORG, conceptId: destId })
    expect(client.concept.createWithId).toHaveBeenCalledWith(
      { organizationId: ORG, conceptId: destId },
      expect.objectContaining({
        prefLabel: { 'en-US': destId },
        metadata: { spaces: [{ sys: { type: 'Link', linkType: 'Space', id: DEST_SPACE } }] },
      })
    )
    expect(result.get('contentful.folder-brand-colors-cBllAkZ9')).toBe(destId)
  })

  it('adds the new concept to its folder group scheme', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-brand-colors-cBllAkZ9'])] },
    })

    const destId = `contentful.folder-brand-colors-cBllAkZ9-${DEST_SPACE}`
    expect(client.conceptScheme.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: EXO_FOLDER_SCHEME_IDS.designToken }),
      [{ op: 'add', path: '/concepts/-', value: { sys: { type: 'Link', linkType: 'TaxonomyConcept', id: destId } } }]
    )
  })

  it('links concept to the correct scheme based on entity type', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        templates: [makeEntity(['contentful.folder-hero-oCb0hRDU'])],
        experiences: [makeEntity(['contentful.folder-prototype-2pS5TwVK'])],
      },
    })

    const templateDestId = `contentful.folder-hero-oCb0hRDU-${DEST_SPACE}`
    const experienceDestId = `contentful.folder-prototype-2pS5TwVK-${DEST_SPACE}`
    expect(client.conceptScheme.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: EXO_FOLDER_SCHEME_IDS.template }),
      expect.arrayContaining([expect.objectContaining({ value: expect.objectContaining({ sys: expect.objectContaining({ id: templateDestId }) }) })])
    )
    expect(client.conceptScheme.patch).toHaveBeenCalledWith(
      expect.objectContaining({ conceptSchemeId: EXO_FOLDER_SCHEME_IDS.experience }),
      expect.arrayContaining([expect.objectContaining({ value: expect.objectContaining({ sys: expect.objectContaining({ id: experienceDestId }) }) })])
    )
  })

  it('skips scheme patch when concept is already in the scheme', async () => {
    const destId = `contentful.folder-brand-colors-cBllAkZ9-${DEST_SPACE}`
    const schemeWithConcept = makeScheme(EXO_FOLDER_SCHEME_IDS.designToken, [destId])
    const existingSchemes = new Map([
      ...ALL_SCHEMES.map((s) => [s.sys.id, s] as [string, any]),
      [EXO_FOLDER_SCHEME_IDS.designToken, schemeWithConcept],
    ])
    const existingConcepts = new Map([[destId, { sys: { id: destId, version: 1 }, metadata: { spaces: [{ sys: { id: DEST_SPACE } }] } }]])
    const client = makeClient({ existingConcepts, existingSchemes })

    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-brand-colors-cBllAkZ9'])] },
    })

    expect(client.conceptScheme.patch).not.toHaveBeenCalled()
  })

  it('patches space link when concept exists but is missing the destination space', async () => {
    const destId = `contentful.folder-brand-colors-cBllAkZ9-${DEST_SPACE}`
    const existingConcepts = new Map([[destId, { sys: { id: destId, version: 2 }, metadata: { spaces: [] } }]])
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingConcepts, existingSchemes })

    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-brand-colors-cBllAkZ9'])] },
    })

    expect(client.concept.createWithId).not.toHaveBeenCalled()
    expect(client.concept.patch).toHaveBeenCalledWith(
      { organizationId: ORG, conceptId: destId, version: 2 },
      [{ op: 'add', path: '/metadata/spaces/-', value: { sys: { type: 'Link', linkType: 'Space', id: DEST_SPACE } } }]
    )
  })

  it('skips concept already linked to the destination space', async () => {
    const destId = `contentful.folder-brand-colors-cBllAkZ9-${DEST_SPACE}`
    const existingConcepts = new Map([[destId, { sys: { id: destId, version: 1 }, metadata: { spaces: [{ sys: { id: DEST_SPACE } }] } }]])
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingConcepts, existingSchemes })

    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [makeEntity(['contentful.folder-brand-colors-cBllAkZ9'])] },
    })

    expect(client.concept.createWithId).not.toHaveBeenCalled()
    expect(client.concept.patch).not.toHaveBeenCalled()
  })

  it('deduplicates folder concept IDs across entity types', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['contentful.folder-shared-ABC'])],
        componentTypes: [makeEntity(['contentful.folder-shared-ABC'])],
        templates: [makeEntity(['contentful.folder-shared-ABC'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(1)
    expect(client.concept.createWithId).toHaveBeenCalledTimes(1)
  })

  it('collects folder concepts across all entity types', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['contentful.folder-a-AA'])],
        componentTypes: [makeEntity(['contentful.folder-b-BB'])],
        templates: [makeEntity(['contentful.folder-c-CC'])],
        fragments: [makeEntity(['contentful.folder-d-DD'])],
        experiences: [makeEntity(['contentful.folder-e-EE'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(5)
    expect(client.concept.createWithId).toHaveBeenCalledTimes(5)
  })

  it('continues processing remaining concepts when get() fails with non-404 error', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    client.concept.get
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }))
      .mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))

    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['contentful.folder-bad-XX'])],
        componentTypes: [makeEntity(['contentful.folder-good-YY'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(2)
    expect(client.concept.createWithId).toHaveBeenCalledTimes(1)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Could not fetch destination folder concept'))
  })

  it('continues processing remaining concepts when createWithId() fails', async () => {
    const existingSchemes = new Map(ALL_SCHEMES.map((s) => [s.sys.id, s]))
    const client = makeClient({ existingSchemes })
    client.concept.createWithId
      .mockRejectedValueOnce(new Error('create failed'))
      .mockResolvedValue({})

    await ensureFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['contentful.folder-a-AA'])],
        componentTypes: [makeEntity(['contentful.folder-b-BB'])],
      },
    })

    expect(client.concept.createWithId).toHaveBeenCalledTimes(2)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Failed to create folder concept'))
  })
})

// ---------------------------------------------------------------------------
// rewriteEntityFolderConcepts
// ---------------------------------------------------------------------------

describe('rewriteEntityFolderConcepts', () => {
  it('rewrites folder concept IDs in entity metadata', () => {
    const sourceId = 'contentful.folder-brand-colors-cBllAkZ9'
    const destId = `${sourceId}-${DEST_SPACE}`
    const entity = makeEntity([sourceId, 'some-non-folder-tag'])
    rewriteEntityFolderConcepts([entity], new Map([[sourceId, destId]]))

    expect(entity.metadata.concepts[0].sys.id).toBe(destId)
    expect(entity.metadata.concepts[1].sys.id).toBe('some-non-folder-tag')
  })

  it('leaves entities without metadata untouched', () => {
    const entity = { sys: {} } as any
    rewriteEntityFolderConcepts([entity], new Map([['contentful.folder-a-AA', 'contentful.folder-a-AA-dest']]))
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
    const map = new Map([
      ['contentful.folder-a-AA', 'contentful.folder-a-AA-dest'],
      ['contentful.folder-b-BB', 'contentful.folder-b-BB-dest'],
    ])
    rewriteEntityFolderConcepts([e1, e2], map)
    expect(e1.metadata.concepts[0].sys.id).toBe('contentful.folder-a-AA-dest')
    expect(e2.metadata.concepts[0].sys.id).toBe('contentful.folder-b-BB-dest')
  })
})
