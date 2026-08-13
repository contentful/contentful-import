import PQueue from 'p-queue'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

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
  designTokens: Array.from({ length: 7 }, (_, i) => makeEntity(`dt-${i}`)),
  components: Array.from({ length: 5 }, (_, i) => makeEntity(`ct-${i}`)),
  experienceTemplates: Array.from({ length: 3 }, (_, i) => makeEntity(`tmpl-${i}`)),
  experienceFragments: Array.from({ length: 4 }, (_, i) => makeEntity(`frag-${i}`)),
  dataAssemblies: Array.from({ length: 2 }, (_, i) => makeEntity(`da-${i}`)),
  experiences: Array.from({ length: 6 }, (_, i) => makeEntity(`exp-${i}`))
}

// The ExO fetch block is now gated on the source content actually containing that entity
// type (mirrors how entries/assets/locales are gated), so tests that expect a given ExO
// fetch to fire must include a source entity of that type.
const exoSourceData = {
  designTokens: [makeEntity('src-dt') as any],
  components: [makeEntity('src-ct') as any],
  experienceTemplates: [makeEntity('src-tmpl') as any],
  experienceFragments: [makeEntity('src-frag') as any],
  dataAssemblies: [makeEntity('src-da') as any],
  experiences: [makeEntity('src-exp') as any]
}

function makePlainClientMock() {
  return {
    designToken: { getMany: makeCursorResolver(exoItems.designTokens) },
    component: { getMany: makeCursorResolver(exoItems.components) },
    experienceTemplate: { getMany: makeCursorResolver(exoItems.experienceTemplates) },
    experienceFragment: { getMany: makeCursorResolver(exoItems.experienceFragments) },
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
    sourceData: { contentTypes: [makeEntity('ct-x') as any], ...exoSourceData },
    includeExperienceOrchestration: true,
    requestQueue
  })

  // Standard entity: environment method was called (offset-based)
  expect(mockEnvironment.getContentTypes).toHaveBeenCalled()
  // ExO entity: plainClient cursor method was called, NOT an environment method
  expect(plainClient.component.getMany).toHaveBeenCalled()
  // Cursor query shape: must include a `limit`, never a `skip`
  const callArg = plainClient.component.getMany.mock.calls[0][0] as any
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
    sourceData: exoSourceData,
    includeExperienceOrchestration: false,
    requestQueue
  })

  expect(plainClient.designToken.getMany).not.toHaveBeenCalled()
  expect(plainClient.component.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceTemplate.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceFragment.getMany).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).not.toHaveBeenCalled()
  expect(plainClient.experience.getMany).not.toHaveBeenCalled()
})

test('follows pageNext cursor across multiple pages', async () => {
  // 150 items, page size 100 → 2 pages
  const manyItems = Array.from({ length: 150 }, (_, i) => makeEntity(`ct-${i}`))
  const plainClient = {
    ...makePlainClientMock(),
    component: { getMany: makeCursorResolver(manyItems, 100) }
  }

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { components: exoSourceData.components },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.component.getMany).toHaveBeenCalledTimes(2)
  expect(result.components).toHaveLength(150)
})

// ─── Returns destination data for all ExO entities ───────────────────────────

test('returns destination designTokens fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { designTokens: exoSourceData.designTokens },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.designTokens).toHaveLength(exoItems.designTokens.length)
  expect(result.designTokens![0].sys.id).toBe('dt-0')
})

test('returns destination components fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { components: exoSourceData.components },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.components).toHaveLength(exoItems.components.length)
  expect(result.components![0].sys.id).toBe('ct-0')
})

test('returns destination experienceTemplates fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { experienceTemplates: exoSourceData.experienceTemplates },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.experienceTemplates).toHaveLength(exoItems.experienceTemplates.length)
  expect(result.experienceTemplates![0].sys.id).toBe('tmpl-0')
})

test('returns destination experienceFragments fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { experienceFragments: exoSourceData.experienceFragments },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.experienceFragments).toHaveLength(exoItems.experienceFragments.length)
  expect(result.experienceFragments![0].sys.id).toBe('frag-0')
})

test('returns destination dataAssemblies fetched via cursor pagination', async () => {
  const plainClient = makePlainClientMock()
  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { dataAssemblies: exoSourceData.dataAssemblies },
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
    sourceData: { experiences: exoSourceData.experiences },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.experiences).toHaveLength(exoItems.experiences.length)
  expect(result.experiences![0].sys.id).toBe('exp-0')
})

