import Promise from 'bluebird'

import getEntityName from 'contentful-batch-libs/dist/get-entity-name'
import { logEmitter } from 'contentful-batch-libs/dist/logging'

/**
 * Publish a list of entities.
 * Does not return a rejected promise in the case of an error, pushing it
 * to an error buffer instead.
 */
export function publishEntities (entities) {
  const entitiesToPublish = entities.filter((entity) => {
    if (!entity || !entity.publish) {
      logEmitter.emit('warning', `Unable to publish ${getEntityName(entity)}`)
      return false
    }
    return true
  })

  if (entitiesToPublish.length === 0) {
    logEmitter.emit('info', 'Skipping publishing since zero valid entities passed')
    return Promise.resolve([])
  }

  const entity = entities[0].original || entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Publishing ${entities.length} ${type}s`)

  return runQueue(entitiesToPublish)
    .then((result) => {
      logEmitter.emit('info', `Successfully published ${result.length} ${type}s`)
      return result
    })
}

export function archiveEntities (entities) {
  const entitiesToArchive = entities.filter((entity) => {
    if (!entity || !entity.archive) {
      logEmitter.emit('warning', `Unable to archive ${getEntityName(entity)}`)
      return false
    }
    return true
  })

  if (entitiesToArchive.length === 0) {
    logEmitter.emit('info', 'Skipping archiving since zero valid entities passed')
    return Promise.resolve([])
  }

  const entity = entities[0].original || entities[0]
  const type = entity.sys.type || 'unknown type'
  logEmitter.emit('info', `Archiving ${entities.length} ${type}s`)

  return Promise.map(entitiesToArchive, () => {
    return entity.archive()
      .then((entity) => {
        return entity
      }, (err) => {
        err.entity = entity
        logEmitter.emit('error', err)
        return null
      })
  })
    .then((result) => {
      logEmitter.emit('info', `Successfully archived ${result.length} ${type}s`)
      return result
    })
}

function runQueue (queue, result) {
  if (!result) {
    result = []
  }
  return Promise.map(queue, (entity, index) => {
    logEmitter.emit('info', `Publishing ${entity.sys.type} ${getEntityName(entity)}`)
    return entity.publish()
      .then((entity) => {
        return entity
      }, (err) => {
        err.entity = entity
        logEmitter.emit('error', err)
        return null
      })
  }, {concurrency: 1})
    .then((entities) => entities.filter((entity) => entity))
    .then((publishedEntities) => {
      result = [
        ...result,
        ...publishedEntities
      ]
      const publishedEntityIds = publishedEntities.map((entitiy) => entitiy.sys.id)
      const unpublishedEntities = queue.filter((entity) => publishedEntityIds.indexOf(entity.sys.id) === -1)
      return unpublishedEntities
    })
    .then((unpublishedEntities) => {
      if (unpublishedEntities.length > 0) {
        if (queue.length === unpublishedEntities.length) {
          // Fail when queue could not publish at least one item
          const unpublishedEntityNames = unpublishedEntities.map(getEntityName).join(', ')
          logEmitter.emit('error', `Could not publish the following entities: ${unpublishedEntityNames}`)
        } else {
          // Rerun queue with unpublished entities
          return runQueue(unpublishedEntities, result)
        }
      }
      // Return only published entities + last result
      return result
    })
}
