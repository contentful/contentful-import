import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import {
  MissingExoFolderGroupSchemesError,
  SourceExoFolderConceptReadError,
} from '../../../../lib/utils/import-exo-folders'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ComponentProps, DataAssemblyProps, ExperienceFragmentProps, ExperienceProps, ExperienceTemplateProps } from 'contentful-management'
import { makePlainClientMock } from '../../helpers/plain-client-mock'

jest.mock('../../../../lib/utils/import-exo-folders.ts', () => {
  const actual = jest.requireActual('../../../../lib/utils/import-exo-folders.ts')
  return { ...actual, importExoFolders: jest.fn() }
})

const mockImportExoFolders = (jest.requireMock('../../../../lib/utils/import-exo-folders.ts') as { importExoFolders: jest.Mock }).importExoFolders

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

// Upsert/update mocks echo back the input version so downstream Publishing tasks
// receive a sys.version. Data Assembly passes its version in params, not the body.
function echoVersion(id: string) {
  return jest.fn((params: any, payload: any) => Promise.resolve({ sys: { id, version: params.version ?? payload.sys?.version ?? 1 } }))
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
  mockImportExoFolders.mockReset().mockResolvedValue(undefined)
})

// ─── Component ────────────────────────────────────────────────────────────

describe('Importing Components and Experience Fragments: Component payloads', () => {
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

  test('aborts before entity upsert when ExO folder setup fails', async () => {
    const missingSchemeError = new MissingExoFolderGroupSchemesError(['missing required folder scheme'])
    mockImportExoFolders.mockRejectedValueOnce(missingSchemeError)
    const client = mockClient()

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).rejects.toThrow('missing required folder scheme')

    expect(client.component.upsert).not.toHaveBeenCalled()
  })

  test('aborts before entity upsert when the source folder concept cannot be read', async () => {
    const sourceConceptError = new SourceExoFolderConceptReadError('source-folder', new Error('source folder concept not found'))
    mockImportExoFolders.mockRejectedValueOnce(sourceConceptError)
    const client = mockClient()

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).rejects.toThrow('source folder concept not found')

    expect(client.component.upsert).not.toHaveBeenCalled()
  })

  test('continues when a non-prerequisite ExO folder error occurs', async () => {
    mockImportExoFolders.mockRejectedValueOnce(new Error('folder API unavailable'))
    const client = mockClient()

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()

    expect(client.component.upsert).toHaveBeenCalledTimes(1)
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

describe('Publishing Components and Experience Fragments: Component publish', () => {
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

describe('Importing Components and Experience Fragments: Experience Fragment payloads', () => {
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

describe('Publishing Components and Experience Fragments: Experience Fragment publish', () => {
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

  test('CREATE: calls dataAssembly.update without a version to preserve id when entity does not exist in destination', async () => {
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
    expect(payload).not.toHaveProperty('sys')
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
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1', version: 9 })
    expect(payload).not.toHaveProperty('sys')
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
    expect(payload).toEqual({ name: 'My Assembly' })
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

describe('Unpublishing Components and Experience Fragments: Component unpublish', () => {
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

describe('Unpublishing Components and Experience Fragments: Experience Fragment unpublish', () => {
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

// ─── Components and Experience Fragments (combined ordering) ──────────────

describe('Importing Components and Experience Fragments', () => {
  const BASE = 'crn:contentful:::experience:spaces/$self/environments/$self'
  const compLink = (id: string) => ({ sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: `${BASE}/components/${id}` } })
  const fragLink = (id: string) => ({ sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceFragment', urn: `${BASE}/experienceFragments/${id}` } })
  const fragNode = (id: string) => ({ id: `node-${id}`, nodeType: 'ExperienceFragment', experienceFragment: fragLink(id) })

  function component(id: string, extra: Record<string, any> = {}, published = false): any {
    return {
      sys: { id, type: 'Component', version: 1, ...(published ? { publishedVersion: 1 } : {}) },
      name: id,
      componentTree: [],
      slots: [],
      ...extra
    }
  }
  function fragment(id: string, base: string, extra: Record<string, any> = {}, published = false): any {
    return {
      sys: { id, type: 'ExperienceFragment', version: 1, component: compLink(base), ...(published ? { publishedVersion: 1 } : {}) },
      name: id,
      slots: {},
      ...extra
    }
  }

  // Upserts echo the real id; publishedVersion is carried when the id is in `publishedIds`.
  function upsertFor(publishedIds: string[]) {
    return jest.fn((params: any, payload: any) => {
      const id = params.componentId ?? params.experienceFragmentId ?? params.experienceTemplateId
      return Promise.resolve({
        sys: { id, version: params.version ?? payload.sys?.version ?? 1, ...(publishedIds.includes(id) ? { publishedVersion: 1 } : {}) }
      })
    })
  }

  function clientWith(publishedIds: string[] = []) {
    const client = mockClient()
    client.component.upsert = upsertFor(publishedIds)
    client.experienceFragment.upsert = upsertFor(publishedIds)
    client.experienceTemplate.upsert = upsertFor(publishedIds)
    return client
  }

  const callOrderOf = (mock: jest.Mock, id: string) => {
    const idx = mock.mock.calls.findIndex(([params]: any[]) => (params.componentId ?? params.experienceFragmentId ?? params.experienceTemplateId) === id)
    return idx === -1 ? undefined : mock.mock.invocationCallOrder[idx]
  }

  const button = (published = false) => component('button', {}, published)
  const f1 = (published = false) => fragment('f1', 'button', {}, published)
  const c1 = (published = false) => component('c1', { componentTree: [fragNode('f1')] }, published)

  async function run(client: any, sourceData: any, destinationData: any = {}, extra: any = {}) {
    await pushToSpace({
      sourceData: { ...baseSourceData, ...sourceData } as any,
      destinationData: { ...baseDestinationData, ...destinationData },
      client,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue,
      ...extra
    }).run({ data: {} })
  }

  test('imports a composed component after the fragment it embeds, and the fragment after its base component', async () => {
    const client = clientWith()
    await run(client, { components: [c1(), button()], experienceFragments: [f1()] })

    const b = callOrderOf(client.component.upsert, 'button')!
    const f = callOrderOf(client.experienceFragment.upsert, 'f1')!
    const c = callOrderOf(client.component.upsert, 'c1')!
    expect(b).toBeLessThan(f)
    expect(f).toBeLessThan(c)
  })

  test('publishes in the same dependency order', async () => {
    const ids = ['button', 'f1', 'c1']
    const client = clientWith(ids)
    await run(client, { components: [c1(true), button(true)], experienceFragments: [f1(true)] })

    const b = callOrderOf(client.component.publish, 'button')!
    const f = callOrderOf(client.experienceFragment.publish, 'f1')!
    const c = callOrderOf(client.component.publish, 'c1')!
    expect(b).toBeLessThan(f)
    expect(f).toBeLessThan(c)
  })

  test('publishes fragments before importing templates that embed them', async () => {
    const client = clientWith(['button', 'f1'])
    const template: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 1 }, name: 'T', componentTree: [fragNode('f1')] }
    await run(client, { components: [button(true)], experienceFragments: [f1(true)], experienceTemplates: [template] })

    expect(client.experienceFragment.publish).toHaveBeenCalledTimes(1)
    expect(client.experienceTemplate.upsert).toHaveBeenCalledTimes(1)
    expect(client.experienceFragment.publish.mock.invocationCallOrder[0])
      .toBeLessThan(client.experienceTemplate.upsert.mock.invocationCallOrder[0])
  })

  test('unpublishes templates before fragments, and composed components before the fragments they embed', async () => {
    const ids = ['button', 'f1', 'c1', 'tmpl-1']
    const client = clientWith(ids)
    const template: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 1 }, name: 'T', componentTree: [fragNode('f1')] }
    const dest = (type: string, id: string): any => ({ sys: { id, type, version: 1, publishedVersion: 1 } })
    await run(
      client,
      { components: [c1(), button()], experienceFragments: [f1()], experienceTemplates: [template] },
      {
        components: [dest('Component', 'button'), dest('Component', 'c1')],
        experienceFragments: [dest('ExperienceFragment', 'f1')],
        experienceTemplates: [dest('ExperienceTemplate', 'tmpl-1')]
      }
    )

    const t = callOrderOf(client.experienceTemplate.unpublish, 'tmpl-1')!
    const c = callOrderOf(client.component.unpublish, 'c1')!
    const f = callOrderOf(client.experienceFragment.unpublish, 'f1')!
    const b = callOrderOf(client.component.unpublish, 'button')!
    expect(t).toBeLessThan(c)
    expect(c).toBeLessThan(f)
    expect(f).toBeLessThan(b)
  })

  test('warns and still imports circular references', async () => {
    const client = clientWith()
    const emitSpy = jest.spyOn(logEmitter, 'emit')
    const cyclicComponent = component('c1', { componentTree: [fragNode('f1')] })
    const cyclicFragment = fragment('f1', 'c1')
    await run(client, { components: [cyclicComponent], experienceFragments: [cyclicFragment] })

    expect(client.component.upsert).toHaveBeenCalledTimes(1)
    expect(client.experienceFragment.upsert).toHaveBeenCalledTimes(1)
    const warning = emitSpy.mock.calls.find(([level, message]) =>
      level === 'warning' && String(message).includes('Component:c1') && String(message).includes('ExperienceFragment:f1'))
    expect(warning).toBeDefined()
    emitSpy.mockRestore()
  })

  test('imports in dependency order but skips publish and unpublish when skipContentPublishing is set', async () => {
    const client = clientWith(['button', 'f1', 'c1'])
    const dest = (type: string, id: string): any => ({ sys: { id, type, version: 1, publishedVersion: 1 } })
    await run(
      client,
      { components: [c1(), button()], experienceFragments: [f1()] },
      {
        components: [dest('Component', 'button'), dest('Component', 'c1')],
        experienceFragments: [dest('ExperienceFragment', 'f1')]
      },
      { skipContentPublishing: true }
    )

    const b = callOrderOf(client.component.upsert, 'button')!
    const f = callOrderOf(client.experienceFragment.upsert, 'f1')!
    const c = callOrderOf(client.component.upsert, 'c1')!
    expect(b).toBeLessThan(f)
    expect(f).toBeLessThan(c)
    expect(client.component.publish).not.toHaveBeenCalled()
    expect(client.experienceFragment.publish).not.toHaveBeenCalled()
    expect(client.component.unpublish).not.toHaveBeenCalled()
    expect(client.experienceFragment.unpublish).not.toHaveBeenCalled()
  })
})
