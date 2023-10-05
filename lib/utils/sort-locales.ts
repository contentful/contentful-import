/**
 * Given a list of locales, this utility will sort them by `fallback` order, i.e. the locales without fallbacks first,
 * then the locales having them as fallbacks, and then recursively.
 */
export default function sortLocales (locales) {
  const localeByFallback = {}

  locales.forEach((locale) => {
    if (locale.fallbackCode === null) {
      locale.fallbackCode = undefined
    }

    if (!localeByFallback[locale.fallbackCode]) {
      localeByFallback[locale.fallbackCode] = []
    }

    localeByFallback[locale.fallbackCode].push(locale)
  })

  return sortByFallbackKey(localeByFallback)
}

function sortByFallbackKey (localeByFallback, key?: string) {
  // We expect localeByFallback to actually use undefined as property
  // to access fallback locales, as this is not allowed in TS, we have
  // to stringify key here
  if (!localeByFallback[`${key}`]) {
    return []
  }

  const sortedLocales = localeByFallback[`${key}`]

  sortedLocales.forEach((locale) => {
    sortByFallbackKey(localeByFallback, locale.code).forEach((x) =>
      sortedLocales.push(x)
    )
  })

  // We have to reset the undefined fallback code to null so that the locales are properly created without fallback and
  // not the default (en-US)
  sortedLocales.forEach((locale) => {
    if (!locale.fallbackCode) {
      locale.fallbackCode = null
    }
  })

  return sortedLocales
}
