import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ComponentProps, DataAssemblyProps, ExperienceFragmentProps, ExperienceProps, ExperienceTemplateProps } from 'contentful-management'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

jest.mock('../../../../lib/utils/import-exo-folders.ts', () => {
  return Promise.resolve()
})

// logEmitter is a plain node:events EventEmitter. Node treats 'error' as a special
// event name and throws synchronously if it's emitted with no listener attached, so
// register a no-op listener before any test exercises an error/log-and-continue path.
logEmitter.on('error', () => { })

// Minimal base source data needed to satisfy the Listr tasks that always run
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

// Upsert/update mocks echo back the version from the payload (as the real API does on
// both create and update) so downstream Publishing tasks see a realistic sys.version.
function echoVersion(id: string) {
  return jest.fn((_params: any, payload: any) => Promise.resolve({ sys: { id, version: payload.sys.version ?? 1 } }))
}

const ALL_PARENT_GROUP_IDS = [
  'contentful.folder-group-designToken',
  'contentful.folder-group-componentType',
  'contentful.folder-group-template',
  'contentful.folder-group-fragment',
  'contentful.folder-group-experience',
]

function mockClient() {
  return makePlainClientMock({
    conceptScheme: {
      getMany: jest.fn(() => Promise.resolve({
        items: ALL_PARENT_GROUP_IDS.map((id) => ({ sys: { id, version: 1 }, concepts: [] }))
      })),
      patch: jest.fn(({ version }: any) => Promise.resolve({ sys: { version: version + 1 }, concepts: [] })),
    },
    designToken: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'dt-1' } })),
      upsert: echoVersion('dt-1')
    },
    concept: {
      get: jest.fn(() => Promise.resolve({ sys: { id: 'folder-1', version: 0 }, metadata: { spaces: [] } })),
      patch: jest.fn(() => Promise.resolve({})),
    },
    component: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
      upsert: echoVersion('ct-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } }))
    },
    experienceTemplate: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
      upsert: echoVersion('tmpl-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } }))
    },
    experienceFragment: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      upsert: echoVersion('frag-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } }))
    },
    dataAssembly: {
      update: echoVersion('da-1'),
      create: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } })),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } }))
    },
    experience: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      upsert: echoVersion('exp-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      unpublish: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } }))
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

// ─── Component ────────────────────────────────────────────────────────────

describe('Importing Components', () => {
  const entity: any = { sys: { id: 'ct-1', type: 'Component', version: 3 }, name: 'Hero' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.upsert).toHaveBeenCalledTimes(1)
    expect(client.component.create).not.toHaveBeenCalled()
    const [params, payload] = client.component.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1' })
    expect(payload.sys.id).toBe('ct-1')
    expect(payload.sys.type).toBe('Component')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Hero')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.upsert).toHaveBeenCalledTimes(1)
    const [params, payload] = client.component.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1' })
    expect(payload.sys.version).toBe(7)
    expect(payload.name).toBe('Hero')
  })

  test('skips task when includeExperienceOrchestration is false', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: baseDestinationData,
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(client.component.upsert).not.toHaveBeenCalled()
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const upsertError = new Error('422 validation failed')
    client.component.upsert = jest.fn((_params, _payload) => Promise.reject(upsertError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(upsertError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

describe('Publishing Components', () => {
  const publishedEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 2, publishedVersion: 2 }, name: 'Hero' }
  const draftEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 3 }, name: 'Hero' }
  const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.publish).toHaveBeenCalledTimes(1)
    expect(client.component.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1', version: 7 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.publish).not.toHaveBeenCalled()
  })

  test('skips publishing when skipContentPublishing is set', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      skipContentPublishing: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const client = mockClient();
    const publishError = new Error('422 validation failed')
    client.component.publish = jest.fn(() => Promise.reject(publishError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(publishError)
    expect((errorCall?.[1] as any).entity.sys.id).toBe('ct-1')
    emitSpy.mockRestore()
  })
})

// ─── ExperienceTemplate ─────────────────────────────────────────────────────────────────

