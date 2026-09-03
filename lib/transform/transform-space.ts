import { omit, defaults } from 'lodash-es'

import * as defaultTransformers from './transformers'
import sortEntries from '../utils/sort-entries'
import sortLocales from '../utils/sort-locales'
import { upgradeExoResources } from './exo-rename'
import { DestinationData, OriginalSourceData, TransformedSourceData } from '../types'

// TODO: should releases & experience orchestration entities be included in the default list of entities to transform? If so, we need to update the type accordingly.
// POSSIBLE TODO: add expereience orchestration entities, because exo entities _I think_ are being added via `upgradeExoResources()`.

const spaceEntities = [
  'contentTypes', 'entries', 'assets', 'locales', 'webhooks', 'tags', 'releases'
]

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 * 
 * TODO: 3rd and 4th params are never passed.
 * 
 * 
 */
export default function (
  sourceData: OriginalSourceData, destinationData: DestinationData, customTransformers?: any, entities = spaceEntities
): TransformedSourceData {
  const transformers = defaults(customTransformers, defaultTransformers)
  // ExO entities (components, experienceTemplates, experienceFragments,
  // experiences) are not handled by the per-entity transformers above; they
  // pass through as-is except for a rename upgrade so exports taken before the
  // ExO field rename can still be imported. Upgrading here — before
  // sorting and push — means the rest of the pipeline only ever sees the new
  // form. The upgrade is idempotent, so already-new-form data is untouched.
  const baseSpaceData = upgradeExoResources(omit(sourceData, ...entities)) as TransformedSourceData

  sourceData.locales = sortLocales(sourceData.locales)
  const tagsEnabled = !!destinationData.tags

  return entities.reduce((transformedSpaceData, type) => {
    // tags don't contain links to other entities, don't need to be sorted
    const sortedEntities = (type === 'tags' || type === 'releases') ? (sourceData[type] ?? []) : sortEntries(sourceData[type] ?? [])

    const transformedEntities = sortedEntities.map((entity) => ({
      original: entity,
      transformed: transformers[type](entity, destinationData[type], tagsEnabled)
    }))
    transformedSpaceData[type] = transformedEntities
    return transformedSpaceData
  }, baseSpaceData)
}
