import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { wrapTask } from 'contentful-batch-libs/dist/listr'

type RateLimitEvent = { waitMs: number }

/**
 * Drop-in replacement for `wrapTask` that adds a persistent rate-limit status
 * line in the task title.
 *
 * When the SDK hits a 429 it emits a `rateLimit` event via logEmitter.  This
 * wrapper intercepts that event and updates `task.title` with a human-readable
 * message ("rate limited, retrying in Xs") so the user can tell the import is
 * waiting rather than stalled.  The title is restored before `wrapTask`'s own
 * teardown appends its `(Xs)` elapsed-time suffix, so the final completed task
 * title remains clean.
 *
 * Ordering guarantee: the cleanup `finally` block runs inside the async
 * function body that is passed to `wrapTask`.  `wrapTask` appends `(Xs)` in
 * its own `.then()` handler, which executes after the inner async function
 * resolves — so cleanup always fires first.
 */
export function wrapTaskWithRateLimitStatus (func: (ctx: any, task: any) => Promise<any>) {
  return wrapTask(async (ctx, task) => {
    const baseTitle: string = task.title
    let retryCount = 0
    let clearTimer: ReturnType<typeof setTimeout> | null = null

    function onRateLimit ({ waitMs }: RateLimitEvent) {
      retryCount++
      const waitSec = Math.ceil(waitMs / 1000)
      task.title = `${baseTitle} — rate limited, retrying in ${waitSec}s (attempt ${retryCount})`

      if (clearTimer) clearTimeout(clearTimer)
      // Auto-clear once the wait elapses so the title resets if the retry
      // succeeds without a subsequent rate-limit event.
      clearTimer = setTimeout(() => {
        task.title = baseTitle
        retryCount = 0
      }, waitMs + 500)
    }

    logEmitter.on('rateLimit', onRateLimit)

    try {
      return await func(ctx, task)
    } finally {
      // Runs before wrapTask's .then(teardown) so the `(Xs)` suffix is
      // appended to the clean base title, not the rate-limit status string.
      if (clearTimer) clearTimeout(clearTimer)
      logEmitter.removeListener('rateLimit', onRateLimit)
      task.title = baseTitle
    }
  })
}
