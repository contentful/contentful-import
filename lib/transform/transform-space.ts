import { omit } from 'lodash-es'

import { logEmitter } from 'contentful-batch-libs/dist/logging'

import * as transformers from './transformers'
import sortEntries from '../utils/sort-entries'
import sortLocales from '../utils/sort-locales'
import { upgradeExoResources } from './exo-rename'
import { DestinationData, OriginalSourceData, TransformedSourceData } from '../types'

const entities = [
  'contentTypes', 'entries', 'assets', 'locales', 'webhooks', 'tags', 'releases'
]

// Every entity type whose metadata.tags gets scrubbed when the destination lacks Tags
// access - used to size the single warning below (AIS-552).
const TAG_SCRUBBED_ENTITY_TYPES = [
  'entries', 'assets', 'components', 'experienceTemplates', 'experienceFragments',
  'experiences', 'dataAssemblies', 'designTokens'
] as const

function countEntitiesWithTags (sourceData: OriginalSourceData): number {
  return TAG_SCRUBBED_ENTITY_TYPES.reduce((count, type) => {
    const entitiesOfType = sourceData[type] ?? []
    return count + entitiesOfType.filter((entity: any) => entity.metadata?.tags?.length).length
  }, 0)
}

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 */
export default function (
  sourceData: OriginalSourceData, destinationData: DestinationData): TransformedSourceData {
  const tagsEnabled = !!destinationData.tags

  if (!tagsEnabled) {
    const strippedCount = countEntitiesWithTags(sourceData)
    if (strippedCount > 0) {
      logEmitter.emit('warning', `The destination space/environment does not have access to the Tags feature. metadata.tags was removed from ${strippedCount} ${strippedCount === 1 ? 'entity' : 'entities'} during import.`)
    }
  }

  // ExO entities aren't handled by the per-entity transformers above; they just get
  // a rename upgrade (pre-rename exports) and a metadata.tags scrub (AIS-552).
  const baseSpaceData = upgradeExoResources(omit(sourceData, ...entities), tagsEnabled) as TransformedSourceData

  // dataAssemblies/designTokens skip upgradeExoResources() (no rename applies), so they
  // need their own scrub. DataAssembly.metadata is required, so it's zeroed instead of deleted.
  if (!tagsEnabled) {
    if (Array.isArray(baseSpaceData.dataAssemblies)) {
      baseSpaceData.dataAssemblies = baseSpaceData.dataAssemblies.map((entity) => ({
        ...entity,
        metadata: { ...entity.metadata, tags: [] }
      }))
    }
    if (Array.isArray(baseSpaceData.designTokens)) {
      baseSpaceData.designTokens = baseSpaceData.designTokens.map((entity) => transformers.removeMetadataTags(entity, false))
    }
  }

  sourceData.locales = sortLocales(sourceData.locales)

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
