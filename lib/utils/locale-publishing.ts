import { logEmitter } from 'contentful-batch-libs/dist/logging'
import type { PlainClientAPI } from 'contentful-management'

/**
 * Locale-scoped publishing depends on the *destination*, and there are two
 * independent gates on it:
 *
 * 1. The organization has to be entitled to locale-based publishing. That is
 *    readable up front, via the same public CMA entitlement endpoint that
 *    `spaceHasExoM1Entitlement` uses.
 * 2. The destination environment has to have "Locale-based (un)publishing"
 *    selected under Settings > Locales > Publishing options. This is per
 *    environment and defaults to "Publish all locales", so an entitled
 *    organization can still have a destination that publishes whole entities.
 *    No public read endpoint exposes it.
 *
 * Gate 1 is checked before the first publish. Gate 2 is established from what
 * the destination actually did with the first locale-scoped publish of the run,
 * and both funnel into the same latch: warn once, then publish whole entities
 * for the rest of the run, exactly as the importer did before this feature.
 */

const LOCALE_PUBLISHING_FEATURES = ['localeBasedPublishing', 'localePublishing']

const ENABLE_ON_ENVIRONMENT = 'To preserve it, select "Locale-based (un)publishing" for the destination environment under Settings > Locales > Publishing options.'
const NOT_ENTITLED = 'Locale-based publishing is only available on some plans — contact Contentful to have it added.'

type OrganizationEntitlementSet = {
  features?: Record<string, { value?: boolean } | undefined>
}

/**
 * Checks the destination space's organization for the locale-based publishing
 * entitlement via the public CMA `GET /organizations/{orgId}/organization_entitlement_set`
 * endpoint — the same endpoint and shape as `spaceHasExoM1Entitlement`.
 *
 * Returns `null` when the check itself could not complete (space lookup or
 * entitlement request failed) or when the entitlement set names neither feature
 * key. Callers must treat `null` as inconclusive and still attempt the scoped
 * publish: the response check below catches a destination that cannot honour it,
 * whereas failing closed here would silently drop state we could have preserved.
 */
export async function spaceHasLocalePublishingEntitlement (client: PlainClientAPI, spaceId: string): Promise<boolean | null> {
  try {
    const space = await client.space.get({ spaceId })
    const organizationId = space.sys.organization?.sys?.id
    if (!organizationId) {
      return null
    }
    const entitlements: OrganizationEntitlementSet = await client.raw.get(
      `/organizations/${organizationId}/organization_entitlement_set`
    )
    const features = entitlements.features
    const known = LOCALE_PUBLISHING_FEATURES.filter((feature) => features?.[feature]?.value !== undefined)

    if (!known.length) {
      return null
    }

    return known.some((feature) => features?.[feature]?.value === true)
  } catch {
    return null
  }
}

/**
 * Latched per client, because one import shares a single client across the asset
 * and entry publishing passes and the answer is a property of the destination.
 */
const localeScopingUnavailable = new WeakSet<object>()
const entitlementChecks = new WeakMap<object, Promise<boolean | null>>()

/**
 * Runs gate 1 once per client and latches a definitive "not entitled" answer, so
 * the asset and entry passes share one check. An inconclusive answer is not
 * latched — the run goes on to try, and gate 2 catches a destination that cannot
 * honour the scope.
 */
export async function ensureLocalePublishingEntitlement (client: PlainClientAPI, spaceId: string): Promise<void> {
  if (localeScopingUnavailable.has(client)) {
    return
  }

  let check = entitlementChecks.get(client)

  if (!check) {
    check = spaceHasLocalePublishingEntitlement(client, spaceId)
    entitlementChecks.set(client, check)
  }

  if (await check === false) {
    markLocaleScopingUnavailable(client, 'The destination organization is not entitled to locale-based publishing.', NOT_ENTITLED)
  }
}

export function isLocaleScopingUnavailable (client: object): boolean {
  return localeScopingUnavailable.has(client)
}

/**
 * `remedy` says what would make locale scoping work, because the two gates have
 * different answers: gate 1 needs a plan that includes the feature, gate 2 needs
 * the setting flipped on the destination environment.
 */
export function markLocaleScopingUnavailable (client: object, reason: string, remedy = ENABLE_ON_ENVIRONMENT): void {
  if (localeScopingUnavailable.has(client)) {
    return
  }
  localeScopingUnavailable.add(client)
  logEmitter.emit('warning', `${reason} Publishing every locale instead — the per-locale publish state in the content file cannot be preserved. ${remedy}`)
}

/**
 * A destination that is not entitled rejects the locale-scoped payload with a 403
 * while the entity itself is perfectly publishable, and one that does not
 * understand the payload rejects it with a 400.
 *
 * A 403 from a token that simply lacks publish rights lands here too, but the
 * fallback publish then fails on its own and is reported as usual — nothing is
 * silently swallowed.
 */
export function isLocalePublishingRejectedError (err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }
  const status = (err as any).status ?? (err as any).response?.status
  if (status === 403 || status === 400) {
    return true
  }
  try {
    const parsed = JSON.parse(err.message)?.status
    return parsed === 403 || parsed === 400
  } catch {
    return false
  }
}

/**
 * Whether the destination actually scoped the publish it just accepted.
 *
 * An environment on "Publish all locales" accepts the `{ add: { fields: { '*': [...] } } }`
 * payload and publishes the whole entity anyway — no error to catch. The tell is
 * in the response: `sys.fieldStatus` is the destination's own per-locale state,
 * and an environment that does not track per-locale state does not return it.
 */
export function destinationScopedThePublish (publishedEntity: any): boolean {
  return Boolean(publishedEntity?.sys?.fieldStatus?.['*'])
}
