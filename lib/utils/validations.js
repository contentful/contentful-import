const assertDefaultLocale = (source, destination) => {
  const sourceDefaultLocale = source.locales.find((locale) => locale.default === true)
  const destinationDefaultLocale = destination.locales.find((locale) => locale.default === true)

  if (!sourceDefaultLocale || !destinationDefaultLocale) {
    return
  }

  if (sourceDefaultLocale.code !== destinationDefaultLocale.code) {
    throw new Error(`
      Please make sure you destination space have the same default locale as the source
      default locale for source space : ${sourceDefaultLocale.code}\n
      default locale for destination space: ${destinationDefaultLocale.code}
    `)
  }
}

export {
  assertDefaultLocale
}
