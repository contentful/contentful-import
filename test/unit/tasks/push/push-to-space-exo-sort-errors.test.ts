import PQueue from 'p-queue'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

// logEmitter is a plain node:events EventEmitter. Node treats 'error' as a special
// event name and throws synchronously if it's emitted with no listener attached, so
// register a no-op listener before any test exercises an error/log-and-continue path.
logEmitter.on('error', () => {})

jest.mock('../../../../lib/utils/sort-components', () => ({
  __esModule: true,
  default: jest.fn(() => {
    throw new Error('malformed componentTree')
  })
}))
jest.mock('../../../../lib/utils/sort-experience-fragments', () => ({
  __esModule: true,
  default: jest.fn(() => {
    throw new Error('malformed slots')
  })
}))

// Imported after the mocks above so push-to-space picks up the mocked sort modules.
import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'

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
    component: { upsert: jest.fn(), publish: jest.fn() },
    experienceFragment: { upsert: jest.fn(), publish: jest.fn() }
  }
}

let requestQueue: PQueue

beforeEach(() => {
  requestQueue = new PQueue({ interval: 1000, intervalCap: 1000 })
})

describe('Importing Components: setup-code failures', () => {
  const entity: any = { sys: { id: 'ct-1', type: 'Component', version: 1 }, name: 'Hero' }

  test('logs the sort failure via logEmitter and still aborts the run', async () => {
    const plainClient = makePlainClientMock()
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, components: [entity] } as any,
      destinationData: { ...baseDestinationData, components: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).rejects.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBeInstanceOf(Error)
    expect((errorCall?.[1] as Error).message).toBe('malformed componentTree')
    expect(plainClient.component.upsert).not.toHaveBeenCalled()
    emitSpy.mockRestore()
  })
})

describe('Importing Experience Fragments: setup-code failures', () => {
  const entity: any = { sys: { id: 'frag-1', type: 'ExperienceFragment', version: 1 }, name: 'Hero Fragment' }

  test('logs the sort failure via logEmitter and still aborts the run', async () => {
    const plainClient = makePlainClientMock()
    const emitSpy = jest.spyOn(logEmitter, 'emit')

    await expect(pushToSpace({
      sourceData: { ...baseSourceData, experienceFragments: [entity] } as any,
      destinationData: { ...baseDestinationData, experienceFragments: [] },
      client: makeClientMock(),
      plainClient,
      spaceId: 'space-1',
      environmentId: 'master',
      includeExperienceOrchestration: true,
      requestQueue
    }).run({ data: {} })).rejects.toThrow()

    const errorCall = emitSpy.mock.calls.find((args) => args[0] === 'error')
    expect(errorCall?.[1]).toBeInstanceOf(Error)
    expect((errorCall?.[1] as Error).message).toBe('malformed slots')
    expect(plainClient.experienceFragment.upsert).not.toHaveBeenCalled()
    emitSpy.mockRestore()
  })
})
