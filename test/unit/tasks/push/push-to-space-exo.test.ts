import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

// logEmitter is a plain node:events EventEmitter. Node treats 'error' as a special
// event name and throws synchronously if it's emitted with no listener attached, so
// register a no-op listener before any test exercises an error/log-and-continue path.
logEmitter.on('error', () => {})

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

function makeClientMock() {
  return {
    getSpace: jest.fn(() => Promise.resolve({
      getEnvironment: jest.fn(() => Promise.resolve({
        getEditorInterfaceForContentType: jest.fn(() => Promise.resolve({ update: jest.fn() }))
      }))
    }))
  }
}

// Upsert/update mocks echo back the version from the payload (as the real API does on
// both create and update) so downstream Publishing tasks see a realistic sys.version.
function echoVersion(id: string) {
  return jest.fn((_params: any, payload: any) => Promise.resolve({ sys: { id, version: payload.sys.version ?? 1 } }))
}

function makePlainClientMock() {
  return {
    designToken: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'dt-1' } })),
      upsert: echoVersion('dt-1')
    },
    componentType: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
      upsert: echoVersion('ct-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } }))
    },
    template: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
      upsert: echoVersion('tmpl-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } }))
    },
    fragment: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      upsert: echoVersion('frag-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } }))
    },
    dataAssembly: {
      update: echoVersion('da-1'),
      create: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } })),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } }))
    },
    experience: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      upsert: echoVersion('exp-1'),
      publish: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } }))
    }
  }
}

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

// ─── ComponentType ────────────────────────────────────────────────────────────

describe('Importing Component Types', () => {
  const entity: any = { sys: { id: 'ct-1', type: 'ComponentType', version: 3 }, name: 'Hero' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [entity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.componentType.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.componentType.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentTypeId: 'ct-1' })
    expect(payload.sys.id).toBe('ct-1')
    expect(payload.sys.type).toBe('ComponentType')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Hero')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'ComponentType', version: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [entity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.upsert).toHaveBeenCalledTimes(1)
    const [params, payload] = plainClient.componentType.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentTypeId: 'ct-1' })
    expect(payload.sys.version).toBe(7)
    expect(payload.name).toBe('Hero')
  })

  test('skips task when includeExperienceOrchestration is false', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [entity] } as any,
      destinationData: baseDestinationData,
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.upsert).not.toHaveBeenCalled()
  })
})

describe('Publishing Component Types', () => {
  const publishedEntity: any = { sys: { id: 'ct-1', type: 'ComponentType', version: 2, publishedVersion: 2 }, name: 'Hero' }
  const draftEntity: any = { sys: { id: 'ct-1', type: 'ComponentType', version: 3 }, name: 'Hero' }
  const destinationEntity: any = { sys: { id: 'ct-1', type: 'ComponentType', version: 7 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.publish).toHaveBeenCalledTimes(1)
    expect(plainClient.componentType.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', componentTypeId: 'ct-1', version: 7 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.publish).not.toHaveBeenCalled()
  })

  test('skips publishing when skipContentPublishing is set', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      skipContentPublishing: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.componentType.publish).not.toHaveBeenCalled()
  })

  test('logs and continues when publish fails, without throwing', async () => {
    const plainClient = makePlainClientMock()
    plainClient.componentType.publish = jest.fn(() => Promise.reject(new Error('422 validation failed')))
    await expect(pushToSpace({
      sourceData: { ...baseSourceData, componentTypes: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, componentTypes: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).resolves.not.toThrow()
  })
})

// ─── Template ─────────────────────────────────────────────────────────────────

describe('Importing Templates', () => {
  const entity: any = { sys: { id: 'tmpl-1', type: 'Template', version: 2 }, name: 'Landing Page' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, templates: [entity] } as any,
      destinationData: { ...baseDestinationData, templates: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.template.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.template.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.template.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', templateId: 'tmpl-1' })
    expect(payload.sys.id).toBe('tmpl-1')
    expect(payload.sys.type).toBe('Template')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Landing Page')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'Template', version: 5 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, templates: [entity] } as any,
      destinationData: { ...baseDestinationData, templates: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = plainClient.template.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', templateId: 'tmpl-1' })
    expect(payload.sys.version).toBe(5)
    expect(payload.name).toBe('Landing Page')
  })
})

describe('Publishing Templates', () => {
  const publishedEntity: any = { sys: { id: 'tmpl-1', type: 'Template', version: 1, publishedVersion: 1 }, name: 'Landing Page' }
  const draftEntity: any = { sys: { id: 'tmpl-1', type: 'Template', version: 2 }, name: 'Landing Page' }
  const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'Template', version: 5 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, templates: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, templates: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.template.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', templateId: 'tmpl-1', version: 5 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, templates: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, templates: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.template.publish).not.toHaveBeenCalled()
  })
})

