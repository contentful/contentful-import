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
// access - used to size the warning in warnIfTagsWillBeStripped().
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

function warnIfTagsWillBeStripped (sourceData: OriginalSourceData, tagsEnabled: boolean): void {
  if (tagsEnabled) return

  const strippedCount = countEntitiesWithTags(sourceData)
  if (strippedCount === 0) return

  logEmitter.emit('warning', `The destination space/environment does not have access to the Tags feature. metadata.tags was removed from ${strippedCount} ${strippedCount === 1 ? 'entity' : 'entities'} during import.`)
}

// dataAssemblies/designTokens skip upgradeExoResources() (no rename applies to them), so
// they need their own metadata.tags scrub here. DataAssembly.metadata is a required field,
// so it's zeroed out rather than deleted. Mutates spaceData in place.
function stripTagsFromDataAssembliesAndDesignTokens (spaceData: TransformedSourceData, tagsEnabled: boolean): void {
  if (tagsEnabled) return

  if (Array.isArray(spaceData.dataAssemblies)) {
    spaceData.dataAssemblies = spaceData.dataAssemblies.map((entity) => ({
      ...entity,
      metadata: { ...entity.metadata, tags: [] }
    }))
  }
  if (Array.isArray(spaceData.designTokens)) {
    spaceData.designTokens = spaceData.designTokens.map((entity) => transformers.removeMetadataTags(entity, false))
  }
}

/**
 * Run transformer methods on each item for each kind of entity, in case there
 * is a need to transform data when copying it to the destination space
 */
export default function (
  sourceData: OriginalSourceData, destinationData: DestinationData): TransformedSourceData {
  const tagsEnabled = !!destinationData.tags

  warnIfTagsWillBeStripped(sourceData, tagsEnabled)

  // ExO entities aren't handled by the per-entity transformers above; they just get a
  // rename upgrade (pre-rename exports) and a metadata.tags scrub.
  const baseSpaceData = upgradeExoResources(omit(sourceData, ...entities), tagsEnabled) as TransformedSourceData
  stripTagsFromDataAssembliesAndDesignTokens(baseSpaceData, tagsEnabled)

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
