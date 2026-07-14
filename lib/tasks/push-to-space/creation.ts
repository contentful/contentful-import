import { find } from 'lodash/collection'
import { assign, get, omitBy, omit } from 'lodash/object'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulEntityError } from '../../utils/errors'
import { TransformedSourceData, TransformedSourceDataUnion } from '../../types'
import PQueue from 'p-queue'
import { PlainClientAPI, LocaleProps } from 'contentful-management'

type CreateEntitiesParams = {
  context: PushToSpaceContext,
  entities: TransformedSourceDataUnion,
  destinationEntitiesById: Map<string, any>,
  skipUpdates?: boolean,
  requestQueue: PQueue
}

export type PushToSpaceContext = {
  type: string,
  client: any,
  spaceId: string,
  environmentId: string,
  skipContentModel?: boolean,
}

/**
 * Creates a list of entities
 * Applies to all entities except Entries, as the CMA API for those is slightly different
 * See handleCreationErrors for details on what errors reject the promise or not.
 */
export function createEntities ({ context, entities, destinationEntitiesById, skipUpdates, requestQueue }: CreateEntitiesParams) {
  return createEntitiesWithConcurrency({ context, entities, destinationEntitiesById, skipUpdates, requestQueue })
}

// TODO
// Locales need to be created in series
type CreateLocalesParams = {
  context: PushToSpaceContext,
  entities: TransformedSourceData['locales'],
  destinationEntitiesById: Map<string, any>,
  requestQueue: PQueue
}

export function createLocales ({ context, entities, destinationEntitiesById, requestQueue }: CreateLocalesParams) {
  return createEntitiesInSequence({ context, entities, destinationEntitiesById, requestQueue })
}

async function createEntitiesWithConcurrency ({ context, entities, destinationEntitiesById, skipUpdates, requestQueue }) {
  const pendingCreatedEntities = entities.map((entity) => {
    const destinationEntity = getDestinationEntityForSourceEntity(destinationEntitiesById, entity.transformed)
    const updateOperation = skipUpdates ? 'skip' : 'update'
    const operation = destinationEntity ? updateOperation : 'create'

    if (destinationEntity && skipUpdates) {
      creationSuccessNotifier(operation, entity.transformed)
      return
    }

    return requestQueue.add(async () => {
      try {
        const createdEntity = await (destinationEntity
          ? updateDestinationWithSourceData(context, destinationEntity, entity.transformed)
          : createInDestination(context, entity.transformed))

        creationSuccessNotifier(operation, createdEntity)

        return createdEntity
      } catch (err) {
        return handleCreationErrors(entity, err)
      }
    })
  })

  const createdEntities = await Promise.all(pendingCreatedEntities)

  // Filter null values in case of errors
  return createdEntities.filter((entity) => entity)
}

async function createEntitiesInSequence ({ context, entities, destinationEntitiesById, requestQueue }: CreateLocalesParams) {
  const createdEntities: any[] = []

  for (const entity of entities) {
    const destinationEntity = getDestinationEntityForSourceEntity(destinationEntitiesById, entity.transformed)
    const operation = destinationEntity ? 'update' : 'create'

    try {
      // Even though we run things in sequence here,
      // we still want to go through the normal rate limiting queue
      const createdEntity = await requestQueue.add(async () => {
        const createdOrUpdatedEntity = await (destinationEntity
          ? updateDestinationWithSourceData(context, destinationEntity, entity.transformed)
          : createInDestination(context, entity.transformed))
        return createdOrUpdatedEntity
      })

      creationSuccessNotifier(operation, createdEntity)

      createdEntities.push(createdEntity)
    } catch (err) {
      const maybeSubstituteEntity = handleCreationErrors(entity, err)
      if (maybeSubstituteEntity) {
        createdEntities.push(maybeSubstituteEntity)
      }
    }
  }

  return createdEntities
}

/**
 * Creates a list of entries
 */
export async function createEntries ({ context, entities, destinationEntitiesById, skipUpdates, requestQueue }) {
  const createdEntries = await Promise.all(entities.map((entry) => {
    return createEntry({ entry, context, destinationEntitiesById, skipUpdates, requestQueue })
  }))

  return createdEntries.filter((entry) => entry)
}

async function createEntry ({ entry, context, destinationEntitiesById, skipUpdates, requestQueue }) {
  const contentTypeId = entry.original.sys.contentType.sys.id
  const destinationEntry = getDestinationEntityForSourceEntity(
    destinationEntitiesById, entry.transformed)
  const updateOperation = skipUpdates ? 'skip' : 'update'
  const operation = destinationEntry ? updateOperation : 'create'
  if (destinationEntry && skipUpdates) {
    creationSuccessNotifier(operation, entry.transformed)
    return entry.transformed
  }
  try {
    const createdOrUpdatedEntry = await requestQueue.add(() => {
      return destinationEntry
        ? updateDestinationWithSourceData(context, destinationEntry, entry.transformed)
        : createEntryInDestination(context, contentTypeId, entry.transformed)
    })

    creationSuccessNotifier(operation, createdOrUpdatedEntry)

    return createdOrUpdatedEntry
  } catch (err: any) {
    /* If a field doesn't exist, it means it has been removed from the content types
     * In that case, the field is removed from the entry, and creation is attempted again.
    */
    if (err instanceof Error) {
      if (context.skipContentModel && err.name === 'UnknownField') {
        const errors = get(JSON.parse(err.message), 'details.errors')
        entry.transformed.fields = cleanupUnknownFields(entry.transformed.fields, errors)
        return createEntry({ entry, context, destinationEntitiesById, skipUpdates, requestQueue })
      }
    }
    if (err instanceof ContentfulEntityError) {
      err.entity = entry
    }
    logEmitter.emit('error', err)

    // No need to pass this entry down to publishing if it wasn't created
    return null
  }
}

