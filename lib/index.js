import { writeFile } from 'fs'

import { startCase } from 'lodash'
import { find, filter } from 'lodash/collection'
import Promise from 'bluebird'
import log from 'npmlog'
import Table from 'cli-table2'
import moment from 'moment'

import createClients from 'contentful-batch-libs/dist/utils/create-clients'
import pushToSpace from 'contentful-batch-libs/dist/push/push-to-space'
import transformSpace from 'contentful-batch-libs/dist/transform/transform-space'
import errorBuffer, { formatErrorOneLine, formatErrorLogfile } from 'contentful-batch-libs/dist/utils/error-buffer'

import getTransformedDestinationResponse from './get-transformed-destination-response'
import parseOptions from './parseOptions'

const summary = {}

export default function runContentfulImport (params) {
  summary.startTime = moment()

  const options = parseOptions(params)

  const clients = createClients(options)
  return Promise.props({
    source: options.content,
    destination: getTransformedDestinationResponse({
      managementClient: clients.destination.management,
      spaceId: clients.destination.spaceId,
      sourceResponse: options.content,
      contentModelOnly: options.contentModelOnly,
      skipLocales: options.skipLocales,
      skipContentModel: options.skipContentModel
    })
  })
    .then((responses) => {
      return Promise.props({
        source: transformSpace(responses.source, responses.destination),
        destination: responses.destination
      })
    })
    .then((responses) => {
      responses.source.deletedContentTypes = filter(responses.destination.contentTypes, (contentType) => {
        return !find(responses.source.contentTypes, {original: {sys: {id: contentType.sys.id}}})
      })
      responses.source.deletedLocales = filter(responses.destination.locales, (locale) => {
        return !find(responses.source.locales, {original: {code: locale.code}})
      })
      return responses
    })
    // push source space content to destination space
    .then((responses) => {
      return pushToSpace({
        sourceContent: responses.source,
        destinationContent: responses.destination,
        managementClient: clients.destination.management,
        spaceId: clients.destination.spaceId,
        prePublishDelay: options.prePublishDelay,
        assetProcessDelay: options.assetProcessDelay,
        contentModelOnly: options.contentModelOnly,
        skipLocales: options.skipLocales,
        skipContentModel: options.skipContentModel,
        skipContentPublishing: options.skipContentPublishing
      })
    })
    .then((response) => {
      log.info('import', 'Finished importing all data')

      const infoTable = new Table()

      infoTable.push([{colSpan: 2, content: 'The following entities were imported'}])

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

      const durationHuman = summary.startTime.fromNow(true)
      const durationSeconds = moment().diff(summary.startTime, 'seconds')

      log.info('import', `The import took ${durationHuman} (${durationSeconds}s)`)

      return response
    })
    .catch((err) => {
      errorBuffer.push(err)
    })
    .then(() => {
      const errors = errorBuffer.drain()
      if (errors.length) {
        log.error(`\n\nThe following ${errors.length} errors occurred:\n`)
        errors.map(formatErrorOneLine).map(log.error)
        const logFileErrors = errors.map(formatErrorLogfile)
        const bufferJSON = JSON.stringify(logFileErrors, null, 2)
        return Promise.promisify(writeFile)('./error-log-test.json', bufferJSON)
      }
    })
}
