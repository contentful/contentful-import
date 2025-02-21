import { resolve } from 'path'

import TableStub from 'cli-table3'

import pushToSpaceStub from '../../lib/tasks/push-to-space/push-to-space'
import transformSpaceStub from '../../lib/transform/transform-space'
import initClientStub from '../../lib/tasks/init-client'
import getDestinationResponseStub from '../../lib/tasks/get-destination-data'
import contentfulImport from '../../lib/index'
import * as validations from '../../lib/utils/validations'
import { Mock } from 'vitest'
import Listr from 'listr'

vi.mock('cli-table3')
vi.mock('../../lib/utils/validations', () => {
  return {
    assertPayload: vi.fn(),
    assertDefaultLocale: vi.fn()
  }
})

vi.mock('../../lib/tasks/get-destination-data', () => ({
  default: vi.fn(() => Promise.resolve({
    entries: [
      { sys: { id: 'entry1' } },
      { sys: { id: 'entry2' } }
    ],
    assets: [
      { sys: { id: 'asset1' } },
      { sys: { id: 'asset2' } }
    ],
    contentTypes: [
      { sys: { id: 'contentType1' } },
      { sys: { id: 'contentType2' } }
    ],
    editorInterfaces: [
      { sys: { id: 'editorInterface1' } },
      { sys: { id: 'editorInterface2' } }
    ],
    locales: [{
      name: 'German (Germany)',
      code: 'de-DE',
      default: true
    }]
  }))
}))
vi.mock('../../lib/tasks/push-to-space/push-to-space', () => ({
  default: vi.fn().mockImplementation(() =>
    new Listr([{
      title: 'Fake push to space',
      task: (ctx: { data: any; sourceData: any }) => {
        ctx.data = ctx.sourceData
      }
    }])
  )
}))
vi.mock('../../lib/transform/transform-space', () => ({
  default: vi.fn().mockImplementation(data => data)
}))
vi.mock('../../lib/tasks/init-client', () => ({
  default: vi.fn().mockImplementation(() => ({
    source: { delivery: {} },
    destination: { management: {} }
  }))
}))

afterEach(() => {
  (initClientStub as Mock).mockClear();
  (getDestinationResponseStub as Mock).mockClear();
  (transformSpaceStub as Mock).mockClear();
  (pushToSpaceStub as Mock).mockClear();
  (TableStub as Mock).mockClear()
})

test('Stops import when default locales does not match', async () => {
  const errorLogFile = 'errorlogfile.json';
  (validations.assertDefaultLocale as Mock).mockImplementationOnce(() => { throw new Error('Invalid locale error') })
  expect.assertions(1)

  const wrappedFunc = () => {
    return contentfulImport({
      errorLogFile,
      config: resolve(__dirname, '..', '..', 'example-config.json'),
      content: {
        locales: [
          {
            name: 'German (Germany)',
            code: 'de-DE',
            default: false
          },
          {
            name: 'U.S English',
            code: 'en-US',
            default: true
          }
        ]
      },
      spaceId: 'SPACE_ID',
      managementToken: 'MANAGEMENT_TOKEN'
    })
  }

  let err
  await wrappedFunc()
    .catch(e => { err = e })

  expect(err.name).toBe('ContentfulMultiError')
})
test('Runs Contentful Import', () => {
  return contentfulImport({
    content: {
      entries: [
        { sys: { id: 'entry1' } },
        { sys: { id: 'entry2' } }
      ],
      assets: [
        { sys: { id: 'asset1' } },
        { sys: { id: 'asset2' } }
      ],
      tags: [
        { sys: { id: 'tag1' }, name: 'tag1' },
        { sys: { id: 'tag2' }, name: 'tag2' }
      ],
      contentTypes: [
        { sys: { id: 'contentType1' } },
        { sys: { id: 'contentType2' } }
      ],
      editorInterfaces: [
        { sys: { id: 'editorInterface1' } },
        { sys: { id: 'editorInterface2' } }
      ],
      locales: [
        {
          name: 'German (Germany)',
          code: 'de-DE',
          default: true
        },
        {
          name: 'U.S. English',
          code: 'en-US',
          default: false
        }
      ]
    },
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile'
  })
    .then(() => {
      expect((initClientStub as Mock).mock.calls).toHaveLength(1)
      expect((getDestinationResponseStub as Mock).mock.calls).toHaveLength(1)
      expect((transformSpaceStub as Mock).mock.calls).toHaveLength(1)
      expect((pushToSpaceStub as Mock).mock.calls).toHaveLength(1)

      const introTable = (TableStub as Mock).mock.instances[0]
      expect(introTable.push.mock.calls[0][0]).toEqual([{ colSpan: 2, content: 'The following entities are going to be imported:' }])
      expect(introTable.push.mock.calls[1][0]).toEqual(['Entries', 2])
      expect(introTable.push.mock.calls[2][0]).toEqual(['Assets', 2])
      expect(introTable.push.mock.calls[3][0]).toEqual(['Tags', 2])
      expect(introTable.push.mock.calls[4][0]).toEqual(['Content Types', 2])
      expect(introTable.push.mock.calls[5][0]).toEqual(['Editor Interfaces', 2])
      expect(introTable.push.mock.calls[6][0]).toEqual(['Locales', 2])
      expect(introTable.push.mock.calls[7][0]).toEqual(['Webhooks', 0])
      expect(introTable.push.mock.calls).toHaveLength(8)

      const resultTable = (TableStub as Mock).mock.instances[1]
      expect(resultTable.push.mock.calls[0][0]).toEqual([{ colSpan: 2, content: 'Imported entities' }])
      expect(resultTable.push.mock.calls[1][0]).toEqual(['Entries', 2])
      expect(resultTable.push.mock.calls[2][0]).toEqual(['Assets', 2])
      expect(resultTable.push.mock.calls[3][0]).toEqual(['Tags', 2])
      expect(resultTable.push.mock.calls[4][0]).toEqual(['Content Types', 2])
      expect(resultTable.push.mock.calls[5][0]).toEqual(['Editor Interfaces', 2])
      expect(resultTable.push.mock.calls[6][0]).toEqual(['Locales', 2])
      expect(resultTable.push.mock.calls[7][0]).toEqual(['Webhooks', 0])
      expect(resultTable.push.mock.calls).toHaveLength(8)
    })
})