test('returns empty arrays for all ExO entities when none exist in destination', async () => {
  const emptyPlainClient = {
    designToken: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    component: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    experienceTemplate: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    experienceFragment: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    dataAssembly: { getMany: jest.fn(() => Promise.resolve({ items: [] })) },
    experience: { getMany: jest.fn(() => Promise.resolve({ items: [] })) }
  }

  const result = await getDestinationData({
    client: mockClient,
    plainClient: emptyPlainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: exoSourceData,
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(result.designTokens).toHaveLength(0)
  expect(result.components).toHaveLength(0)
  expect(result.experienceTemplates).toHaveLength(0)
  expect(result.experienceFragments).toHaveLength(0)
  expect(result.dataAssemblies).toHaveLength(0)
  expect(result.experiences).toHaveLength(0)
})

// ─── ExO fetches are gated on source content, like entries/assets/locales ────

test('does not call any plainClient ExO methods when the source content has no ExO entities', async () => {
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

  expect(plainClient.designToken.getMany).not.toHaveBeenCalled()
  expect(plainClient.component.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceTemplate.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceFragment.getMany).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).not.toHaveBeenCalled()
  expect(plainClient.experience.getMany).not.toHaveBeenCalled()
})

test('only fetches the ExO entity types actually present in source content', async () => {
  const plainClient = makePlainClientMock()

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { designTokens: exoSourceData.designTokens },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.designToken.getMany).toHaveBeenCalled()
  expect(plainClient.component.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceTemplate.getMany).not.toHaveBeenCalled()
  expect(plainClient.experienceFragment.getMany).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).not.toHaveBeenCalled()
  expect(plainClient.experience.getMany).not.toHaveBeenCalled()
  expect(result.designTokens).toHaveLength(exoItems.designTokens.length)
  expect(result.components).toEqual([])
})

// ─── Destination space without the ExO entitlement (AIS-141) ────────────────
// A destination space without exoM1 403s on every ExO endpoint. This must not abort the
// whole destination-data fetch, since the rest of the import (entries, assets, content
// types, etc.) has nothing to do with ExO.

// Mirrors the real CMA SDK error shape confirmed live against a space without exoM1 (AIS-141):
// error.message is a JSON-stringified envelope, not a plain string.
function makeExoEntitlementError() {
  return new Error(JSON.stringify({
    status: 403,
    statusText: '',
    message: 'Forbidden',
    details: { reasons: 'exoM1 entitlement required' },
    request: { url: 'https://api.contentful.com/spaces/space-1/environments/master/components' }
  }))
}

function makeForbiddenPlainClientMock() {
  const forbidden = jest.fn(() => Promise.reject(makeExoEntitlementError()))
  return {
    designToken: { getMany: forbidden },
    component: { getMany: forbidden },
    experienceTemplate: { getMany: forbidden },
    experienceFragment: { getMany: forbidden },
    dataAssembly: { getMany: forbidden },
    experience: { getMany: forbidden }
  }
}

test('does not abort destination-data fetch when the destination space lacks the ExO entitlement', async () => {
  const plainClient = makeForbiddenPlainClientMock()
  const onError = () => {}
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: exoSourceData,
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(result.designTokens).toEqual([])
  expect(result.components).toEqual([])
  expect(result.experienceTemplates).toEqual([])
  expect(result.experienceFragments).toEqual([])
  expect(result.dataAssemblies).toEqual([])
  expect(result.experiences).toEqual([])
})

