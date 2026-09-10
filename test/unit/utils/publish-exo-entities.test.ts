import { spaceHasExoM1Entitlement, filterVariantsToPublish, filterVariantsToArchive, publishVariant, archiveVariant } from '../../../lib/utils/publish-exo-entities'
import { makePlainClientMock } from '../helpers/plain-client-mock'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

logEmitter.on('error', () => { })

function makePlainClient({ spaceGet, rawGet }: { spaceGet: () => Promise<any>, rawGet: () => Promise<any> }) {
  return makePlainClientMock({
    space: { get: spaceGet },
    raw: { get: rawGet }
  })
}

test('returns true when the org entitlement set has exoM1.value === true', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } }),
    rawGet: () => Promise.resolve({ features: { exoM1: { value: true } } })
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBe(true)
})

test('returns false when the org entitlement set has exoM1.value === false', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } }),
    rawGet: () => Promise.resolve({ features: { exoM1: { value: false } } })
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBe(false)
})

test('returns false (not null) when the exoM1 key is entirely absent from a well-formed response', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } }),
    rawGet: () => Promise.resolve({ features: { someOtherFeature: { value: true } } })
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBe(false)
})

test('returns false when the entitlement set has no features at all', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } }),
    rawGet: () => Promise.resolve({})
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBe(false)
})

test('returns null when the space lookup fails', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.reject(new Error('network error')),
    rawGet: () => Promise.resolve({ features: { exoM1: { value: true } } })
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBeNull()
})

test('returns null when the space has no organization link', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: {} }),
    rawGet: () => Promise.resolve({ features: { exoM1: { value: true } } })
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBeNull()
})

test('returns null when the entitlement request itself fails', async () => {
  const plainClient = makePlainClient({
    spaceGet: () => Promise.resolve({ sys: { organization: { sys: { id: 'org-1' } } } }),
    rawGet: () => Promise.reject(new Error('403 Forbidden'))
  })

  await expect(spaceHasExoM1Entitlement(plainClient, 'space-1')).resolves.toBeNull()
})

describe('filterVariantsToPublish', () => {
  test('keeps only variants with a truthy sys.publishedVersion', () => {
    const variants = [
      { sys: { variant: 'v1', publishedVersion: 2 } },
      { sys: { variant: 'v2' } },
      { sys: { variant: 'v3', publishedVersion: 1 } }
    ]

    expect(filterVariantsToPublish(variants)).toEqual([
      { sys: { variant: 'v1', publishedVersion: 2 } },
      { sys: { variant: 'v3', publishedVersion: 1 } }
    ])
  })
})

describe('filterVariantsToArchive', () => {
  test('keeps only variants with a truthy sys.archivedVersion', () => {
    const variants = [
      { sys: { variant: 'v1', archivedVersion: 2 } },
      { sys: { variant: 'v2' } }
    ]

    expect(filterVariantsToArchive(variants)).toEqual([
      { sys: { variant: 'v1', archivedVersion: 2 } }
    ])
  })

  test('excludes a variant flagged for both publish and archive - the API rejects archiving a published variant', () => {
    const variants = [
      { sys: { variant: 'v1', publishedVersion: 1, archivedVersion: 2 } },
      { sys: { variant: 'v2', archivedVersion: 3 } }
    ]

    expect(filterVariantsToArchive(variants)).toEqual([
      { sys: { variant: 'v2', archivedVersion: 3 } }
    ])
  })
})

describe('publishVariant', () => {
  test('resolves with the publish result on success', async () => {
    const entity = { sys: { variant: 'v1' } }
    const result = await publishVariant('ExperienceVariant', entity, () => Promise.resolve({ sys: { variant: 'v1', publishedVersion: 1 } }))

    expect(result).toEqual({ sys: { variant: 'v1', publishedVersion: 1 } })
  })

  test('logs and returns null when the publish call fails, without throwing', async () => {
    const entity = { sys: { variant: 'v1' } }

    await expect(publishVariant('ExperienceVariant', entity, () => Promise.reject(new Error('boom')))).resolves.toBeNull()
  })
})

describe('archiveVariant', () => {
  test('resolves with the archive result on success', async () => {
    const entity = { sys: { variant: 'v1' } }
    const result = await archiveVariant('ExperienceVariant', entity, () => Promise.resolve({ sys: { variant: 'v1', archivedVersion: 1 } }))

    expect(result).toEqual({ sys: { variant: 'v1', archivedVersion: 1 } })
  })

  test('logs and returns null when the archive call fails, without throwing', async () => {
    const entity = { sys: { variant: 'v1' } }

    await expect(archiveVariant('ExperienceVariant', entity, () => Promise.reject(new Error('boom')))).resolves.toBeNull()
  })
})