test('Creates a valid and correct opts object', () => {
  const errorLogFile = 'errorlogfile.json'
  const exampleConfig = require('../../example-config.json')

  return contentfulImport({
    errorLogFile,
    config: resolve(__dirname, '..', '..', 'example-config.json'),
    content: {},
    timeout: 500,
    retryLimit: 2,
    spaceId: 'SPACE_ID',
    managementToken: 'MANAGEMENT_TOKEN'
  })
    .then(() => {
      const opts = (initClientStub as Mock).mock.calls[0][0]
      expect(opts.skipContentModel).toBeFalsy()
      expect(opts.errorLogFile).toBe(resolve(process.cwd(), errorLogFile))
      expect(opts.spaceId).toBe(exampleConfig.spaceId)
      expect(opts.timeout).toBe(500)
      expect(opts.retryLimit).toBe(2)
    })
})

test('Intro CLI table respects skipContentModel', () => {
  return contentfulImport({
    content: {
      entries: [
        { sys: { id: 'entry1' } },
        { sys: { id: 'entry2' } }
      ],
      assets: [
        { sys: { id: 'asset1' } },
        { sys: { id: 'asset2' } }
      ],
      contentTypes: [
        { sys: { id: 'contentType1' } },
        { sys: { id: 'contentType2' } }
      ],
      editorInterfaces: [
        { sys: { id: 'editorInterface1' } },
        { sys: { id: 'editorInterface2' } }
      ],
      locales: [
        {
          name: 'German (Germany)',
          code: 'de-DE',
          default: true
        },
        {
          name: 'U.S. English',
          code: 'en-US',
          default: false
        }
      ]
    },
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile',
    skipContentModel: true
  })
    .then(() => {
      const introTable = (TableStub as Mock).mock.instances[0]
      expect(introTable.push.mock.calls[0][0]).toEqual([{ colSpan: 2, content: 'The following entities are going to be imported:' }])
      expect(introTable.push.mock.calls[1][0]).toEqual(['Entries', 2])
      expect(introTable.push.mock.calls[2][0]).toEqual(['Assets', 2])
      expect(introTable.push.mock.calls[3][0]).toEqual(['Locales', 2])
      expect(introTable.push.mock.calls[4][0]).toEqual(['Tags', 0])
      expect(introTable.push.mock.calls[5][0]).toEqual(['Webhooks', 0])
      expect(introTable.push.mock.calls).toHaveLength(6)
    })
})

test('Intro CLI table respects contentModelOnly and skipLocales', () => {
  return contentfulImport({
    content: {
      entries: [
        { sys: { id: 'entry1' } },
        { sys: { id: 'entry2' } }
      ],
      assets: [
        { sys: { id: 'asset1' } },
        { sys: { id: 'asset2' } }
      ],
      contentTypes: [
        { sys: { id: 'contentType1' } },
        { sys: { id: 'contentType2' } }
      ],
      editorInterfaces: [
        { sys: { id: 'editorInterface1' } },
        { sys: { id: 'editorInterface2' } }
      ],
      locales: [
        {
          name: 'German (Germany)',
          code: 'de-DE',
          default: true
        },
        {
          name: 'U.S. English',
          code: 'en-US',
          default: false
        }
      ]
    },
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile',
    contentModelOnly: true,
    skipLocales: true
  })
    .then(() => {
      const introTable = (TableStub as Mock).mock.instances[0]
      expect(introTable.push.mock.calls[0][0]).toEqual([{ colSpan: 2, content: 'The following entities are going to be imported:' }])
      expect(introTable.push.mock.calls[1][0]).toEqual(['Content Types', 2])
      expect(introTable.push.mock.calls[2][0]).toEqual(['Editor Interfaces', 2])
      expect(introTable.push.mock.calls).toHaveLength(3)
    })
})
test('Intro CLI table respects contentModelOnly', () => {
  return contentfulImport({
    content: {
      entries: [
        { sys: { id: 'entry1' } },
        { sys: { id: 'entry2' } }
      ],
      assets: [
        { sys: { id: 'asset1' } },
        { sys: { id: 'asset2' } }
      ],
      tags: [],
      contentTypes: [
        { sys: { id: 'contentType1' } },
        { sys: { id: 'contentType2' } }
      ],
      editorInterfaces: [
        { sys: { id: 'editorInterface1' } },
        { sys: { id: 'editorInterface2' } }
      ],
      locales: [
        {
          name: 'German (Germany)',
          code: 'de-DE',
          default: true
        },
        {
          name: 'U.S. English',
          code: 'en-US',
          default: false
        }
      ]
    },
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile',
    contentModelOnly: true
  })
    .then(() => {
      const introTable = (TableStub as Mock).mock.instances[0]
      expect(introTable.push.mock.calls[0][0]).toEqual([{ colSpan: 2, content: 'The following entities are going to be imported:' }])
      expect(introTable.push.mock.calls[1][0]).toEqual(['Content Types', 2])
      expect(introTable.push.mock.calls[2][0]).toEqual(['Editor Interfaces', 2])
      expect(introTable.push.mock.calls[3][0]).toEqual(['Locales', 2])
      expect(introTable.push.mock.calls).toHaveLength(4)
    })
})
