import fs from 'fs'
import { resolve } from 'path'
import format from 'date-fns/format'

import { version } from '../package.json'
import { getHeadersConfig } from './utils/headers'
import { addSequenceHeader, proxyStringToObject, agentFromProxy } from 'contentful-batch-libs'
import { parseChunked } from '@discoveryjs/json-ext'

const SUPPORTED_ENTITY_TYPES = [
  'contentTypes',
  'tags',
  'entries',
  'assets',
  'locales',
  'webhooks',
  'editorInterfaces'
]

export default async function parseOptions (params) {
  const defaultOptions = {
    skipContentModel: false,
    skipLocales: false,
    skipContentPublishing: false,
    useVerboseRenderer: false,
    environmentId: 'master',
    rawProxy: false,
    uploadAssets: false,
    rateLimit: 7
  }

  const configFile = params.config
    ? require(resolve(process.cwd(), params.config))
    : {}

  const options = {
    ...defaultOptions,
    ...configFile,
    ...params,
    headers: addSequenceHeader(params.headers || getHeadersConfig(params.header))
  }

  // Validation
  if (!options.spaceId) {
    throw new Error('The `spaceId` option is required.')
  }

  if (!options.managementToken) {
    throw new Error('The `managementToken` option is required.')
  }

  if (!options.contentFile && !options.content) {
    throw new Error('Either the `contentFile` or `content` option are required.')
  }

  if (options.contentModelOnly && options.skipContentModel) {
    throw new Error('`contentModelOnly` and `skipContentModel` cannot be used together')
  }

  if (options.skipLocales && !options.contentModelOnly) {
    throw new Error('`skipLocales` can only be used together with `contentModelOnly`')
  }

  const proxySimpleExp = /.+:\d+/
  const proxyAuthExp = /.+:.+@.+:\d+/
  if (typeof options.proxy === 'string' && options.proxy && !(proxySimpleExp.test(options.proxy) || proxyAuthExp.test(options.proxy))) {
    throw new Error('Please provide the proxy config in the following format:\nhost:port or user:password@host:port')
  }

  options.startTime = new Date()

  if (!options.errorLogFile) {
    options.errorLogFile = resolve(process.cwd(), `contentful-import-error-log-${options.spaceId}-${format(options.startTime, "yyyy-MM-dd'T'HH-mm-ss")}.json`)
  } else {
    options.errorLogFile = resolve(process.cwd(), options.errorLogFile)
  }
  options.accessToken = options.managementToken

  if (!options.content) {
    // using a stream parser allows input files > 512 MB
    const fileStream = fs.createReadStream(options.contentFile, { encoding: 'utf8' })
    options.content = await parseChunked(fileStream)
  }

  // Clean up content to only include supported entity types
  Object.keys(options.content).forEach((type) => {
    if (SUPPORTED_ENTITY_TYPES.indexOf(type) === -1) {
      delete options.content[type]
    }
  })

  SUPPORTED_ENTITY_TYPES.forEach((type) => {
    options.content[type] = options.content[type] || []
  })

  if (typeof options.proxy === 'string') {
    options.proxy = proxyStringToObject(options.proxy)
  }

  if (!options.rawProxy && options.proxy) {
    options.httpsAgent = agentFromProxy(options.proxy)
    delete options.proxy
  }

  options.application = options.managementApplication || `contentful.import/${version}`
  options.feature = options.managementFeature || 'library-import'
  return options
}
