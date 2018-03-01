import { omit, defaults } from 'lodash/object'

import * as defaultTransformers from './transformers'
import sortEntries from '../utils/sort-entries'

const spaceEntities = [
  'contentTypes', 'entries', 'assets', 'locales', 'webhooks'
]

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 */
export default function (
  sourceData, destinationData, customTransformers, entities = spaceEntities
) {
  const transformers = defaults(customTransformers, defaultTransformers)
  const baseSpaceData = omit(sourceData, ...entities)

  return entities.reduce((transformedSpaceData, type) => {
    const sortedEntities = sortEntries(sourceData[type])
    const transformedEntities = sortedEntities.map((entity) => ({
      original: entity,
      transformed: transformers[type](entity, destinationData[type])
    }))
    transformedSpaceData[type] = transformedEntities
    return transformedSpaceData
  }, baseSpaceData)
}
