import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

jest.mock('../../../../lib/utils/import-exo-folders.ts', () => {
  return Promise.resolve()
})

// logEmitter is a plain node:events EventEmitter. Node treats 'error' as a special
// event name and throws synchronously if it's emitted with no listener attached, so
// register a no-op listener before any test exercises an error/log-and-continue path.
logEmitter.on('error', () => { })

const baseSourceData = {
  locales: [],
  contentTypes: [],
  assets: [],
  editorInterfaces: [],
  entries: [],
  tags: [],
  webhooks: []
}

const baseDestinationData = {}

const ALL_PARENT_GROUP_IDS = [
  'contentful.folder-group-designToken',
  'contentful.folder-group-componentType',
  'contentful.folder-group-template',
  'contentful.folder-group-fragment',
  'contentful.folder-group-experience'
]

function mockClient () {
  return makePlainClientMock({
    conceptScheme: {
      getMany: jest.fn(() => Promise.resolve({
        items: ALL_PARENT_GROUP_IDS.map((id) => ({ sys: { id, version: 1 }, concepts: [] }))
      })),
      patch: jest.fn(({ version }: any) => Promise.resolve({ sys: { version: version + 1 }, concepts: [] }))
    },
    experience: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      upsert: jest.fn((_params: any, payload: any) => Promise.resolve({ sys: { id: 'exp-1', version: payload.sys.version ?? 1 } })),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } }))
    },
    experienceFragment: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      upsert: jest.fn((_params: any, payload: any) => Promise.resolve({ sys: { id: 'frag-1', version: payload.sys.version ?? 1 } })),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } }))
    },
    experienceVariant: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1', variant: 'v-1', type: 'Experience', version: 1 } })),
      publish: jest.fn((params: any) => Promise.resolve({ sys: { id: params.experienceId, variant: params.variantId, publishedVersion: params.version } })),
      archive: jest.fn((params: any) => Promise.resolve({ sys: { id: params.experienceId, variant: params.variantId, archivedVersion: params.version } }))
    },
    experienceFragmentVariant: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1', variant: 'v-2', type: 'ExperienceFragment', version: 1 } })),
      publish: jest.fn((params: any) => Promise.resolve({ sys: { id: params.experienceFragmentId, variant: params.variantId, publishedVersion: params.version } })),
      archive: jest.fn((params: any) => Promise.resolve({ sys: { id: params.experienceFragmentId, variant: params.variantId, archivedVersion: params.version } }))
    },
    space: {
      get: jest.fn(() => Promise.resolve({
        sys: { organization: { sys: { id: 'org-1' } } },
        getEnvironment: jest.fn(() => Promise.resolve({
          getEditorInterfaceForContentType: jest.fn(() => Promise.resolve({ update: jest.fn() }))
        }))
      }))
    }
  })
}

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