describe('Importing Experience Templates', () => {
  const entity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 2 }, name: 'Landing Page' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceTemplate.upsert).toHaveBeenCalledTimes(1)
    expect(client.experienceTemplate.create).not.toHaveBeenCalled()
    const [params, payload] = client.experienceTemplate.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1' })
    expect(payload.sys.id).toBe('tmpl-1')
    expect(payload.sys.type).toBe('ExperienceTemplate')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Landing Page')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 5 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = client.experienceTemplate.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1' })
    expect(payload.sys.version).toBe(5)
    expect(payload.name).toBe('Landing Page')
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const upsertError = new Error('422 validation failed')
    client.experienceTemplate.upsert = jest.fn((_params, _payload) => Promise.reject(upsertError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(upsertError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

describe('Publishing Experience Templates', () => {
  const publishedEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 1, publishedVersion: 1 }, name: 'Landing Page' }
  const draftEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 2 }, name: 'Landing Page' }
  const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 5 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceTemplate.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1', version: 5 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceTemplate.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const client = mockClient();
    const publishError = new Error('422 validation failed')
    client.experienceTemplate.publish = jest.fn(() => Promise.reject(publishError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(publishError)
    expect((errorCall?.[1] as any).entity.sys.id).toBe('tmpl-1')
    emitSpy.mockRestore()
  })
})

// ─── ExperienceFragment ─────────────────────────────────────────────────────────────────

describe('Importing Experience Fragments', () => {
  const component = { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero' } }
  const entity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1, component }, name: 'Hero Fragment' }

  test('CREATE: calls upsert with id in sys and component hoisted from sys', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragment.upsert).toHaveBeenCalledTimes(1)
    expect(client.experienceFragment.create).not.toHaveBeenCalled()

    const [params, payload] = client.experienceFragment.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1' })
    expect(payload.sys.id).toBe('frag-1')
    expect(payload.sys.type).toBe('ExperienceFragment')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.component).toEqual(component)
    expect(payload.name).toBe('Hero Fragment')
  })

  test('UPDATE: calls upsert with destination sys.version and omits component (once an ExperienceFragment is created, its component cannot be changed to a different component)', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 4 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = client.experienceFragment.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1' })
    expect(payload.sys.version).toBe(4)
    expect(payload).not.toHaveProperty('component')
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const upsertError = new Error('422 validation failed')
    client.experienceFragment.upsert = jest.fn((_params, _payload) => Promise.reject(upsertError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(upsertError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

describe('Publishing Experience Fragments', () => {
  const publishedEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1, publishedVersion: 1 }, name: 'Hero Fragment' }
  const draftEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1 }, name: 'Hero Fragment' }
  const destinationEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 4 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragment.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1', version: 4 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragment.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const client = mockClient();
    const publishError = new Error('422 validation failed')
    client.experienceFragment.publish = jest.fn(() => Promise.reject(publishError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(publishError)
    expect((errorCall?.[1] as any).entity.sys.id).toBe('frag-1')
    emitSpy.mockRestore()
  })
})

// ─── DataAssembly ─────────────────────────────────────────────────────────────

