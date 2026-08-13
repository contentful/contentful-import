import { spaceHasExoM1Entitlement } from '../../../lib/utils/publish-exo-entities'

function makePlainClient({ spaceGet, rawGet }: { spaceGet: () => Promise<any>, rawGet: () => Promise<any> }) {
  return {
    space: { get: spaceGet },
    raw: { get: rawGet }
  }
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