describe('Importing Experience Optimization Variants', () => {
  const experience: any = { sys: { id: 'exp-1', type: 'Experience', version: 1 }, name: 'Homepage', experienceTemplate: { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/tmpl-1' } } }
  const variant = { sys: { id: 'exp-1', variant: 'v-1', type: 'Experience', publishedVersion: 2 }, name: 'Homepage Variant', experienceTemplate: experience.experienceTemplate }

  test('creates one destination variant per source variant, scoped to the parent id', async () => {
    const client = mockClient()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [variant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.create).toHaveBeenCalledTimes(1)
    const [params, payload] = client.experienceVariant.create.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' })
    expect(payload).not.toHaveProperty('sys')
    expect(payload.name).toBe('Homepage Variant')
  })

  test('skips the task when the source has no optimization variants', async () => {
    const client = mockClient()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [experience] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.create).not.toHaveBeenCalled()
  })

  test('skips the task when includeExperienceOrchestration is false', async () => {
    const client = mockClient()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [variant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.create).not.toHaveBeenCalled()
  })

  test('attaches the variant to the error before emitting, and continues on failure without aborting siblings', async () => {
    const client = mockClient()
    const createError = new Error('422 validation failed')
    const secondVariant = { sys: { id: 'exp-1', variant: 'v-2' }, name: 'Second Variant', experienceTemplate: experience.experienceTemplate }
    client.experienceVariant.create = jest.fn()
      .mockRejectedValueOnce(createError)
      .mockResolvedValueOnce({ sys: { id: 'exp-1', variant: 'v-2', version: 1 } })
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [variant, secondVariant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    expect(client.experienceVariant.create).toHaveBeenCalledTimes(2)
    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error' && args[1] === createError)
    expect(errorCall).toBeDefined()
    expect((errorCall?.[1] as any).entity).toBe(variant)
    emitSpy.mockRestore()
  })
})

describe('Publishing Experience Optimization Variants', () => {
  const experience: any = { sys: { id: 'exp-1', type: 'Experience', version: 1 }, name: 'Homepage', experienceTemplate: { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/tmpl-1' } } }

  test('publishes only the variants whose source had sys.publishedVersion', async () => {
    const client = mockClient()
    const publishedVariant = { sys: { id: 'exp-1', variant: 'v-1', publishedVersion: 2 }, name: 'Published Variant', experienceTemplate: experience.experienceTemplate }
    const draftVariant = { sys: { id: 'exp-1', variant: 'v-2' }, name: 'Draft Variant', experienceTemplate: experience.experienceTemplate }
    client.experienceVariant.create = jest.fn()
      .mockResolvedValueOnce({ sys: { id: 'exp-1', variant: 'v-1', version: 1 } })
      .mockResolvedValueOnce({ sys: { id: 'exp-1', variant: 'v-2', version: 1 } })

    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [publishedVariant, draftVariant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.publish).toHaveBeenCalledTimes(1)
    expect(client.experienceVariant.publish).toHaveBeenCalledWith({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1', variantId: 'v-1', version: 1 })
  })

  test('archives only the variants whose source had sys.archivedVersion', async () => {
    const client = mockClient()
    const archivedVariant = { sys: { id: 'exp-1', variant: 'v-1', archivedVersion: 2 }, name: 'Archived Variant', experienceTemplate: experience.experienceTemplate }
    client.experienceVariant.create = jest.fn().mockResolvedValueOnce({ sys: { id: 'exp-1', variant: 'v-1', version: 1 } })

    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [archivedVariant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.archive).toHaveBeenCalledTimes(1)
    expect(client.experienceVariant.publish).not.toHaveBeenCalled()
  })

  test('skips publishing when skipContentPublishing is set', async () => {
    const client = mockClient()
    const publishedVariant = { sys: { id: 'exp-1', variant: 'v-1', publishedVersion: 2 }, name: 'Published Variant', experienceTemplate: experience.experienceTemplate }
    client.experienceVariant.create = jest.fn().mockResolvedValueOnce({ sys: { id: 'exp-1', variant: 'v-1', version: 1 } })

    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [{ ...experience, optimizationVariants: [publishedVariant] }] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      skipContentPublishing: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceVariant.publish).not.toHaveBeenCalled()
  })
})

describe('Importing Experience Fragment Optimization Variants', () => {
  const component = { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero' } }
  const fragment: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1, component }, name: 'Header' }
  const variant = { sys: { id: 'frag-1', variant: 'v-2', type: 'ExperienceFragment', publishedVersion: 3 }, name: 'Header Variant', component }

  test('creates one destination variant per source variant, scoped to the parent fragment id', async () => {
    const client = mockClient()
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [{ ...fragment, optimizationVariants: [variant] }] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragmentVariant.create).toHaveBeenCalledTimes(1)
    const [params, payload] = client.experienceFragmentVariant.create.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1' })
    expect(payload).not.toHaveProperty('sys')
    expect(payload.name).toBe('Header Variant')
  })

  test('skips the task when the source has no optimization variants', async () => {
    const client = mockClient()
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [fragment] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragmentVariant.create).not.toHaveBeenCalled()
  })
})

describe('Publishing Experience Fragment Optimization Variants', () => {
  const component = { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero' } }
  const fragment: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1, component }, name: 'Header' }

  test('publishes only the variants whose source had sys.publishedVersion', async () => {
    const client = mockClient()
    const publishedVariant = { sys: { id: 'frag-1', variant: 'v-2', publishedVersion: 3 }, name: 'Published Variant', component }
    client.experienceFragmentVariant.create = jest.fn().mockResolvedValueOnce({ sys: { id: 'frag-1', variant: 'v-2', version: 1 } })

    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [{ ...fragment, optimizationVariants: [publishedVariant] }] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragmentVariant.publish).toHaveBeenCalledTimes(1)
    expect(client.experienceFragmentVariant.publish).toHaveBeenCalledWith({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1', variantId: 'v-2', version: 1 })
  })
})