test('logs once per ExO entity type as an error when the destination space lacks the ExO entitlement', async () => {
  const plainClient = makeForbiddenPlainClientMock()
  const errors: Error[] = []
  const onError = (error: Error) => errors.push(error)
  logEmitter.on('error', onError)

  try {
    await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: exoSourceData,
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(errors).toHaveLength(6)
  expect(errors.some((e) => e.message.includes('design tokens') && e.message.includes('Experience Orchestration (ExO) is not enabled for this space'))).toBe(true)
  expect(errors.some((e) => e.message.includes('components'))).toBe(true)
  expect(errors.some((e) => e.message.includes('experience templates'))).toBe(true)
  expect(errors.some((e) => e.message.includes('experience fragments'))).toBe(true)
  expect(errors.some((e) => e.message.includes('data assemblies'))).toBe(true)
  expect(errors.some((e) => e.message.includes('experiences'))).toBe(true)
})

test('translates the exoM1-entitlement 403 into a friendly message, not the raw JSON error blob', async () => {
  const plainClient = makeForbiddenPlainClientMock()
  const errors: Error[] = []
  const onError = (error: Error) => errors.push(error)
  logEmitter.on('error', onError)

  try {
    await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: exoSourceData,
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  for (const error of errors) {
    expect(error.message).toContain('Experience Orchestration (ExO) is not enabled for this space')
    expect(error.message).not.toContain('exoM1 entitlement required')
    expect(error.message).not.toContain('{"status":403')
  }
})

test('leaves non-entitlement errors as-is instead of swallowing them into the friendly message', async () => {
  const plainClient = {
    ...makePlainClientMock(),
    designToken: { getMany: jest.fn(() => Promise.reject(new Error('socket hang up'))) }
  }
  const errors: Error[] = []
  const onError = (error: Error) => errors.push(error)
  logEmitter.on('error', onError)

  try {
    await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: { designTokens: exoSourceData.designTokens },
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(errors).toHaveLength(1)
  expect(errors[0].message).toContain('socket hang up')
  expect(errors[0].message).not.toContain('Experience Orchestration (ExO) is not enabled for this space')
})

test('still fetches non-ExO destination content when the destination space lacks the ExO entitlement', async () => {
  const plainClient = makeForbiddenPlainClientMock()
  const onError = () => {}
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: { contentTypes: [makeEntity('ct-x') as any], ...exoSourceData },
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(mockEnvironment.getContentTypes).toHaveBeenCalled()
  expect(result.contentTypes).toHaveLength(1)
})

test('a non-entitlement error on one ExO type does not block the others from resolving', async () => {
  const plainClient = {
    ...makePlainClientMock(),
    designToken: { getMany: jest.fn(() => Promise.reject(new Error('exoM1 entitlement required'))) }
  }
  const onError = () => {}
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: { designTokens: exoSourceData.designTokens, components: exoSourceData.components },
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(result.designTokens).toEqual([])
  expect(result.components).toHaveLength(exoItems.components.length)
})

// ─── Proactive entitlement check (AIS-141 / AIS-191 pattern) ────────────────
// Composes with, and is nested inside, the content gate above: the entitlement check
// only runs at all when source has at least one of the 5 exoM1-gated types, and its
// "definitely missing" answer short-circuits those 5 in one shot instead of letting
// each 403 independently. dataAssemblies is excluded — confirmed live (AIS-141) that
// it isn't actually gated by exoM1 the same way, so it always fetches independently.

function makePlainClientWithEntitlement(entitledResponse: () => Promise<any>) {
  return {
    ...makePlainClientMock(),
    space: { get: jest.fn(() => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } })) },
    raw: { get: jest.fn(entitledResponse) }
  }
}

test('skips all exoM1-gated types with a single error when the entitlement check confirms it is missing', async () => {
  const plainClient = makePlainClientWithEntitlement(() => Promise.resolve({ features: { exoM1: { value: false } } }))
  const errors: Error[] = []
  const onError = (error: Error) => errors.push(error)
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: { designTokens: exoSourceData.designTokens, components: exoSourceData.components, experiences: exoSourceData.experiences },
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(plainClient.designToken.getMany).not.toHaveBeenCalled()
  expect(plainClient.component.getMany).not.toHaveBeenCalled()
  expect(plainClient.experience.getMany).not.toHaveBeenCalled()
  expect(result.designTokens).toEqual([])
  expect(result.components).toEqual([])
  expect(result.experiences).toEqual([])
  expect(errors).toHaveLength(1)
  expect(errors[0].message).toContain('Experience Orchestration (ExO) is not enabled for this space')
})

test('still fetches dataAssemblies independently when the entitlement check confirms exoM1 is missing for the other types', async () => {
  const plainClient = makePlainClientWithEntitlement(() => Promise.resolve({ features: { exoM1: { value: false } } }))
  const onError = () => {}
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client: mockClient,
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: { designTokens: exoSourceData.designTokens, dataAssemblies: exoSourceData.dataAssemblies },
      includeExperienceOrchestration: true,
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(plainClient.designToken.getMany).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).toHaveBeenCalled()
  expect(result.dataAssemblies).toHaveLength(exoItems.dataAssemblies.length)
})

test('does not call the entitlement check at all when source has only dataAssemblies', async () => {
  const plainClient = makePlainClientWithEntitlement(() => Promise.resolve({ features: { exoM1: { value: false } } }))

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { dataAssemblies: exoSourceData.dataAssemblies },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.space.get).not.toHaveBeenCalled()
  expect(plainClient.dataAssembly.getMany).toHaveBeenCalled()
  expect(result.dataAssemblies).toHaveLength(exoItems.dataAssemblies.length)
})

test('proceeds with the normal per-type fetches when the entitlement check confirms exoM1 is present', async () => {
  const plainClient = makePlainClientWithEntitlement(() => Promise.resolve({ features: { exoM1: { value: true } } }))

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { designTokens: exoSourceData.designTokens },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.designToken.getMany).toHaveBeenCalled()
  expect(result.designTokens).toHaveLength(exoItems.designTokens.length)
})

test('falls back to the per-type fetch-and-catch when the entitlement check itself is inconclusive', async () => {
  const plainClient = {
    ...makePlainClientMock(),
    space: { get: jest.fn(() => Promise.reject(new Error('network error'))) },
    raw: { get: jest.fn() }
  }

  const result = await getDestinationData({
    client: mockClient,
    plainClient,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: { designTokens: exoSourceData.designTokens },
    includeExperienceOrchestration: true,
    requestQueue
  })

  expect(plainClient.designToken.getMany).toHaveBeenCalled()
  expect(result.designTokens).toHaveLength(exoItems.designTokens.length)
})
