import { find } from 'lodash/collection'
import { assign, get, omitBy, omit } from 'lodash/object'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ContentfulEntityError } from '../../utils/errors'

type CreateEntitiesParams = {
  context: any,
  entities: any[],
  destinationEntitiesById: Map<string, any>,
  requestQueue: any
}

/**
 * Creates a list of entities
 * Applies to all entities except Entries, as the CMA API for those is slightly different
 * See handleCreationErrors for details on what errors reject the promise or not.
 */
export function createEntities ({ context, entities, destinationEntitiesById, requestQueue }: CreateEntitiesParams) {
  return createEntitiesWithConcurrency({ context, entities, destinationEntitiesById, requestQueue })
}

// TODO
// Locales need to be created in series
export function createLocales ({ context, entities, destinationEntitiesById, requestQueue }) {
  return createEntitiesInSequence({ context, entities, destinationEntitiesById, requestQueue })
}

async function createEntitiesWithConcurrency ({ context, entities, destinationEntitiesById, requestQueue }) {
  const pendingCreatedEntities = entities.map((entity) => {
    const destinationEntity = getDestinationEntityForSourceEntity(destinationEntitiesById, entity.transformed)
    const operation = destinationEntity ? 'update' : 'create'

    return requestQueue.add(async () => {
      try {
        const createdEntity = await (destinationEntity
          ? updateDestinationWithSourceData(destinationEntity, entity.transformed)
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

async function createEntitiesInSequence ({ context, entities, destinationEntitiesById, requestQueue }) {
  const createdEntities = []
  for (const entity of entities) {
    const destinationEntity = getDestinationEntityForSourceEntity(destinationEntitiesById, entity.transformed)
    const operation = destinationEntity ? 'update' : 'create'

    try {
      // Even though we run things in sequence here,
      // we still want to go through the normal rate limiting queue
      const createdEntity = await requestQueue.add(async () => {
        const createdOrUpdatedEntity = await (destinationEntity
          ? updateDestinationWithSourceData(destinationEntity, entity.transformed)
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
export async function createEntries ({ context, entities, destinationEntitiesById, requestQueue }) {
  const createdEntries = await Promise.all(entities.map((entry) => {
    return createEntry({ entry, target: context.target, skipContentModel: context.skipContentModel, destinationEntitiesById, requestQueue })
  }))

  return createdEntries.filter((entry) => entry)
}

async function createEntry ({ entry, target, skipContentModel, destinationEntitiesById, requestQueue }) {
  const contentTypeId = entry.original.sys.contentType.sys.id
  const destinationEntry = getDestinationEntityForSourceEntity(
    destinationEntitiesById, entry.transformed)
  const operation = destinationEntry ? 'update' : 'create'
  try {
    const createdOrUpdatedEntry = await requestQueue.add(() => {
      return (destinationEntry
        ? updateDestinationWithSourceData(destinationEntry, entry.transformed)
        : createEntryInDestination(target, contentTypeId, entry.transformed))
    })

    creationSuccessNotifier(operation, createdOrUpdatedEntry)

    return createdOrUpdatedEntry
  } catch (err: any) {
    /* If a field doesn't exist, it means it has been removed from the content types
     * In that case, the field is removed from the entry, and creation is attempted again.
    */
    if (err instanceof Error) {
      if (skipContentModel && err.name === 'UnknownField') {
        const errors = get(JSON.parse(err.message), 'details.errors')
        entry.transformed.fields = cleanupUnknownFields(entry.transformed.fields, errors)
        return createEntry({ entry, target, skipContentModel, destinationEntitiesById, requestQueue })
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

function updateDestinationWithSourceData (destinationEntity, sourceEntity) {
  const plainData = getPlainData(sourceEntity)
  assign(destinationEntity, plainData)
  return destinationEntity.update()
}

function createInDestination (context, sourceEntity) {
  const { type, target } = context
  if (type === 'Tag') {
    // tags are created with a different signature
    return createTagInDestination(context, sourceEntity)
  }

  const id = get(sourceEntity, 'sys.id')
  const plainData = getPlainData(sourceEntity)

  return id
    ? target[`create${type}WithId`](id, plainData)
    : target[`create${type}`](plainData)
}

function createEntryInDestination (space, contentTypeId, sourceEntity) {
  const id = sourceEntity.sys.id
  const plainData = getPlainData(sourceEntity)
  return id
    ? space.createEntryWithId(contentTypeId, id, plainData)
    : space.createEntry(contentTypeId, plainData)
}

function createTagInDestination (context, sourceEntity) {
  const id = sourceEntity.sys.id
  const visibility = sourceEntity.sys.visibility || 'private'
  const name = sourceEntity.name
  return context.target.createTag(id, name, visibility)
}

/**
 * Handles entity creation errors.
 * If the error is a VersionMismatch the error is thrown and a message is returned
 * instructing the user on what this situation probably means.
 */
function handleCreationErrors (entity, err) {
  // Handle the case where a locale already exists and skip it
  if (get(err, 'error.sys.id') === 'ValidationFailed') {
    const errors = get(err, 'error.details.errors')
    if (errors && errors.length > 0 && errors[0].name === 'taken') {
      return entity
    }
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
  const verb = method[0].toUpperCase() + method.substr(1, method.length) + 'd'
  logEmitter.emit('info', `${verb} ${createdEntity.sys.type} ${getEntityName(createdEntity)}`)
  return createdEntity
}

function getPlainData (entity) {
  const data = entity.toPlainObject ? entity.toPlainObject() : entity
  return omit(data, 'sys')
}
