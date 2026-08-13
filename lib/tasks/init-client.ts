import { createClient } from 'contentful-management'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

const RATE_LIMIT_PATTERN = /^Rate limit error occurred\. Waiting for (\d+) ms before retrying\.\.\./

function logHandler (level, data) {
  logEmitter.emit(level, data)
  if (level === 'warning' && typeof data === 'string') {
    const match = RATE_LIMIT_PATTERN.exec(data)
    if (match) {
      logEmitter.emit('rateLimit', { waitMs: parseInt(match[1], 10) })
    }
  }
}

export default function initClient (opts) {
  const defaultOpts = {
    timeout: 30000,
    logHandler
  }
  const config = {
    ...defaultOpts,
    ...opts
  }
  return createClient(config, { type: 'legacy' })
}
