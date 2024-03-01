import { omit, defaults } from 'lodash'

import { transformers as defaultTransformers } from './transformers'
import sortEntries from '../utils/sort-entries'
import sortLocales from '../utils/sort-locales'
import { DestinationData, OriginalSourceData, TransformedSourceData } from '../types'

const spaceEntities = [
  'contentTypes', 'entries', 'assets', 'locales', 'webhooks', 'tags'
]

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 */
export default function (
  sourceData: OriginalSourceData, destinationData: DestinationData, customTransformers?: Partial<typeof defaultTransformers>, entities = spaceEntities
): TransformedSourceData {
  const transformers = defaults(customTransformers, defaultTransformers)
  const baseSpaceData = omit(sourceData, ...entities)

  sourceData.locales = sortLocales(sourceData.locales)
  const tagsEnabled = !!destinationData.tags

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return entities.reduce((transformedSpaceData, type) => {
    // tags don't contain links to other entities, don't need to be sorted
    const sortedEntities = (type === 'tags') ? sourceData[type] : sortEntries(sourceData[type])

    const transformedEntities = sortedEntities.map((entity) => ({
      original: entity,
      transformed: transformers[type](entity, destinationData[type], tagsEnabled)
    }))
    transformedSpaceData[type] = transformedEntities
    return transformedSpaceData
  }, baseSpaceData)
}
