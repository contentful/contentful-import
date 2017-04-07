import { find, filter } from 'lodash/collection'
import createClients from 'contentful-batch-libs/dist/utils/create-clients'
import pushToSpace from 'contentful-batch-libs/dist/push/push-to-space'
import Promise from 'bluebird'
import transformSpace from 'contentful-batch-libs/dist/transform/transform-space'
import getTransformedDestinationResponse from './get-transformed-destination-response'
import log from 'npmlog'
import fs from 'fs'
import { resolve } from 'path'

export default function runContentfulImport (usageParams) {
  const defaultOpts = {
    skipContentModel: false,
    skipLocales: false,
    skipContentPublishing: false
  }

  const configFile = usageParams.config
  ? require(resolve(process.cwd(), usageParams.config))
  : {}

  const opts = {
    ...defaultOpts,
    ...configFile,
    ...usageParams
  }

  opts.content = opts.content || JSON.parse(fs.readFileSync(opts.contentFile))

  if (!opts.spaceId) {
    return Promise.reject(new Error('The `spaceId` option is required.'))
  }

  if (!opts.managementToken) {
    return Promise.reject(new Error('The `managementToken` option is required.'))
  }

  if (!opts.contentFile && !opts.content) {
    return Promise.reject(new Error('Either the `contentFile` or `content` option are required.'))
  }

  if (opts.contentModelOnly && opts.skipContentModel) {
    return Promise.reject(new Error('`contentModelOnly` and `skipContentModel` cannot be used together'))
  }

  if (opts.skipLocales && !opts.contentModelOnly) {
    return Promise.reject(new Error('`skipLocales` can only be used together with `contentModelOnly`'))
  }

  opts.content.webhooks = opts.content.webhooks || []
  opts.destinationSpace = opts.spaceId
  opts.destinationManagementToken = opts.managementToken

  const clients = createClients(opts)
  return Promise.props({
    source: opts.content,
    destination: getTransformedDestinationResponse({
      managementClient: clients.destination.management,
      spaceId: clients.destination.spaceId,
      sourceResponse: opts.content,
      skipLocales: opts.skipLocales,
      skipContentModel: opts.skipContentModel
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
        prePublishDelay: opts.prePublishDelay,
        assetProcessDelay: opts.assetProcessDelay,
        contentModelOnly: opts.contentModelOnly,
        skipLocales: opts.skipLocales,
        skipContentModel: opts.skipContentModel,
        skipContentPublishing: opts.skipContentPublishing
      })
        .then((responses) => {
          log.info('Successfully Imported all data')
          return true
        })
    })
    .catch((err) => {
      log.error(err)
      throw err
    })
}
