import Table from 'cli-table3'
import Listr from 'listr'
import UpdateRenderer from 'listr-update-renderer'
import VerboseRenderer from 'listr-verbose-renderer'
import { startCase } from 'lodash'
import moment from 'moment'

import {
  setupLogging,
  displayErrorLog,
  writeErrorLogFile
} from 'contentful-batch-libs/dist/logging'
import { wrapTask } from 'contentful-batch-libs/dist/listr'

import initClient from './tasks/init-client'
import getDestinationData from './tasks/get-destination-data'
import pushToSpace from './tasks/push-to-space/push-to-space'
import transformSpace from './transform/transform-space'
import { assertDefaultLocale, assertPayload } from './utils/validations'
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

  infoTable.push([{ colSpan: 2, content: 'The following entities are going to be imported:' }])

  Object.keys(options.content).forEach((type) => {
    if (options.skipLocales && type === 'locales') {
      return
    }

    if (options.skipContentModel && (['contentTypes', 'editorInterfaces'].indexOf(type) >= 0)) {
      return
    }

    if (options.contentModelOnly && !(['contentTypes', 'editorInterfaces', 'locales'].indexOf(type) >= 0)) {
      return
    }

    infoTable.push([startCase(type), options.content[type].length])
  })

  console.log(infoTable.toString())

  const tasks = new Listr([
    {
      title: 'Validating content-file',
      task: (ctx) => {
        assertPayload(options.content)
      }
    },
    {
      title: 'Initialize client',
      task: wrapTask((ctx) => {
        try {
          ctx.client = initClient(options)
          return Promise.resolve()
        } catch (err) {
          return Promise.reject(err)
        }
      })
    },
    {
      title: 'Checking if destination space already has any content and retrieving it',
      task: wrapTask((ctx, task) => {
        return getDestinationData({
          client: ctx.client,
          spaceId: options.spaceId,
          environmentId: options.environmentId,
          sourceData: options.content,
          skipLocales: options.skipLocales,
          skipContentModel: options.skipContentModel
        })
          .then((destinationData) => {
            ctx.sourceDataUntransformed = options.content
            ctx.destinationData = destinationData
            assertDefaultLocale(ctx.sourceDataUntransformed, ctx.destinationData)
          })
      })
    },
    {
      title: 'Apply transformations to source data',
      task: wrapTask((ctx) => {
        try {
          const transformedSourceData = transformSpace(ctx.sourceDataUntransformed, ctx.destinationData)
          ctx.sourceData = transformedSourceData
          return Promise.resolve()
        } catch (err) {
          return Promise.reject(err)
        }
      })
    },
    {
      title: 'Push content to destination space',
      task: (ctx, task) => {
        return pushToSpace({
          sourceData: ctx.sourceData,
          destinationData: ctx.destinationData,
          client: ctx.client,
          spaceId: options.spaceId,
          environmentId: options.environmentId,
          contentModelOnly: options.contentModelOnly,
          skipLocales: options.skipLocales,
          skipContentModel: options.skipContentModel,
          skipContentPublishing: options.skipContentPublishing,
          prePublishDelay: options.prePublishDelay,
          timeout: options.timeout,
          retryLimit: options.retryLimit,
          uploadAssets: options.uploadAssets,
          assetsDirectory: options.assetsDirectory,
          listrOptions
        })
      }
    }
  ], listrOptions)

  return tasks.run({
    data: {}
  })
    .then((ctx) => {
      console.log('Finished importing all data')

      const resultTypes = Object.keys(ctx.data)
      if (resultTypes.length) {
        const resultTable = new Table()

        resultTable.push([{ colSpan: 2, content: 'Imported entities' }])

        resultTypes.forEach((type) => {
          resultTable.push([startCase(type), ctx.data[type].length])
        })

        console.log(resultTable.toString())
      } else {
        console.log('No data was imported')
      }

      const durationHuman = options.startTime.fromNow(true)
      const durationSeconds = moment().diff(options.startTime, 'seconds')

      console.log(`The import took ${durationHuman} (${durationSeconds}s)`)

      return ctx.data
    })
    .catch((err) => {
      log.push({
        ts: (new Date()).toJSON(),
        level: 'error',
        error: err
      })
    })
    .then((data) => {
      const errorLog = log.filter((logMessage) => logMessage.level !== 'info' && logMessage.level !== 'warning')
      const displayLog = log.filter((logMessage) => logMessage.level !== 'info')
      displayErrorLog(displayLog)

      if (errorLog.length) {
        return writeErrorLogFile(options.errorLogFile, errorLog)
          .then(() => {
            const multiError = new Error('Errors occurred')
            multiError.name = 'ContentfulMultiError'
            multiError.errors = errorLog
            throw multiError
          })
      }

      console.log('The import was successful.')

      return data
    })
}
