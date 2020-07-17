import Promise from 'bluebird'
import {partial} from 'lodash/function'
import {find} from 'lodash/collection'
import {assign, get, omitBy, omit} from 'lodash/object'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

/**
 * Creates a list of entities
 * Applies to all entities except Entries, as the CMA API for those is slightly different
 * See handleCreationErrors for details on what errors reject the promise or not.
 */
export function createEntities (context, entities, destinationEntities, concurrency = 6) {
  return createEntitiesWithConcurrency(context, entities, destinationEntities, concurrency, Promise.map)
}

export function createLocales (context, entities, destinationEntities) {
  return createEntitiesWithConcurrency(context, entities, destinationEntities, 1, Promise.mapSeries)
}

function createEntitiesWithConcurrency (context, entities, destinationEntities, concurrency, mapper) {
  return mapper(entities, (entity) => {
    const destinationEntity = getDestinationEntityForSourceEntity(destinationEntities, entity.transformed)
    const operation = destinationEntity ? 'update' : 'create'
    const promise = destinationEntity
      ? updateDestinationWithSourceData(destinationEntity, entity.transformed)
      : createInDestination(context, entity.transformed)
    return promise
      .then(partial(creationSuccessNotifier, operation))
      .catch(partial(handleCreationErrors, entity))
  }, {concurrency})
}

/**
 * Creates a list of entries
 */
export function createEntries (context, entries, destinationEntries) {
  return Promise.map(entries, (entry) => createEntry(
    entry, context.target, context.skipContentModel, destinationEntries),
  {concurrency: 6})
}

function createEntry (entry, target, skipContentModel, destinationEntries) {
  const contentTypeId = entry.original.sys.contentType.sys.id
  const destinationEntry = getDestinationEntityForSourceEntity(
    destinationEntries, entry.transformed)
  const operation = destinationEntry ? 'update' : 'create'
  const promise = destinationEntry
    ? updateDestinationWithSourceData(destinationEntry, entry.transformed)
    : createEntryInDestination(target, contentTypeId, entry.transformed)
  return promise
    .then(partial(creationSuccessNotifier, operation))
    .catch(partial(handleEntryCreationErrors, entry, target, skipContentModel,
      destinationEntries))
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
  const name = sourceEntity.name
  return context.target['createTag'](id, name)
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

/**
 * Handles entry creation errors.
 * If a field doesn't exist, it means it has been removed from the content types
 * In that case, the field is removed from the entry, and creation is attempted again.
 */
function handleEntryCreationErrors (entry, space, skipContentModel, destinationEntries, err) {
  if (skipContentModel && err.name === 'UnknownField') {
    const errors = get(JSON.parse(err.message), 'details.errors')
    entry.transformed.fields = cleanupUnknownFields(entry.transformed.fields, errors)
    return createEntry(entry, space, skipContentModel, destinationEntries)
  }
  err.entity = entry
  logEmitter.emit('error', err)

  // No need to pass this entry down to publishing if it wasn't created
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

function getDestinationEntityForSourceEntity (destinationEntities, sourceEntity) {
  return find(destinationEntities, {
    sys: {id: get(sourceEntity, 'sys.id', null)}
  })
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