describe('Importing Data Assemblies', () => {
  const entity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }

  test('CREATE: calls dataAssembly.update with version 0 to preserve id when entity does not exist in destination', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [entity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.dataAssembly.update).toHaveBeenCalledTimes(1)
    expect(client.dataAssembly.create).not.toHaveBeenCalled()

    const [params, payload] = client.dataAssembly.update.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1' })
    expect(payload.sys.id).toBe('da-1')
    expect(payload.sys.type).toBe('DataAssembly')
    expect(payload.sys.version).toBe(0)
    expect(payload.sys.dataType).toEqual(entity.sys.dataType)
    expect(payload.name).toBe('My Assembly')
  })

  test('UPDATE: calls dataAssembly.update (not create) with destination sys.version when entity exists', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 9 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [entity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.dataAssembly.update).toHaveBeenCalledTimes(1)
    expect(client.dataAssembly.create).not.toHaveBeenCalled()

    const [params, payload] = client.dataAssembly.update.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1' })
    expect(payload.sys.version).toBe(9)
    expect(payload.name).toBe('My Assembly')
  })

  test('UPDATE: strips server-managed sys fields from a published source entity', async () => {
    const client = mockClient();
    const publishedEntity: any = {
      sys: {
        id: 'da-1',
        type: 'DataAssembly',
        version: 3,
        dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }],
        publishedVersion: 2,
        publishedAt: '2026-01-01T00:00:00.000Z',
        publishedCounter: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: { sys: { type: 'Link', linkType: 'User', id: 'user-1' } }
      },
      name: 'My Assembly'
    }
    const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 9 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [, payload] = client.dataAssembly.update.mock.calls[0]
    expect(payload.sys).toEqual({ id: 'da-1', type: 'DataAssembly', dataType: publishedEntity.sys.dataType, version: 9 })
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const updateError = new Error('422 validation failed')
    client.dataAssembly.update = jest.fn((_params, _payload) => Promise.reject(updateError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [entity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(updateError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

describe('Publishing Data Assemblies', () => {
  const publishedEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, publishedVersion: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }
  const draftEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }
  const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 9 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.dataAssembly.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1', version: 9 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.dataAssembly.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const client = mockClient();
    const publishError = new Error('422 validation failed')
    client.dataAssembly.publish = jest.fn(() => Promise.reject(publishError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(publishError)
    expect((errorCall?.[1] as any).entity.sys.id).toBe('da-1')
    emitSpy.mockRestore()
  })
})

// ─── DesignToken ──────────────────────────────────────────────────────────────

describe('Importing Design Tokens', () => {
  const entity: any = { sys: { id: 'dt-1', type: 'DesignToken', version: 2 }, name: 'Primary Blue', type: 'DTCG.Color' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: { ...baseDestinationData, designTokens: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.designToken.upsert).toHaveBeenCalledTimes(1)

    const [params, payload] = client.designToken.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', designTokenId: 'dt-1' })
    expect(payload.sys.id).toBe('dt-1')
    expect(payload.sys.type).toBe('DesignToken')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Primary Blue')
    expect(payload.type).toBe('DTCG.Color')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'dt-1', type: 'DesignToken', version: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: { ...baseDestinationData, designTokens: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.designToken.upsert).toHaveBeenCalledTimes(1)

    const [params, payload] = client.designToken.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', designTokenId: 'dt-1' })
    expect(payload.sys.version).toBe(7)
    expect(payload.name).toBe('Primary Blue')
  })

  test('skips task when includeExperienceOrchestration is false', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: baseDestinationData,
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(client.designToken.upsert).not.toHaveBeenCalled()
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const upsertError = new Error('422 validation failed')
    client.designToken.upsert = jest.fn((_params, _payload) => Promise.reject(upsertError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: { ...baseDestinationData, designTokens: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(upsertError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

// ─── Experience ───────────────────────────────────────────────────────────────

describe('Importing Experiences', () => {
  const experienceTemplate = { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/press-release' } }
  const entity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, experienceTemplate }, name: 'My Experience' }

  test('CREATE: calls upsert with id in sys and experienceTemplate hoisted from sys', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [entity] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experience.upsert).toHaveBeenCalledTimes(1)
    expect(client.experience.create).not.toHaveBeenCalled()

    const [params, payload] = client.experience.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' })
    expect(payload.sys.id).toBe('exp-1')
    expect(payload.sys.type).toBe('Experience')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.experienceTemplate).toEqual(experienceTemplate)
    expect(payload.name).toBe('My Experience')
  })

  test('UPDATE: calls upsert with destination sys.version and omits experienceTemplate (once an Experience is created, its experienceTemplate cannot be changed to a different experienceTemplate)', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 6 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [entity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = client.experience.upsert.mock.calls[0]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' })
    expect(payload.sys.version).toBe(6)
    expect(payload).not.toHaveProperty('experienceTemplate')
    expect(payload.name).toBe('My Experience')
  })

  test('attaches the entity to the error before emitting, and continues on failure', async () => {
    const client = mockClient();
    const upsertError = new Error('422 validation failed')
    client.experience.upsert = jest.fn((_params, _payload) => Promise.reject(upsertError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experiences: [entity] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(upsertError)
    expect((errorCall?.[1] as any).entity).toBe(entity)
    emitSpy.mockRestore()
  })
})

describe('Publishing Experiences', () => {
  const experienceTemplate = { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/press-release' } }
  const publishedEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, publishedVersion: 1, experienceTemplate }, name: 'My Experience' }
  const draftEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, experienceTemplate }, name: 'My Experience' }
  const destinationEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 6 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experience.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1', version: 6 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experience.publish).not.toHaveBeenCalled()
  })

  test('does not attempt to publish when no experiences are present in the import payload', async () => {
    const client = mockClient();
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experience.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const client = mockClient();
    const publishError = new Error('422 validation failed')
    client.experience.publish = jest.fn(() => Promise.reject(publishError))
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experiences: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBe(publishError)
    expect((errorCall?.[1] as any).entity.sys.id).toBe('exp-1')
    emitSpy.mockRestore()
  })
})

// ─── Unpublishing ───────────────────────────────────────────────────────────────────────
// Covers the fix for the bug where a source-side unpublish never propagated on re-import:
// no unpublish task existed at all for any ExO entity type before this change.

describe('Unpublishing Components', () => {
  const draftInSource: any = { sys: { id: 'ct-1', type: 'Component', version: 3 }, name: 'Hero' }
  const publishedInSource: any = { sys: { id: 'ct-1', type: 'Component', version: 3, publishedVersion: 3 }, name: 'Hero' }

  function makePlainClientWithPublishedDestination() {
    const client = mockClient();
    client.component.upsert = jest.fn((_params: any, _payload: any) => Promise.resolve({ sys: { id: 'ct-1', version: 7, publishedVersion: 7 } } as ComponentProps))
    return client
  }

  test('unpublishes an entity that is published at the destination but draft in the source', async () => {
    const client = makePlainClientWithPublishedDestination()
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7, publishedVersion: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.unpublish).toHaveBeenCalledTimes(1)
    expect(client.component.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1', version: 7 }
    )
  })

  test('does not unpublish an entity that is published in both source and destination', async () => {
    const client = makePlainClientWithPublishedDestination()
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7, publishedVersion: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [publishedInSource] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.unpublish).not.toHaveBeenCalled()
  })

  test('does not unpublish an entity that was never published at the destination', async () => {
    const client = mockClient();
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 3 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.unpublish).not.toHaveBeenCalled()
  })

  test('skips unpublishing when skipContentPublishing is set', async () => {
    const client = makePlainClientWithPublishedDestination()
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7, publishedVersion: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      skipContentPublishing: true,
      requestQueue
    }).run({ data: {} })

    expect(client.component.unpublish).not.toHaveBeenCalled()
  })
})

