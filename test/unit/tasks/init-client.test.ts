import { vi, expect, test } from 'vitest'
import type { Mock } from 'vitest'

import initClient from '../../../lib/tasks/init-client'

import { createClient } from 'contentful-management'
import { logEmitter } from 'contentful-batch-libs'

vi.mock('contentful-management', () => {
  return {
    createClient: vi.fn(() => 'cmaClient')
  }
})

vi.mock('contentful-batch-libs', () => {
  return {
    logEmitter: {
      emit: vi.fn()
    }
  }
})

test('does create clients and passes custom logHandler', () => {
  const opts = {
    httpAgent: 'httpAgent',
    httpsAgent: 'httpsAgent',
    application: 'application',
    headers: 'headers',
    host: 'host',
    insecure: 'insecure',
    integration: 'integration',
    port: 'port',
    proxy: 'proxy',
    accessToken: 'accessToken',
    spaceId: 'spaceId'
  }

  initClient(opts)

  expect((createClient as Mock).mock.calls[0][0]).toMatchObject({
    accessToken: opts.accessToken,
    host: opts.host,
    port: opts.port,
    headers: opts.headers,
    insecure: opts.insecure,
    proxy: opts.proxy,
    httpAgent: opts.httpAgent,
    httpsAgent: opts.httpsAgent,
    application: opts.application,
    integration: opts.integration
  })
  expect((createClient as Mock).mock.calls[0][0]).toHaveProperty(
    'logHandler'
  )
  expect((createClient as Mock).mock.calls[0][0].timeout).toEqual(30000)
  expect((createClient as Mock).mock.calls).toHaveLength(1)

  // Call passed log handler
  ;(createClient as Mock).mock.calls[0][0].logHandler(
    'level',
    'logMessage'
  )

  expect(logEmitter.emit.mock.calls[0][0]).toBe('level')
  expect(logEmitter.emit.mock.calls[0][1]).toBe('logMessage')
})
