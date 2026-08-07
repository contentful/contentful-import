import { logEmitter } from 'contentful-batch-libs/dist/logging'

/**
 * Runs a topological sort (sortComponents/sortExperienceFragments) that executes outside the
 * per-entity try/catch in push-to-space.ts, directly inside wrapTask. An uncaught throw there
 * (e.g. malformed componentTree/slots data) would bubble through wrapTask and abort the run
 * without ever reaching the logEmitter-driven report. This logs the failure before rethrowing,
 * preserving today's abort-on-failure behavior while ensuring the error is visible in the
 * final report.
 */
export function sortOrReport<T>(sortFn: () => T[]): T[] {
  try {
    return sortFn()
  } catch (err) {
    logEmitter.emit('error', err)
    throw err
  }
}
