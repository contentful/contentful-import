import { wrapTaskWithRateLimitStatus } from '../../../lib/utils/rate-limit-status'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

jest.mock('contentful-batch-libs/dist/listr', () => ({
  wrapTask: (func) => (ctx, task) => func(ctx, task)
}))

jest.mock('contentful-batch-libs/dist/logging', () => {
  const EventEmitter = require('events')
  return {
    logEmitter: new EventEmitter(),
    logToTaskOutput: jest.fn(() => () => {})
  }
})

function makeTask (title: string) {
  return { title }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  logEmitter.removeAllListeners('rateLimit')
})

test('updates task title on rateLimit event', async () => {
  const task = makeTask('Importing Entries')
  const func = jest.fn().mockResolvedValue(undefined)
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  const p = wrappedTask({}, task)
  logEmitter.emit('rateLimit', { waitMs: 10000 })

  expect(task.title).toBe('Importing Entries — rate limited, retrying in 10s (attempt 1)')

  await p
})

test('increments attempt counter on repeated rateLimit events', async () => {
  const task = makeTask('Importing Entries')
  let resolve: () => void
  const func = jest.fn(() => new Promise<void>((r) => { resolve = r }))
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  const p = wrappedTask({}, task)

  logEmitter.emit('rateLimit', { waitMs: 5000 })
  expect(task.title).toContain('attempt 1')

  logEmitter.emit('rateLimit', { waitMs: 5000 })
  expect(task.title).toContain('attempt 2')

  resolve!()
  await p
})

test('restores base title after task completes', async () => {
  const task = makeTask('Importing Entries')
  const func = jest.fn().mockResolvedValue(undefined)
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  const p = wrappedTask({}, task)
  logEmitter.emit('rateLimit', { waitMs: 10000 })
  await p

  expect(task.title).toBe('Importing Entries')
})

test('auto-clears status after wait elapses when retry succeeds without further events', async () => {
  const task = makeTask('Importing Entries')
  let resolve: () => void
  const func = jest.fn(() => new Promise<void>((r) => { resolve = r }))
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  const p = wrappedTask({}, task)

  logEmitter.emit('rateLimit', { waitMs: 5000 })
  expect(task.title).toContain('rate limited')

  jest.advanceTimersByTime(5500)
  expect(task.title).toBe('Importing Entries')

  resolve!()
  await p
})

test('removes rateLimit listener after task completes', async () => {
  const task = makeTask('Importing Entries')
  const func = jest.fn().mockResolvedValue(undefined)
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  await wrappedTask({}, task)

  // After task is done, emitting rateLimit must not affect title
  logEmitter.emit('rateLimit', { waitMs: 5000 })
  expect(task.title).toBe('Importing Entries')
})

test('restores base title even when task throws', async () => {
  const task = makeTask('Importing Entries')
  const func = jest.fn().mockRejectedValue(new Error('boom'))
  const wrappedTask = wrapTaskWithRateLimitStatus(func)

  await expect(wrappedTask({}, task)).rejects.toThrow('boom')

  expect(task.title).toBe('Importing Entries')
})
