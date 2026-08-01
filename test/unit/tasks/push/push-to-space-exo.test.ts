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
    designToken: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'dt-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'dt-1' } })),
    },
    component: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'ct-1' } })),
    },
    experienceTemplate: {
      create: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
      upsert: jest.fn(() => Promise.resolve({ sys: { id: 'tmpl-1' } })),
    },
    experienceFragment: {
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

// ─── Component ────────────────────────────────────────────────────────────

describe('Importing Components', () => {
  const entity: any = { sys: { id: 'ct-1', type: 'Component', version: 3 }, name: 'Hero' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.component.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.component.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.component.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1' })
    expect(payload.sys.id).toBe('ct-1')
    expect(payload.sys.type).toBe('Component')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Hero')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'ct-1', type: 'Component', version: 7 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.component.upsert).toHaveBeenCalledTimes(1)
    const [params, payload] = plainClient.component.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', componentId: 'ct-1' })
    expect(payload.sys.version).toBe(7)
    expect(payload.name).toBe('Hero')
  })

  test('skips task when includeExperienceOrchestration is false', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: baseDestinationData,
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: false,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.component.upsert).not.toHaveBeenCalled()
  })
})

// ─── ExperienceTemplate ─────────────────────────────────────────────────────────────────

describe('Importing Experience Templates', () => {
  const entity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 2 }, name: 'Landing Page' }

  test('CREATE: calls upsert with id in sys when entity does not exist in destination', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experienceTemplate.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.experienceTemplate.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.experienceTemplate.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1' })
    expect(payload.sys.id).toBe('tmpl-1')
    expect(payload.sys.type).toBe('ExperienceTemplate')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.name).toBe('Landing Page')
  })

  test('UPDATE: calls upsert with destination sys.version when entity exists in destination', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'tmpl-1', type: 'ExperienceTemplate', version: 5 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceTemplates: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceTemplates: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = plainClient.experienceTemplate.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceTemplateId: 'tmpl-1' })
    expect(payload.sys.version).toBe(5)
    expect(payload.name).toBe('Landing Page')
  })
})

// ─── ExperienceFragment ─────────────────────────────────────────────────────────────────

describe('Importing Experience Fragments', () => {
  const component = { sys: { type: 'ResourceLink', linkType: 'Contentful:Component', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/components/hero' } }
  const entity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1, component }, name: 'Hero Fragment' }

  test('CREATE: calls upsert with id in sys and component hoisted from sys', async () => {
    const plainClient = makePlainClientMock()
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    expect(plainClient.experienceFragment.upsert).toHaveBeenCalledTimes(1)
    expect(plainClient.experienceFragment.create).not.toHaveBeenCalled()
    const [params, payload] = plainClient.experienceFragment.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1' })
    expect(payload.sys.id).toBe('frag-1')
    expect(payload.sys.type).toBe('ExperienceFragment')
    expect(payload.sys).not.toHaveProperty('version')
    expect(payload.component).toEqual(component)
    expect(payload.name).toBe('Hero Fragment')
  })

  test('UPDATE: calls upsert with component hoisted and destination sys.version', async () => {
    const plainClient = makePlainClientMock()
    const destinationEntity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 4 } }
    await pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [destinationEntity] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })

    const [params, payload] = plainClient.experienceFragment.upsert.mock.calls[0] as unknown as [any, any]
    expect(params).toEqual({ spaceId: 'space-1', environmentId: 'master', experienceFragmentId: 'frag-1' })
    expect(payload.sys.version).toBe(4)
    expect(payload.component).toEqual(component)
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
  const experienceTemplate = { sys: { type: 'ResourceLink', linkType: 'Contentful:ExperienceTemplate', urn: 'crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/press-release' } }
  const entity: any = { sys: { id: 'exp-1', type: 'Experience', version: 1, experienceTemplate }, name: 'My Experience' }

  test('CREATE: calls upsert with id in sys and experienceTemplate hoisted from sys', async () => {
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
    expect(payload.experienceTemplate).toEqual(experienceTemplate)
    expect(payload.name).toBe('My Experience')
  })

  test('UPDATE: calls upsert with experienceTemplate hoisted and destination sys.version', async () => {
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
    expect(payload.experienceTemplate).toEqual(experienceTemplate)
    expect(payload.name).toBe('My Experience')
  })
})
