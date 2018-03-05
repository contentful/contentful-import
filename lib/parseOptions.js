import fs from 'fs'
import { resolve } from 'path'

import moment from 'moment'

import { version } from '../package'
import { proxyStringToObject, agentFromProxy } from 'contentful-batch-libs/dist/proxy'

const SUPPORTED_ENTITY_TYPES = [
  'contentTypes',
  'entries',
  'assets',
  'locales',
  'webhooks',
  'editorInterfaces'
]

export default function parseOptions (params) {
  const defaultOptions = {
    skipContentModel: false,
    skipLocales: false,
    skipContentPublishing: false,
    useVerboseRenderer: false,
    prePublishDelay: 3000,
    environmentId: 'master'
  }

  const configFile = params.config
    ? require(resolve(process.cwd(), params.config))
    : {}

  const options = {
    ...defaultOptions,
    ...configFile,
    ...params
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

  options.startTime = moment()

  if (!options.errorLogFile) {
    options.errorLogFile = resolve(process.cwd(), `contentful-import-error-log-${options.spaceId}-${options.startTime.format('YYYY-MM-DDTHH-mm-SS')}.json`)
  } else {
    options.errorLogFile = resolve(process.cwd(), options.errorLogFile)
  }

  // Further processing
  options.accessToken = options.managementToken
  options.content = options.content || JSON.parse(fs.readFileSync(options.contentFile))

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

  if (options.proxy) {
    options.httpsAgent = agentFromProxy(options.proxy)
    delete options.proxy
  }

  options.application = options.application || `contentful.import/${version}`
  return options
}