function updateDestinationWithSourceData (context: PushToSpaceContext, destinationEntity, sourceEntity) {
  const { client, spaceId, environmentId, type } = context
  const plainData = getPlainData(sourceEntity)
  const updated = assign({}, plainData, { sys: destinationEntity.sys })

  if (type === 'Entry') {
    return client.entry.update(
      { spaceId, environmentId, entryId: destinationEntity.sys.id },
      updated
    )
  }
  if (type === 'ContentType') {
    return client.contentType.update(
      { spaceId, environmentId, contentTypeId: destinationEntity.sys.id },
      updated
    )
  }
  if (type === 'Asset') {
    return client.asset.update(
      { spaceId, environmentId, assetId: destinationEntity.sys.id },
      updated
    )
  }
  if (type === 'Locale') {
    return client.locale.update(
      { spaceId, environmentId, localeId: destinationEntity.sys.id },
      updated
    )
  }
  if (type === 'Webhook') {
    return client.webhook.update(
      { spaceId, webhookDefinitionId: destinationEntity.sys.id },
      updated
    )
  }
  throw new Error(`updateDestinationWithSourceData: unsupported type "${type}"`)
}

function createInDestination (context: PushToSpaceContext, sourceEntity) {
  const { type, client, spaceId, environmentId } = context
  if (type === 'Tag') {
    return createTagInDestination(context, sourceEntity)
  }

  const id = get(sourceEntity, 'sys.id')
  const plainData = getPlainData(sourceEntity)

  if (type === 'ContentType') {
    return id
      ? client.contentType.createWithId({ spaceId, environmentId, contentTypeId: id }, plainData)
      : client.contentType.create({ spaceId, environmentId }, plainData)
  }
  if (type === 'Asset') {
    return id
      ? client.asset.createWithId({ spaceId, environmentId, assetId: id }, plainData)
      : client.asset.create({ spaceId, environmentId }, plainData)
  }
  if (type === 'Locale') {
    return client.locale.create({ spaceId, environmentId }, plainData)
  }
  if (type === 'Webhook') {
    return id
      ? client.webhook.update({ spaceId, webhookDefinitionId: id }, { ...plainData, sys: { id } })
      : client.webhook.create({ spaceId }, plainData)
  }
  throw new Error(`createInDestination: unsupported type "${type}"`)
}

function createEntryInDestination (context: PushToSpaceContext, contentTypeId: string, sourceEntity) {
  const { client, spaceId, environmentId } = context
  const id = sourceEntity.sys.id
  const plainData = getPlainData(sourceEntity)
  return id
    ? client.entry.createWithId({ spaceId, environmentId, contentTypeId, entryId: id }, plainData)
    : client.entry.create({ spaceId, environmentId, contentTypeId }, plainData)
}

function createTagInDestination (context: PushToSpaceContext, sourceEntity) {
  const { client, spaceId, environmentId } = context
  const id = sourceEntity.sys.id
  const visibility = sourceEntity.sys.visibility || 'private'
  const name = sourceEntity.name
  return client.tag.createWithId(
    { spaceId, environmentId, tagId: id },
    { name, sys: { visibility } }
  )
}

/**
 * Handles entity creation errors.
 * VersionMismatch errors are logged as warnings with guidance, since the entity
 * already exists at a different version — the update is skipped but import continues.
 * Other errors are logged as errors and the entity is excluded from further steps.
 */
function handleCreationErrors (entity, err) {
  // Handle the case where a locale already exists and skip it
  if (get(err, 'error.sys.id') === 'ValidationFailed') {
    const errors = get(err, 'error.details.errors')
    if (errors && errors.length > 0 && errors[0].name === 'taken') {
      return entity
    }
  }

  if (get(err, 'error.sys.id') === 'VersionMismatch') {
    logEmitter.emit('warning', `Version mismatch for entity ${getEntityName(entity.original)}: the destination has a newer version. This entity was skipped.`)
    return null
  }

  err.entity = entity.original
  logEmitter.emit('error', err)

  // No need to pass this entity down to publishing if it wasn't created
  return null
}

function cleanupUnknownFields (fields, errors) {
  return omitBy(fields, (field, fieldId) => {
    return find(errors, (error) => {
      const [, errorFieldId] = error.path
      return error.name === 'unknown' && errorFieldId === fieldId
    })
  })
}

function getDestinationEntityForSourceEntity (destinationEntitiesById, sourceEntity) {
  return destinationEntitiesById.get(get(sourceEntity, 'sys.id')) || null
}

function creationSuccessNotifier (method, createdEntity) {
  logEmitter.emit('info', `${method.toUpperCase()} ${createdEntity.sys.type} ${getEntityName(createdEntity)}`)
  return createdEntity
}

function getPlainData (entity) {
  return omit(entity, 'sys')
}