describe('Unpublishing Data Assemblies', () => {
  test('unpublishes an entity that is published at the destination but draft in the source', async () => {
    const client = mockClient();
    client.dataAssembly.update = jest.fn((_params: any, _payload: any) => Promise.resolve({ sys: { id: 'da-1', version: 5, publishedVersion: 5 } } as DataAssemblyProps))
    const draftInSource: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 5, dataType: [] }, name: 'Assembly', metadata: { tags: [] }, parameters: {}, resolvers: {}, return: { $literal: null } }
    const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 5, publishedVersion: 5, dataType: [] } }
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.dataAssembly.unpublish).toHaveBeenCalledTimes(1)
    expect(client.dataAssembly.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1', version: 5 }
    )
  })
})

describe('Unpublishing Experience Templates', () => {
  test('unpublishes an entity that is published at the destination but draft in the source', async () => {
    const client = mockClient();
    client.experienceTemplate.upsert = jest.fn((_params: any, _payload: any) => Promise.resolve({ sys: { id: 'tmpl-1', version: 4, publishedVersion: 4 } } as ExperienceTemplateProps))
    const draftInSource: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 4 }, name: 'Press Release' }
    const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 4, publishedVersion: 4 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceTemplate.unpublish).toHaveBeenCalledTimes(1)
    expect(client.experienceTemplate.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1', version: 4 }
    )
  })
})

describe('Unpublishing Experience Fragments', () => {
  const component = { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero' } }

  test('unpublishes an entity that is published at the destination but draft in the source', async () => {
    const client = mockClient();
    client.experienceFragment.upsert = jest.fn((_params: any, _payload: any) => Promise.resolve({ sys: { id: 'frag-1', version: 4, publishedVersion: 4 } } as ExperienceFragmentProps))
    const draftInSource: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 4, component }, name: 'Hero Fragment' }
    const destinationEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 4, publishedVersion: 4 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experienceFragment.unpublish).toHaveBeenCalledTimes(1)
    expect(client.experienceFragment.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1', version: 4 }
    )
  })
})

describe('Unpublishing Experiences', () => {
  const experienceTemplate = { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/press-release' } }

  test('unpublishes an entity that is published at the destination but draft in the source', async () => {
    const client = mockClient();
    client.experience.upsert = jest.fn((_params: any, _payload: any) => Promise.resolve({ sys: { id: 'exp-1', version: 8, publishedVersion: 8 } } as ExperienceProps))
    const draftInSource: any = { sys: { id: 'exp-1', type: 'Experience', version: 8, experienceTemplate }, name: 'My Experience' }
    const destinationEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 8, publishedVersion: 8 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [draftInSource] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(client.experience.unpublish).toHaveBeenCalledTimes(1)
    expect(client.experience.unpublish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1', version: 8 }
    )
  })
})