// ─── Fragment ─────────────────────────────────────────────────────────────────

describe('Importing Fragments', () => {
  const componentType = { sys: { type: 'ResourceLink', linkType: 'Contentful:ComponentType', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/hero' } }
  const entity: any = { sys: { id: 'frag-1', type: 'Fragment', version: 1, componentType }, name: 'Hero Fragment' }

  test('CREATE: calls upsert with id in sys and componentType hoisted from sys', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, fragments: [entity] } as any,
      destinationData: { ...baseDestinationData, fragments: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.fragment.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.fragment.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.fragment.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', fragmentId: 'frag-1' })
    expect(payload.sys.id).toBe('frag-1')
    expect(payload.sys.type).toBe('Fragment')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.componentType).toEqual(componentType)
    expect(payload.name).toBe('Hero Fragment')
  })

  test('UPDATE: calls upsert with destination sys.version and omits componentType (immutable after creation)', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'frag-1', type: 'Fragment', version: 4 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, fragments: [entity] } as any,
      destinationData: { ...baseDestinationData, fragments: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = plainClient.fragment.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', fragmentId: 'frag-1' })
    expect(payload.sys.version).toBe(4)
    expect(payload.componentType).toBeUndefined()
  })
})

describe('Publishing Fragments', () => {
  const publishedEntity: any = { sys: { id: 'frag-1', type: 'Fragment', version: 1, publishedVersion: 1 }, name: 'Hero Fragment' }
  const draftEntity: any = { sys: { id: 'frag-1', type: 'Fragment', version: 1 }, name: 'Hero Fragment' }
  const destinationEntity: any = { sys: { id: 'frag-1', type: 'Fragment', version: 4 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, fragments: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, fragments: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.fragment.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', fragmentId: 'frag-1', version: 4 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, fragments: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, fragments: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.fragment.publish).not.toHaveBeenCalled()
  })
})

// ─── DataAssembly ─────────────────────────────────────────────────────────────

describe('Importing Data Assemblies', () => {
  const entity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }

  test('CREATE: calls dataAssembly.update with version 0 to preserve id when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [entity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.dataAssembly.update).toHaveBeenCalledTimes(1)
    expect(plainClient.dataAssembly.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.dataAssembly.update.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1' })
    expect(payload.sys.id).toBe('da-1')
    expect(payload.sys.type).toBe('DataAssembly')
    expect(payload.sys.version).toBe(0)
    expect(payload.sys.dataType).toEqual(entity.sys.dataType)
    expect(payload.name).toBe('My Assembly')
  })

  test('UPDATE: calls dataAssembly.update (not create) with destination sys.version when entity exists', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 9 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [entity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.dataAssembly.update).toHaveBeenCalledTimes(1)
    expect(plainClient.dataAssembly.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.dataAssembly.update.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1' })
    expect(payload.sys.version).toBe(9)
    expect(payload.name).toBe('My Assembly')
  })

  test('UPDATE: strips server-managed sys fields from a published source entity', async () => {
    const plainClient = makePlainClientMock()
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
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [, payload] = plainClient.dataAssembly.update.mock.calls[0] as unknown as [any, any]
    expect(payload.sys).toEqual({ id: 'da-1', type: 'DataAssembly', dataType: publishedEntity.sys.dataType, version: 9 })
  })
})

