import Table from 'cli-table3'
import differenceInSeconds from 'date-fns/differenceInSeconds'
import formatDistance from 'date-fns/formatDistance'
import Listr from 'listr'
import UpdateRenderer from 'listr-update-renderer'
import VerboseRenderer from 'listr-verbose-renderer'
import { startCase } from 'lodash'
import PQueue from 'p-queue'

import { displayErrorLog, setupLogging, writeErrorLogFile } from 'contentful-batch-libs/dist/logging'
import { wrapTask } from 'contentful-batch-libs/dist/listr'

import initClient from './tasks/init-client'
import getDestinationData from './tasks/get-destination-data'
import pushToSpace from './tasks/push-to-space/push-to-space'
import transformSpace from './transform/transform-space'
import { assertDefaultLocale, assertPayload } from './utils/validations'
import parseOptions from './parseOptions'
import { ContentfulMultiError, LogItem } from './utils/errors'

const ONE_SECOND = 1000

const tableOptions = {
  // remove ANSI color codes for better CI/CD compatibility
  style: { head: [], border: [] }
}

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

// These type definitions follow what is specified in the Readme
type RunContentfulImportParams = {
  spaceId: string,
  environmentId?: string,
  managementToken: string,
  contentFile?: string,
  content?: object,
  contentModelOnly?: boolean,
  skipContentModel?: boolean,
  skipLocales?: boolean,
  skipContentPublishing?: boolean,
  skipAssetUpdates?: boolean,
  skipContentUpdates?: boolean,
  uploadAssets?: boolean,
  assetsDirectory?: string,
  host?: string,
  proxy?: string,
  rawProxy?: string,
  rateLimit?: number,
  headers?: object,
  errorLogFile?: string,
  useVerboseRenderer?: boolean,
  // TODO These properties are not documented in the Readme
  timeout?: number,
  retryLimit?: number,
  config?: string,
}

async function runContentfulImport (params: RunContentfulImportParams) {
  const log: LogItem[] = []
  const options = await parseOptions(params)
  const listrOptions = createListrOptions(options)
  const requestQueue = new PQueue({
    interval: ONE_SECOND,
    intervalCap: options.rateLimit,
    carryoverConcurrencyCount: true
  })

  // Setup custom log listener to store log messages for later
  setupLogging(log)

  const infoTable = new Table(tableOptions)

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
      task: () => {
        assertPayload(options.content)
      }
    },

    {
      title: 'Initialize client',
      task: wrapTask(async (ctx) => {
        ctx.client = initClient({ ...options, content: undefined })
      })
    },
    {
      title: 'Checking if destination space already has any content and retrieving it',
      task: wrapTask(async (ctx) => {
        const destinationData = await getDestinationData({
          client: ctx.client,
          spaceId: options.spaceId,
          environmentId: options.environmentId,
          sourceData: options.content,
          skipLocales: options.skipLocales,
          skipContentModel: options.skipContentModel,
          requestQueue
        })

        ctx.sourceDataUntransformed = options.content
        ctx.destinationData = destinationData
        assertDefaultLocale(ctx.sourceDataUntransformed, ctx.destinationData)
      })
    },
    {
      title: 'Apply transformations to source data',
      task: wrapTask(async (ctx) => {
        const transformedSourceData = transformSpace(ctx.sourceDataUntransformed, ctx.destinationData)
        ctx.sourceData = transformedSourceData
      })
    },
    {
      title: 'Push content to destination space',
      task: (ctx) => {
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
          skipAssetUpdates: options.skipAssetUpdates,
          skipContentUpdates: options.skipContentUpdates,
          timeout: options.timeout,
          retryLimit: options.retryLimit,
          uploadAssets: options.uploadAssets,
          assetsDirectory: options.assetsDirectory,
          listrOptions,
          requestQueue
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
        const resultTable = new Table(tableOptions)

        resultTable.push([{ colSpan: 2, content: 'Imported entities' }])

        resultTypes.forEach((type) => {
          resultTable.push([startCase(type), ctx.data[type].length])
        })

        console.log(resultTable.toString())
      } else {
        console.log('No data was imported')
      }

      const endTime = new Date()
      const durationHuman = formatDistance(endTime, options.startTime)
      const durationSeconds = differenceInSeconds(endTime, options.startTime)

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
            const multiError = new ContentfulMultiError('Errors occurred')
            multiError.name = 'ContentfulMultiError'

            multiError.errors = errorLog
            throw multiError
          })
      }

      console.log('The import was successful.')

      return data
    })
}

// We are providing default exports both for CommonJS and ES6 module
// systems here as a workaround, because we have some contraints which
// don't allow us to generate compatibility for both es6 and common js
// otherwise. We originally wanted to set 'esModuleInterop' to false
// to keep compatibility with direct 'require()' calls in JavaScript,
// ensuring that consumers can simply use 'require("package-name")'
// without the '.default'. However, we have a dependency on
// 'cli-table3' that requires 'esModuleInterop' to be set to true for
// its default imports to work. Thats why we just provide both export
// mechanisms.

// Default export for ES6-style imports
export default runContentfulImport

// Export for CommonJS-style imports
module.exports = runContentfulImport
