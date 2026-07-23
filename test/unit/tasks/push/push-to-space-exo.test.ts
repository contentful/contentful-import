import PQueue from 'p-queue'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'

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

function makePlainClientMock() {
  return {
    componentType: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
    },
    template: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
    },
    fragment: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'frag-1' } })),
    },
    dataAssembly: {
      update: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } })),
      create: jest.fn(() => Promise.resolve({ sys: { id: 'da-1' } }))
    },
    experience: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'exp-1' } })),
    },
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

  test('UPDATE: calls upsert with componentType hoisted and destination sys.version', async () => {
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
    expect(payload.componentType).toEqual(componentType)
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

  test('UPDATE: calls upsert with template hoisted and destination sys.version', async () => {
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
    expect(payload.template).toEqual(template)
    expect(payload.name).toBe('My Experience')
  })
})
