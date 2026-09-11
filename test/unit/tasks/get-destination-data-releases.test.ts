import PQueue from 'p-queue'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

import getDestinationData from '../../../lib/tasks/get-destination-data'
import { PlainClientAPI } from 'contentful-management'
import { makePlainClientMock } from '../helpers/plain-client-mock'

// Timeline (Releases) is a separate, GA Contentful feature, not part of Experience
// Orchestration — unlike the ExO entities (see get-destination-data-exo.test.ts), it is
// fetched unconditionally, regardless of includeExperienceOrchestration.

function makeRelease(id: string) {
  return { sys: { id, version: 1 } }
}

// Mirrors makeCursorResolver from get-destination-data-exo.test.ts.
function makeCursorResolver(items: any[], pageSize = 100) {
  return jest.fn(({ query }: { query: any }) => {
    const token = query?.pageNext ? parseInt(query.pageNext, 10) : 0
    const page = items.slice(token, token + pageSize)
    const next = token + pageSize < items.length ? String(token + pageSize) : undefined
    return Promise.resolve({ items: page, pages: next ? { next } : undefined })
  })
}

function makeExoEntitlementError() {
  return new Error(JSON.stringify({
    status: 403,
    statusText: '',
    message: 'Forbidden',
    details: { reasons: 'exoM1 entitlement required' },
    request: { url: 'https://api.contentful.com/spaces/space-1/environments/master/components' }
  }))
}

function makeTimelineEntitlementError() {
  return new Error(JSON.stringify({
    status: 403,
    statusText: '',
    message: 'Forbidden',
    details: { reasons: 'Timeline is not enabled for this organization' },
    request: { url: 'https://api.contentful.com/spaces/space-1/environments/master/releases' }
  }))
}

const releaseItems = Array.from({ length: 5 }, (_, i) => makeRelease(`rel-${i}`))

const mockClient = makePlainClientMock({
  release: { query: makeCursorResolver(releaseItems) }
})

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
  jest.clearAllMocks()
})

test('returns destination releases fetched via cursor pagination', async () => {
  const result = await getDestinationData({
    client: { ...mockClient } as any as PlainClientAPI,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })

  expect(mockClient.release.query).toHaveBeenCalled()
  expect(result.releases).toHaveLength(releaseItems.length)
  expect(result.releases[0].sys.id).toBe('rel-0')
})

test('fetches releases even when includeExperienceOrchestration is false', async () => {
  const result = await getDestinationData({
    client: { ...mockClient } as any as PlainClientAPI,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    includeExperienceOrchestration: false,
    requestQueue
  })

  expect(mockClient.release.query).toHaveBeenCalled()
  expect(result.releases).toHaveLength(releaseItems.length)
})

test('follows pageNext cursor across multiple pages for releases', async () => {
  const manyItems = Array.from({ length: 150 }, (_, i) => makeRelease(`rel-${i}`))
  const client = {
    ...mockClient,
    release: { query: makeCursorResolver(manyItems, 100) }
  } as any as PlainClientAPI

  const result = await getDestinationData({
    client,
    spaceId: 'space-1',
    environmentId: 'master',
    sourceData: {},
    requestQueue
  })

  expect(client.release.query).toHaveBeenCalledTimes(2)
  expect(result.releases).toHaveLength(150)
})

test('degrades gracefully and logs a friendly message when the destination org lacks the exoM1 entitlement', async () => {
  const client = {
    ...mockClient,
    release: { query: jest.fn(() => Promise.reject(makeExoEntitlementError())) }
  } as any as PlainClientAPI

  const errors: Error[] = []
  const onError = (err: Error) => errors.push(err)
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: {},
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(result!.releases).toEqual([])
  expect(errors.some((e) => e.message.includes('Experience Orchestration (ExO) is not enabled for this space'))).toBe(true)
})

test('degrades gracefully and logs a friendly message when the destination org lacks the Timeline entitlement', async () => {
  const client = {
    ...mockClient,
    release: { query: jest.fn(() => Promise.reject(makeTimelineEntitlementError())) }
  } as any as PlainClientAPI

  const errors: Error[] = []
  const onError = (err: Error) => errors.push(err)
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: {},
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(result!.releases).toEqual([])
  expect(errors.some((e) => e.message.includes('Timeline (Releases) is not enabled for this organization'))).toBe(true)
})

test('a non-entitlement error on releases still degrades gracefully instead of aborting the fetch', async () => {
  const client = {
    ...mockClient,
    release: { query: jest.fn(() => Promise.reject(new Error('network error'))) }
  } as any as PlainClientAPI

  const errors: Error[] = []
  const onError = (err: Error) => errors.push(err)
  logEmitter.on('error', onError)

  let result
  try {
    result = await getDestinationData({
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      sourceData: {},
      requestQueue
    })
  } finally {
    logEmitter.off('error', onError)
  }

  expect(result!.releases).toEqual([])
  expect(errors.some((e) => e.message.includes('network error'))).toBe(true)
})
