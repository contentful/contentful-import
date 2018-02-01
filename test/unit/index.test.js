import contentfulImport from '../../lib/index'
import { resolve } from 'path'

import pushToSpaceStub from 'contentful-batch-libs/dist/push/push-to-space'
import transformSpaceStub from 'contentful-batch-libs/dist/transform/transform-space'
import createClientsStub from 'contentful-batch-libs/dist/utils/create-clients'
import getDestinationResponseStub from '../../lib/get-destination-response'

jest.mock('../../lib/get-destination-response', () => {
  return jest.fn(() => Promise.resolve({
    contentTypes: [],
    entries: [],
    assets: [],
    locales: [{
      name: 'German (Germany)',
      internal_code: 'de-DE',
      code: 'de-DE',
      default: true
    }]
  }))
})
jest.mock('contentful-batch-libs/dist/push/push-to-space', () => {
  return jest.fn(() => Promise.resolve({}))
})
jest.mock('contentful-batch-libs/dist/transform/transform-space', () => {
  return jest.fn(() => Promise.resolve({
    contentTypes: [],
    entries: [],
    assets: [],
    locales: [
      {
        name: 'German (Germany)',
        code: 'de-DE',
        default: false
      },
      {
        name: 'U.S. English',
        code: 'en-US',
        default: true
      }
    ]
  }))
})
jest.mock('contentful-batch-libs/dist/utils/create-clients', () => {
  return jest.fn(() => (
    { source: {delivery: {}}, destination: {management: {}} }
  ))
})

afterEach(() => {
  createClientsStub.mockClear()
  getDestinationResponseStub.mockClear()
  transformSpaceStub.mockClear()
  pushToSpaceStub.mockClear()
})

test('Runs Contentful Import', () => {
  return contentfulImport({
    content: {},
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile'
  })
    .then(() => {
      expect(createClientsStub.mock.calls).toHaveLength(1)
      expect(getDestinationResponseStub.mock.calls).toHaveLength(1)
      expect(transformSpaceStub.mock.calls).toHaveLength(1)
      expect(pushToSpaceStub.mock.calls).toHaveLength(1)
    })
})

test('Creates a valid and correct opts object', () => {
  const errorLogFile = 'errorlogfile.json'
  const exampleConfig = require('../../example-config.json')

  return contentfulImport({
    errorLogFile,
    config: resolve(__dirname, '..', '..', 'example-config.json'),
    content: {}
  })
    .then(() => {
      const opts = createClientsStub.mock.calls[0][0]
      expect(opts.skipContentModel).toBeFalsy()
      expect(opts.errorLogFile).toBe(resolve(process.cwd(), errorLogFile))
      expect(opts.spaceId).toBe(exampleConfig.spaceId)
    })
})

test('Stops import when default locales does not match', () => {
  const errorLogFile = 'errorlogfile.json'
  expect.assertions(1)
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
    }
  }).catch((err) => expect(err.name).toBe('ContentfulMultiError'))
})
