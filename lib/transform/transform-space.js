import Promise from 'bluebird'
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
  space, destinationSpace, customTransformers, entities = spaceEntities
) {
  const transformers = defaults(customTransformers, defaultTransformers)
  // TODO maybe we don't need promises here at all
  const newSpace = omit(space, ...entities)
  return Promise.reduce(entities, (newSpace, type) => {
    const sortedEntities = sortEntries(space[type])
    return Promise.map(
      sortedEntities,
      (entity) => Promise.resolve({
        original: entity,
        transformed: transformers[type](entity, destinationSpace[type])
      })
    )
      .then((entities) => {
        newSpace[type] = entities
        return newSpace
      })
  }, newSpace)
}
