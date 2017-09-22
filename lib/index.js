import Promise from 'bluebird'
import Table from 'cli-table2'
import Listr from 'listr'
import UpdateRenderer from 'listr-update-renderer'
import VerboseRenderer from 'listr-verbose-renderer'
import { startCase } from 'lodash'
import moment from 'moment'

import pushToSpace from 'contentful-batch-libs/dist/push/push-to-space'
import transformSpace from 'contentful-batch-libs/dist/transform/transform-space'
import createClients from 'contentful-batch-libs/dist/utils/create-clients'
import {
  setupLogging,
  displayErrorLog,
  writeErrorLogFile
} from 'contentful-batch-libs/dist/utils/logging'

import getTransformedDestinationResponse from './get-transformed-destination-response'
import parseOptions from './parseOptions'

function createListrOptions (options) {
  if (options.useVerboseRenderer) {
    return {
      renderer: VerboseRenderer
    }
  }
  return {
    renderer: UpdateRenderer,
    collapse: false
  }
}

export default function runContentfulImport (params) {
  const log = []
  const options = parseOptions(params)
  const listrOptions = createListrOptions(options)

  // Setup custom log listener to store log messages for later
  setupLogging(log)

  const infoTable = new Table()

  infoTable.push([{colSpan: 2, content: 'The following entities are going to be imported:'}])

  Object.keys(options.content).forEach((type) => {
    if (options.skipLocales && type === 'locales') {
      return
    }

    if (options.skipContentModel && type === 'contentTypes') {
      return
    }

    if (options.contentModelOnly && !(['contentTypes', 'locales'].includes(type))) {
      return
    }

    infoTable.push([startCase(type), options.content[type].length])
  })

  console.log(infoTable.toString())

  const tasks = new Listr([
    {
      title: 'Initialize clients',
      task: (ctx) => {
        ctx.clients = createClients(options)
      }
    },
    {
      title: 'Checking if destination space already has any content and retrieving it',
      task: (ctx) => {
        return Promise.props({
          source: options.content,
          destination: getTransformedDestinationResponse({
            managementClient: ctx.clients.destination.management,
            spaceId: ctx.clients.destination.spaceId,
            sourceResponse: options.content,
            skipLocales: options.skipLocales,
            skipContentModel: options.skipContentModel
          })
        })
          .then(({source, destination}) => {
            ctx.source = source
            ctx.destination = destination
          })
      }
    },
    {
      title: 'Apply transformations to source data',
      task: (ctx) => {
        return Promise.props({
          source: transformSpace(ctx.source, ctx.destination),
          destination: ctx.destination
        })
          .then(({source, destination}) => {
            ctx.source = source
            ctx.destination = destination
          })
      }
    },
    {
      title: 'Push content to destination space',
      task: (ctx, task) => {
        return pushToSpace({
          sourceContent: ctx.source,
          destinationContent: ctx.destination,
          managementClient: ctx.clients.destination.management,
          spaceId: ctx.clients.destination.spaceId,
          assetProcessDelay: options.assetProcessDelay,
          contentModelOnly: options.contentModelOnly,
          skipLocales: options.skipLocales,
          skipContentModel: options.skipContentModel,
          skipContentPublishing: options.skipContentPublishing,
          prePublishDelay: options.prePublishDelay,
          listrOptions
        })
      }
    }
  ], listrOptions)

  return tasks.run({
    data: {}
  })
    .then((response) => {
      console.log('Finished importing all data')

      const durationHuman = options.startTime.fromNow(true)
      const durationSeconds = moment().diff(options.startTime, 'seconds')

      console.log(`The import took ${durationHuman} (${durationSeconds}s)`)

      return response
    })
    .catch((err) => {
      log.push({
        ts: (new Date()).toJSON(),
        level: 'error',
        error: err
      })
    })
    .then((data) => {
      const errorLog = log.filter((logMessage) => logMessage.level !== 'info')

      displayErrorLog(errorLog)
      if (errorLog.length) {
        return writeErrorLogFile(options.errorLogFile, errorLog)
          .then(() => data)
      }
      return data
    })
}
