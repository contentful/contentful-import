import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { LocaleProps, PlainClientAPI } from 'contentful-management'
import PQueue from 'p-queue'

import { batchedPageQuery } from '../tasks/get-destination-data'

type DestinationLocalesParams = {
  client: PlainClientAPI
  spaceId: string
  environmentId: string
  requestQueue: PQueue
}

// Cached per client so the asset and entry publishing passes share one lookup.
const cache = new WeakMap<object, Map<string, Promise<string[] | null>>>()

/**
 * Locale codes of the destination environment, or null when they cannot be read.
 *
 * This reuses `batchedPageQuery` from `get-destination-data`, so the paging is
 * shared. What it cannot reuse is the *result* on `destinationData.locales`: that
 * field is only filled when `!skipContentModel && !skipLocales` and the content
 * file itself carries locales, and it stays an empty array otherwise. An empty
 * array is indistinguishable from "the destination has no locales", which would
 * make `resolvePublishLocales` skip every entity. Publish scoping has to know the
 * destination locales whatever the skip flags say, so it asks for them directly
 * and caches the answer for the run.
 */
export function getDestinationLocaleCodes ({ client, spaceId, environmentId, requestQueue }: DestinationLocalesParams): Promise<string[] | null> {
  let byEnvironment = cache.get(client)

  if (!byEnvironment) {
    byEnvironment = new Map()
    cache.set(client, byEnvironment)
  }

  const key = `${spaceId}/${environmentId}`
  let localeCodes = byEnvironment.get(key)

  if (!localeCodes) {
    // Paged: an environment can hold more locales than a single page returns, and
    // a locale missed here would be silently dropped from the publish.
    localeCodes = batchedPageQuery({ client, spaceId, environmentId, type: 'locales', requestQueue })
      .then((items) => (items as LocaleProps[]).map((locale) => locale.code))
      .catch((err) => {
        logEmitter.emit('warning', `Could not read the locales of the destination environment, falling back to publishing all locales: ${err.message}`)
        return null
      })
    byEnvironment.set(key, localeCodes)
  }

  return localeCodes
}
