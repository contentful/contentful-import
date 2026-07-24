import { patchFolderConcepts } from '../../../lib/utils/patch-folder-concepts'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: { emit: jest.fn() },
}))

function makeEntity(conceptIds: string[] = []) {
  return {
    metadata: {
      concepts: conceptIds.map((id) => ({ sys: { id } })),
    },
  } as any
}

function makeClient({ spaces = [] }: { spaces?: Array<{ sys: { id: string } }> } = {}) {
  return {
    concept: {
      get: jest.fn().mockResolvedValue({
        sys: { id: 'folder-1', version: 3 },
        metadata: { spaces },
      }),
      patch: jest.fn().mockResolvedValue({}),
    },
  }
}

const BASE_ARGS = {
  organizationId: 'org-1',
  spaceId: 'space-dest',
}

afterEach(() => jest.clearAllMocks())

describe('patchFolderConcepts', () => {
  it('does nothing when there are no source entities', async () => {
    const client = makeClient()
    await patchFolderConcepts({ plainClient: client, ...BASE_ARGS, sourceEntities: {} })
    expect(client.concept.get).not.toHaveBeenCalled()
    expect(client.concept.patch).not.toHaveBeenCalled()
  })

  it('does nothing when entities have no metadata concepts', async () => {
    const client = makeClient()
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { designTokens: [{ metadata: { concepts: [] } } as any] },
    })
    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('does nothing when no concepts have the folder- prefix', async () => {
    const client = makeClient()
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        componentTypes: [makeEntity(['tag-abc', 'category-xyz'])],
      },
    })
    expect(client.concept.get).not.toHaveBeenCalled()
  })

  it('patches a folder concept not yet linked to the destination space', async () => {
    const client = makeClient({ spaces: [] })
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['folder-abc'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledWith({
      organizationId: 'org-1',
      conceptId: 'folder-abc',
    })
    expect(client.concept.patch).toHaveBeenCalledWith(
      { organizationId: 'org-1', conceptId: 'folder-abc', version: 3 },
      [{ op: 'add', path: '/metadata/spaces/-', value: { sys: { type: 'Link', linkType: 'Space', id: 'space-dest' } } }]
    )
  })

  it('skips a folder concept already linked to the destination space', async () => {
    const client = makeClient({ spaces: [{ sys: { id: 'space-dest' } }] })
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: { fragments: [makeEntity(['folder-abc'])] },
    })

    expect(client.concept.get).toHaveBeenCalled()
    expect(client.concept.patch).not.toHaveBeenCalled()
  })

  it('deduplicates folder concept IDs across entity types', async () => {
    const client = makeClient({ spaces: [] })
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['folder-shared'])],
        componentTypes: [makeEntity(['folder-shared'])],
        templates: [makeEntity(['folder-shared'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(1)
    expect(client.concept.patch).toHaveBeenCalledTimes(1)
  })

  it('collects folder concepts across all entity types', async () => {
    const client = makeClient({ spaces: [] })
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['folder-a'])],
        componentTypes: [makeEntity(['folder-b'])],
        templates: [makeEntity(['folder-c'])],
        fragments: [makeEntity(['folder-d'])],
        experiences: [makeEntity(['folder-e'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(5)
    expect(client.concept.patch).toHaveBeenCalledTimes(5)
  })

  it('continues processing remaining concepts when get() fails for one', async () => {
    const client = {
      concept: {
        get: jest.fn()
          .mockRejectedValueOnce(new Error('not found'))
          .mockResolvedValue({ sys: { id: 'folder-b', version: 1 }, metadata: { spaces: [] } }),
        patch: jest.fn().mockResolvedValue({}),
      },
    }
    // Use two distinct entities so concept IDs are deterministically separate
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['folder-bad'])],
        componentTypes: [makeEntity(['folder-good'])],
      },
    })

    expect(client.concept.get).toHaveBeenCalledTimes(2)
    expect(client.concept.patch).toHaveBeenCalledTimes(1)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Could not fetch folder concept'))
  })

  it('continues processing remaining concepts when patch() fails for one', async () => {
    const client = {
      concept: {
        get: jest.fn()
          .mockResolvedValueOnce({ sys: { id: 'folder-a', version: 1 }, metadata: { spaces: [] } })
          .mockResolvedValue({ sys: { id: 'folder-b', version: 1 }, metadata: { spaces: [] } }),
        patch: jest.fn()
          .mockRejectedValueOnce(new Error('patch failed'))
          .mockResolvedValue({}),
      },
    }
    await patchFolderConcepts({
      plainClient: client,
      ...BASE_ARGS,
      sourceEntities: {
        designTokens: [makeEntity(['folder-a'])],
        componentTypes: [makeEntity(['folder-b'])],
      },
    })

    expect(client.concept.patch).toHaveBeenCalledTimes(2)
    expect(logEmitter.emit).toHaveBeenCalledWith('warning', expect.stringContaining('Failed to patch folder concept'))
  })
})