describe('Publishing Data Assemblies', () => {
  const publishedEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, publishedVersion: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }
  const draftEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 2, dataType: [{ id: 'headline', name: 'Headline', type: 'Symbol' }] }, name: 'My Assembly' }
  const destinationEntity: any = { sys: { id: 'da-1', type: 'DataAssembly', version: 9 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.dataAssembly.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', dataAssemblyId: 'da-1', version: 9 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, dataAssemblies: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, dataAssemblies: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.dataAssembly.publish).not.toHaveBeenCalled()
  })
})

// ─── DesignToken ──────────────────────────────────────────────────────────────

describe('Importing Design Tokens', () => {
  const entity: any = { sys: { id: 'dt-1', type: 'DesignToken', version: 2 }, name: 'Primary Blue', type: 'DTCG.Color' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: { ...baseDestinationData, designTokens: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.designToken.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.designToken.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.designToken.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', designTokenId: 'dt-1' })
    expect(payload.sys.id).toBe('dt-1')
    expect(payload.sys.type).toBe('DesignToken')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Primary Blue')
    expect(payload.type).toBe('DTCG.Color')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'dt-1', type: 'DesignToken', version: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: { ...baseDestinationData, designTokens: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.designToken.upsert).toHaveBeenCalledTimes(1)
    const [params, payload] = plainClient.designToken.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', designTokenId: 'dt-1' })
    expect(payload.sys.version).toBe(7)
    expect(payload.name).toBe('Primary Blue')
  })

  test('skips task when includeExperienceOrchestration is false', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, designTokens: [entity] } as any,
      destinationData: baseDestinationData,
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.designToken.upsert).not.toHaveBeenCalled()
  })
})

// ─── Experience ───────────────────────────────────────────────────────────────

describe('Importing Experiences', () => {
  const template = { sys: { type: 'ResourceLink', linkType: 'Contentful:Template', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/press-release' } }
  const entity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, template }, name: 'My Experience' }

  test('CREATE: calls upsert with id in sys and template hoisted from sys', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [entity] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experience.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.experience.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.experience.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' })
    expect(payload.sys.id).toBe('exp-1')
    expect(payload.sys.type).toBe('Experience')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.template).toEqual(template)
    expect(payload.name).toBe('My Experience')
  })

  test('UPDATE: calls upsert with destination sys.version and omits template (immutable after creation)', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 6 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [entity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = plainClient.experience.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1' })
    expect(payload.sys.version).toBe(6)
    expect(payload.template).toBeUndefined()
    expect(payload.name).toBe('My Experience')
  })
})

describe('Publishing Experiences', () => {
  const template = { sys: { type: 'ResourceLink', linkType: 'Contentful:Template', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/templates/press-release' } }
  const publishedEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, publishedVersion: 1, template }, name: 'My Experience' }
  const draftEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, template }, name: 'My Experience' }
  const destinationEntity: any = { sys: { id: 'exp-1', type: 'Experience', version: 6 } }

  test('publishes an entity that was published in the source, at the destination version', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [publishedEntity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experience.publish).toHaveBeenCalledWith(
      { spaceId: 'space-1', environmentId: 'master', experienceId: 'exp-1', version: 6 }
    )
  })

  test('does not publish an entity that was draft in the source', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [draftEntity] } as any,
      destinationData: { ...baseDestinationData, experiences: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experience.publish).not.toHaveBeenCalled()
  })

  test('does not attempt to publish when no experiences are present in the import payload', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experiences: [] } as any,
      destinationData: { ...baseDestinationData, experiences: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experience.publish).not.toHaveBeenCalled()
  })
})
