import { omit, defaults } from 'lodash/object'

import * as defaultTransformers from './transformers'
import sortEntries from '../utils/sort-entries'
import sortLocales from '../utils/sort-locales'
import { DestinationData, OriginalSourceData, TransformedSourceData } from '../types'

const spaceEntities = [
  'contentTypes', 'entries', 'assets', 'locales', 'webhooks', 'tags'
]

const exoEntities = [
  'componentTypes', 'templates', 'fragments', 'dataAssemblies', 'experiences', 'designTokens'
]

type TransformContext = {
  destinationSpaceId: string
  destinationEnvironmentId: string
}

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 */
export default function (
  sourceData: OriginalSourceData, destinationData: DestinationData, customTransformers?: any, entities = spaceEntities, ctx?: TransformContext
): TransformedSourceData {
  const transformers = defaults(customTransformers, defaultTransformers)
  const allEntities = [...entities, ...exoEntities.filter((type) => sourceData[type]?.length)]
  const baseSpaceData = omit(sourceData, ...allEntities)

  sourceData.locales = sortLocales(sourceData.locales)
  const tagsEnabled = !!destinationData.tags

  return allEntities.reduce((transformedSpaceData, type) => {
    if (!sourceData[type]?.length) return transformedSpaceData

    const isExo = exoEntities.includes(type)
    // tags and ExO entities don't contain entry links, don't need entry sorting
    const sortedEntities = (type === 'tags' || isExo) ? sourceData[type] : sortEntries(sourceData[type])

    const transformedEntities = sortedEntities.map((entity) => ({
      original: entity,
      transformed: isExo
        ? transformers[type](entity, destinationData[type], tagsEnabled, ctx)
        : transformers[type](entity, destinationData[type], tagsEnabled)
    }))
    transformedSpaceData[type] = transformedEntities
    return transformedSpaceData
  }, baseSpaceData)
}
