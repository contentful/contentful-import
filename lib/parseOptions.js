import fs from 'fs'
import { resolve } from 'path'
import { version } from '../package'
import { proxyStringToObject, agentFromProxy } from './utils/proxy'

export default function parseOptions (params) {
  const defaultOptions = {
    skipContentModel: false,
    skipLocales: false,
    skipContentPublishing: false
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
  if (options.proxy && !(proxySimpleExp.test(options.proxy) || proxyAuthExp.test(options.proxy))) {
    throw new Error('Please provide the proxy config in the following format:\nhost:port or user:password@host:port')
  }

  // Further processing
  options.destinationSpace = options.spaceId
  options.destinationManagementToken = options.managementToken
  options.content = options.content || JSON.parse(fs.readFileSync(options.contentFile))

  // to avoid looping through an undefined array later on
  options.content.contentTypes = options.content.contentTypes || []
  options.content.entries = options.content.entries || []
  options.content.assets = options.content.assets || []
  options.content.locales = options.content.locales || []
  options.content.webhooks = options.content.webhooks || []
  options.content.roles = options.content.roles || []
  options.content.editorInterfaces = options.content.editorInterfaces || []

  if (typeof options.proxy === 'string') {
    options.proxy = proxyStringToObject(options.proxy)
  }

  if (options.proxy) {
    options.httpsAgent = agentFromProxy(options.proxy)
    delete options.proxy
  }

  options.managementApplication = options.managementApplication || `contentful.import/${version}`
  return options
}
