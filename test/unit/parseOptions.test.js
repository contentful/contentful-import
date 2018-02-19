import { join, resolve } from 'path'

import moment from 'moment'
import HttpsProxyAgent from 'https-proxy-agent'

import parseOptions from '../../lib/parseOptions'

const spaceId = 'spaceId'
const managementToken = 'managementToken'
const contentFile = resolve(__dirname, 'example-content.json')

const basePath = resolve(__dirname, '..', '..')

test('parseOptions requires spaceId', () => {
  expect(
    () => parseOptions({})
  ).toThrow('The `spaceId` option is required.')
})

test('parseOptions requires managementToken', () => {
  expect(
    () => parseOptions({
      spaceId
    })
  ).toThrow('The `managementToken` option is required.')
})

test('parseOptions requires contentFile or content', () => {
  expect(
    () => parseOptions({
      spaceId,
      managementToken
    })
  ).toThrow('Either the `contentFile` or `content` option are required.')
  expect(
    () => parseOptions({
      spaceId,
      managementToken,
      content: {}
    })
  ).not.toThrow('Either the `contentFile` or `content` option are required.')
  expect(
    () => parseOptions({
      spaceId,
      managementToken,
      contentFile
    })
  ).not.toThrow('Either the `contentFile` or `content` option are required.')
})

test('parseOptions does not allow contentModelOnly and skipContentModel at the same time', () => {
  expect(
    () => parseOptions({
      spaceId,
      managementToken,
      contentFile,
      contentModelOnly: true,
      skipContentModel: true
    })
  ).toThrow('`contentModelOnly` and `skipContentModel` cannot be used together')
})

test('parseOptions does allow skipLocales only when contentModelOnly is set', () => {
  expect(
    () => parseOptions({
      spaceId,
      managementToken,
      contentFile,
      skipLocales: true
    })
  ).toThrow('`skipLocales` can only be used together with `contentModelOnly`')
})

test('parseOptions sets correct default options', () => {
  const version = require(resolve(basePath, 'package.json')).version

  const options = parseOptions({
    spaceId,
    managementToken,
    contentFile
  })

  const errorFileNamePattern = `contentful-import-error-log-${spaceId}-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\\.json`

  expect(options.contentFile).toMatch(contentFile)
  expect(options.errorLogFile).toMatch(new RegExp(`^${resolve(basePath, errorFileNamePattern)}$`))

  expect(options.managementApplication).toBe(`contentful.import/${version}`)
  expect(options.managementToken).toBe(managementToken)
  expect(options.spaceId).toBe(spaceId)
  expect(options.destinationManagementToken).toBe(managementToken)
  expect(options.destinationSpace).toBe(spaceId)

  expect(options.prePublishDelay).toBe(3000)
  expect(options.skipContentModel).toBe(false)
  expect(options.skipLocales).toBe(false)
  expect(options.skipContentPublishing).toBe(false)
  expect(options.content).toEqual({
    assets: [],
    contentTypes: [],
    editorInterfaces: [],
    entries: [],
    locales: [],
    webhooks: [],
    ...require(contentFile)
  })

  expect(options.startTime instanceof moment).toBe(true)
  expect(options.useVerboseRenderer).toBe(false)
})

test('parseOption accepts config file', () => {
  const configFileName = join('test', 'unit', 'example-config.json')
  const config = require(resolve(basePath, configFileName))

  const options = parseOptions({
    config: configFileName
  })
  Object.keys(config).forEach((key) => {
    expect(options[key]).toBe(config[key])
  })
})

test('parseOption overwrites errorLogFile', () => {
  const errorLogFile = 'error.log'
  const options = parseOptions({
    spaceId,
    managementToken,
    contentFile,
    errorLogFile
  })
  expect(options.errorLogFile).toBe(resolve(basePath, errorLogFile))
})

test('parseOptions detects malformed proxy config', () => {
  expect(
    () => parseOptions({
      spaceId,
      managementToken,
      contentFile,
      proxy: 'invalid'
    })
  ).toThrow('Please provide the proxy config in the following format:\nhost:port or user:password@host:port')
})

test('parseOption accepts proxy config as string', () => {
  const options = parseOptions({
    spaceId,
    managementToken,
    contentFile,
    proxy: 'localhost:1234'
  })
  expect(options).not.toHaveProperty('proxy')
  expect(options.httpsAgent instanceof HttpsProxyAgent).toBe(true)
  expect(options.httpsAgent.options.host).toBe('localhost')
  expect(options.httpsAgent.options.port).toBe(1234)
  expect(options.httpsAgent.options).not.toHaveProperty('auth')
})

test('parseOption accepts proxy config as object', () => {
  const options = parseOptions({
    spaceId,
    managementToken,
    content: {},
    proxy: {
      host: 'localhost',
      port: 1234,
      user: 'foo',
      password: 'bar'
    }
  })
  expect(options).not.toHaveProperty('proxy')
  expect(options.httpsAgent instanceof HttpsProxyAgent).toBe(true)
  expect(options.httpsAgent.options.host).toBe('localhost')
  expect(options.httpsAgent.options.port).toBe(1234)
  expect(options.httpsAgent.options).not.toHaveProperty('auth')
}, 'broken')

test('parseOption cleans up content to only include supported entity types', () => {
  const options = parseOptions({
    spaceId,
    managementToken,
    content: {
      invalid: [{foo: 'bar'}],
      entries: [
        { sys: { id: 'entry1' } },
        { sys: { id: 'entry2' } }
      ],
      assets: [
        { sys: { id: 'asset1' } },
        { sys: { id: 'asset2' } }
      ]
    }
  })
  const content = options.content
  expect(Object.keys(content)).toHaveLength(6)
  expect(content.invalid).toBeUndefined()
})
