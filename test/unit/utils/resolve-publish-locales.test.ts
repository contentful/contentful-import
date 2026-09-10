import resolvePublishLocales, { buildLocalePublishPlan, resolveLocalesToDemote } from '../../../lib/utils/resolve-publish-locales'

const DESTINATION_LOCALES = ['en-US', 'es', 'zh-Hant-TW']

function makeSys(fieldStatus?: Record<string, string>) {
  return {
    id: 'entity-1',
    type: 'Entry',
    publishedVersion: 3,
    ...(fieldStatus ? { fieldStatus: { '*': fieldStatus } } : {})
  }
}

test('scopes the publish to live locales when some locales are draft', () => {
  const sys = makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toEqual(['en-US'])
})

test('treats changed locales as live', () => {
  const sys = makeSys({ 'en-US': 'published', es: 'changed', 'zh-Hant-TW': 'draft' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toEqual(['en-US', 'es'])
})

test('publishes the whole entity when every destination locale is live', () => {
  const sys = makeSys({ 'en-US': 'published', es: 'changed', 'zh-Hant-TW': 'published' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toBeNull()
})

test('publishes the whole entity when the export has no fieldStatus', () => {
  expect(resolvePublishLocales(makeSys(), DESTINATION_LOCALES)).toBeNull()
})

test('publishes the whole entity when destination locales are unknown', () => {
  const sys = makeSys({ 'en-US': 'published', es: 'draft' })
  expect(resolvePublishLocales(sys, null)).toBeNull()
})

test('ignores live locales that do not exist in the destination environment', () => {
  const sys = makeSys({ 'en-US': 'published', 'de-DE': 'published', es: 'draft' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toEqual(['en-US'])
})

test('reports nothing publishable when no live locale exists in the destination', () => {
  const sys = makeSys({ 'de-DE': 'published', 'en-US': 'draft' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toEqual([])
})

test('a destination locale absent from fieldStatus stays draft rather than being published', () => {
  // Source environment had no zh-Hant-TW at all; it must not be published in the destination.
  const sys = makeSys({ 'en-US': 'published', es: 'published' })
  expect(resolvePublishLocales(sys, DESTINATION_LOCALES)).toEqual(['en-US', 'es'])
})

describe('buildLocalePublishPlan', () => {
  const sourceEntities = [
    { original: { sys: makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' }) } },
    { original: { sys: { ...makeSys({ 'en-US': 'published', es: 'published', 'zh-Hant-TW': 'published' }), id: 'all-live' } } },
    { original: { sys: { ...makeSys(), id: 'no-field-status' } } },
    { original: { sys: { ...makeSys({ 'de-DE': 'published' }), id: 'unavailable-locale' } } }
  ]

  test('maps only the entities that need a locale-scoped publish', () => {
    const { localesByEntityId } = buildLocalePublishPlan(sourceEntities, DESTINATION_LOCALES)
    expect([...localesByEntityId.entries()]).toEqual([['entity-1', ['en-US']]])
  })

  test('collects entities whose live locales are all missing from the destination', () => {
    const { skippedEntityIds } = buildLocalePublishPlan(sourceEntities, DESTINATION_LOCALES)
    expect([...skippedEntityIds]).toEqual(['unavailable-locale'])
  })

  test('returns an empty plan when destination locales are unknown', () => {
    const { localesByEntityId, skippedEntityIds } = buildLocalePublishPlan(sourceEntities, null)
    expect(localesByEntityId.size).toBe(0)
    expect(skippedEntityIds.size).toBe(0)
  })
})

describe('resolveLocalesToDemote', () => {
  const sourceSys = makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' })

  test('demotes locales that are draft in the content file but live in the destination', () => {
    const destinationSys = makeSys({ 'en-US': 'published', es: 'published', 'zh-Hant-TW': 'changed' })
    expect(resolveLocalesToDemote(sourceSys, destinationSys, DESTINATION_LOCALES))
      .toEqual(['es', 'zh-Hant-TW'])
  })

  test('leaves locales that are already draft in the destination alone', () => {
    const destinationSys = makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' })
    expect(resolveLocalesToDemote(sourceSys, destinationSys, DESTINATION_LOCALES)).toEqual([])
  })

  test('demotes nothing when the entity does not exist in the destination yet', () => {
    expect(resolveLocalesToDemote(sourceSys, undefined, DESTINATION_LOCALES)).toEqual([])
  })

  test('demotes nothing when the destination entity carries no fieldStatus', () => {
    expect(resolveLocalesToDemote(sourceSys, makeSys(), DESTINATION_LOCALES)).toEqual([])
  })

  test('never names a locale absent from the destination environment', () => {
    const source = makeSys({ 'en-US': 'published', 'de-DE': 'draft' })
    const destination = makeSys({ 'en-US': 'published', 'de-DE': 'published' })
    expect(resolveLocalesToDemote(source, destination, DESTINATION_LOCALES)).toEqual([])
  })

  test('demotes nothing when the content file has no fieldStatus', () => {
    const destination = makeSys({ 'en-US': 'published', es: 'published' })
    expect(resolveLocalesToDemote(makeSys(), destination, DESTINATION_LOCALES)).toEqual([])
  })
})

describe('buildLocalePublishPlan demotions', () => {
  const sourceEntities = [
    { original: { sys: makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' }) } }
  ]

  test('is empty when no destination entities are supplied', () => {
    const { demoteLocalesByEntityId } = buildLocalePublishPlan(sourceEntities, DESTINATION_LOCALES)
    expect(demoteLocalesByEntityId.size).toBe(0)
  })

  test('maps entities whose destination locales need demoting', () => {
    const destinationEntitiesById = new Map([
      ['entity-1', { sys: makeSys({ 'en-US': 'published', es: 'published', 'zh-Hant-TW': 'draft' }) }]
    ])
    const { demoteLocalesByEntityId } = buildLocalePublishPlan(
      sourceEntities,
      DESTINATION_LOCALES,
      { destinationEntitiesById }
    )
    expect([...demoteLocalesByEntityId.entries()]).toEqual([['entity-1', ['es']]])
  })

  test('omits entities with nothing to demote', () => {
    const destinationEntitiesById = new Map([
      ['entity-1', { sys: makeSys({ 'en-US': 'published', es: 'draft', 'zh-Hant-TW': 'draft' }) }]
    ])
    const { demoteLocalesByEntityId } = buildLocalePublishPlan(
      sourceEntities,
      DESTINATION_LOCALES,
      { destinationEntitiesById }
    )
    expect(demoteLocalesByEntityId.size).toBe(0)
  })
})
