import { find, filter } from 'lodash/collection'
import createClients from 'contentful-batch-libs/utils/create-clients'
import pushToSpace from 'contentful-batch-libs/push/push-to-space'
import Promise from 'bluebird'
import transformSpace from 'contentful-batch-libs/transform/transform-space'
import getTransformedDestinationResponse from './get-transformed-destination-response'
import log from 'npmlog'

export default function runContentfulImport (usageParams) {
  let {opts} = usageParams
  if (!opts) {
    opts = {}
    opts.destinationSpace = usageParams.spaceId
    opts.destinationManagementToken = usageParams.managementToken
    opts.content = usageParams.content
  }
  const clients = createClients(opts)
  opts.content.webhooks = opts.content.webhooks || []
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
