import { createClient, PlainClientAPI } from 'contentful-management'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

function logHandler (level, data) {
  logEmitter.emit(level, data)
}

export default function initClient (opts): PlainClientAPI {
  const defaultOpts = {
    timeout: 30000,
    logHandler
  }
  const config = {
    ...defaultOpts,
    ...opts
  }
  return createClient(config, { type: 'plain' })
}
