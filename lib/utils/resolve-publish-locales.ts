/**
 * `contentful-export` serializes per-locale publish state as `sys.fieldStatus`:
 *
 *   "fieldStatus": { "*": { "en-US": "published", "es": "draft", "zh-Hant-TW": "changed" } }
 *
 * A whole-entry publish has no locale scope, so the CMA marks every locale in the
 * destination environment as published. These helpers work out which locales a
 * publish should be scoped to so that exported state survives the import.
 */

const LIVE_FIELD_STATUSES = ['published', 'changed']

type FieldStatusSys = {
  id: string
  fieldStatus?: {
    '*'?: Record<string, string>
  }
}

/**
 * Works out the locales to scope an entity's publish to.
 *
 * Returns `null` when the entity should be published as a whole — either because
 * the export carries no per-locale state, or because every destination locale is
 * live anyway and a whole-entity publish is equivalent.
 *
 * Returns an empty array when the entity has per-locale state but none of its live
 * locales exist in the destination environment, so there is nothing safe to publish.
 */
export default function resolvePublishLocales(
  sys: FieldStatusSys,
  destinationLocaleCodes: string[] | null
): string[] | null {
  const fieldStatus = sys.fieldStatus?.['*']

  // Older export files carry no per-locale state, and without the destination
  // locales we cannot tell which locales are safe to name. Publish as before.
  if (!fieldStatus || !destinationLocaleCodes) {
    return null
  }

  const liveLocales = Object.keys(fieldStatus)
    .filter((locale) => LIVE_FIELD_STATUSES.indexOf(fieldStatus[locale]) !== -1)

  // Never name a locale the destination environment does not have.
  const availableLocales = liveLocales
    .filter((locale) => destinationLocaleCodes.indexOf(locale) !== -1)

  if (availableLocales.length === 0) {
    return []
  }

  // Every destination locale is live, so a whole-entity publish has the same
  // outcome. Keep the existing code path for the common case.
  const everyLocaleIsLive = destinationLocaleCodes
    .every((locale) => availableLocales.indexOf(locale) !== -1)

  return everyLocaleIsLive ? null : availableLocales
}

export type LocalePublishPlan = {
  localesByEntityId: Map<string, string[]>
  skippedEntityIds: Set<string>
}

/**
 * Builds the per-entity publish plan for a set of transformed source entities.
 * Entities absent from both collections are published as a whole, unchanged.
 */
export function buildLocalePublishPlan(
  sourceEntities: { original: { sys: FieldStatusSys } }[],
  destinationLocaleCodes: string[] | null
): LocalePublishPlan {
  const localesByEntityId = new Map<string, string[]>()
  const skippedEntityIds = new Set<string>()

  for (const { original } of sourceEntities) {
    const locales = resolvePublishLocales(original.sys, destinationLocaleCodes)

    if (locales === null) {
      continue
    }

    if (locales.length === 0) {
      skippedEntityIds.add(original.sys.id)
    } else {
      localesByEntityId.set(original.sys.id, locales)
    }
  }

  return { localesByEntityId, skippedEntityIds }
}
