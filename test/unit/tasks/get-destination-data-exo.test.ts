import PQueue from 'p-queue'

import getDestinationData from '../../../lib/tasks/get-destination-data'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntity(id: string) {
  return { sys: { id, version: 1 } }
}

// Simulates a cursor-paginated ExO endpoint: returns items in pages of `pageSize`,
// encoding a `pageNext` token when more pages exist.
function makeCursorResolver(items: any[], pageSize = 100) {
  return jest.fn(({ query }: { query: any }) => {
    const token = query?.pageNext ? parseInt(query.pageNext, 10) : 0
    const page = items.slice(token, token + pageSize)
    const next = token + pageSize < items.length ? String(token + pageSize) : undefined
    return Promise.resolve({ items: page, pages: next ? { next } : undefined })
  })
}

function makeOffsetResolver(items: any[]) {
  return jest.fn((query: any) => {
    const skip = query?.skip ?? 0
    const limit = query?.limit ?? 100
    return Promise.resolve({ items: items.slice(skip, skip + limit), total: items.length })
  })
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const exoItems = {
  componentTypes: Array.from({ length: 5 }, (_, i) => makeEntity(`ct-${i}`)),
  templates: Array.from({ length: 3 }, (_, i) => makeEntity(`tmpl-${i}`)),
  fragments: Array.from({ length: 4 }, (_, i) => makeEntity(`frag-${i}`)),
  dataAssemblies: Array.from({ length: 2 }, (_, i) => makeEntity(`da-${i}`)),
  experiences: Array.from({ length: 6 }, (_, i) => makeEntity(`exp-${i}`))
}

function makePlainClientMock() {
  return {
    componentType: { getMany: makeCursorResolver(exoItems.componentTypes) },
    template: { getMany: makeCursorResolver(exoItems.templates) },
    fragment: { getMany: makeCursorResolver(exoItems.fragments) },
    dataAssembly: { getMany: makeCursorResolver(exoItems.dataAssemblies) },
    experience: { getMany: makeCursorResolver(exoItems.experiences) }
  }
}

const mockEnvironment = {
  getContentTypes: jest.fn((q: any) =>
    Promise.resolve({ items: (q['sys.id[in]'] as string).split(',').map((id) => ({ sys: { id } })) })
  ),
  getEntries: jest.fn(() => Promise.resolve({ items: [] })),
  getAssets: jest.fn(() => Promise.resolve({ items: [] })),
  getLocales: jest.fn(makeOffsetResolver([])),
  getTags: jest.fn(makeOffsetResolver([]))
}

const mockSpace = {
  getEnvironment: jest.fn(() => Promise.resolve(mockEnvironment))
}

const mockClient = {
  getSpace: jest.fn(() => Promise.resolve(mockSpace))
}

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
  jest.clearAllMocks()
  mockEnvironment.getContentTypes.mockImplementation((q: any) =>
    Promise.resolve({ items: (q['sys.id[in]'] as string).split(',').map((id) => ({ sys: { id } })) })
  )
  mockEnvironment.getEntries.mockResolvedValue({ items: [] })
  mockEnvironment.getAssets.mockResolvedValue({ items: [] })
  mockEnvironment.getLocales.mockImplementation(makeOffsetResolver([]))
  mockEnvironment.getTags.mockImplementation(makeOffsetResolver([]))
  mockSpace.getEnvironment.mockResolvedValue(mockEnvironment)
  mockClient.getSpace.mockResolvedValue(mockSpace)
})

// ─── Cursor pagination is only used for ExO entities ─────────────────────────

test('uses cursor pagination for ExO entities, not for standard entities', async () => {
  const plainClient = makePlainClientMock()
  await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { contentTypes: [makeEntity('ct-x') as any] },
    includeExperienceOrchestration: true,
    requestQueue
  })

  // Standard entity: environment method was called (offset-based)
  expect(mockEnvironment.getContentTypes).toHaveBeenCalled()
  // ExO entity: plainClient cursor method was called, NOT an environment method
  expect(plainClient.componentType.getMany).toHaveBeenCalled()
  // Cursor query shape: must include a `limit`, never a `skip`
  const callArg = plainClient.componentType.getMany.mock.calls[0][0] as any
  expect(callArg.query).toHaveProperty('limit')
  expect(callArg.query).not.toHaveProperty('skip')
})

test('does NOT call plainClient ExO methods when includeExperienceOrchestration is false', async () => {
  const plainClient = makePlainClientMock()
  await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: false,
    requestQueue
  })

  expect(plainClient.componentType.getMany).not.toHaveBeenCalled()
  expect(plainClient.template.getMany).not.toHaveBeenCalled()
  expect(plainClient.fragment.getMany).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).not.toHaveBeenCalled()
  expect(plainClient.experience.getMany).not.toHaveBeenCalled()
})

test('follows pageNext cursor across multiple pages', async () => {
  // 150 items, page size 100 → 2 pages
  const manyItems = Array.from({ length: 150 }, (_, i) => makeEntity(`ct-${i}`))
  const plainClient = {
    ...makePlainClientMock(),
    componentType: { getMany: makeCursorResolver(manyItems, 100) }
  }

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.componentType.getMany).toHaveBeenCalledTimes(2)
  expect(result.componentTypes).toHaveLength(150)
})

// ─── Returns destination data for all ExO entities ───────────────────────────

test('returns destination componentTypes fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.componentTypes).toHaveLength(exoItems.componentTypes.length)
  expect(result.componentTypes![0].sys.id).toBe('ct-0')
})

test('returns destination templates fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.templates).toHaveLength(exoItems.templates.length)
  expect(result.templates![0].sys.id).toBe('tmpl-0')
})

test('returns destination fragments fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.fragments).toHaveLength(exoItems.fragments.length)
  expect(result.fragments![0].sys.id).toBe('frag-0')
})

test('returns destination dataAssemblies fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.dataAssemblies).toHaveLength(exoItems.dataAssemblies.length)
  expect(result.dataAssemblies![0].sys.id).toBe('da-0')
})

test('returns destination experiences fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.experiences).toHaveLength(exoItems.experiences.length)
  expect(result.experiences![0].sys.id).toBe('exp-0')
})

test('returns empty arrays for all ExO entities when none exist in destination', async () => {
  const emptyPlainClient = {
    componentType: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    template: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    fragment: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    dataAssembly: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    experience: { getMany: jest.fn(() => Promise.resolve({ items: [] })) }
  }

  const result = await getDestinationData({
    client: mockClient,
    plainClient: emptyPlainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.componentTypes).toHaveLength(0)
  expect(result.templates).toHaveLength(0)
  expect(result.fragments).toHaveLength(0)
  expect(result.dataAssemblies).toHaveLength(0)
  expect(result.experiences).toHaveLength(0)
})
