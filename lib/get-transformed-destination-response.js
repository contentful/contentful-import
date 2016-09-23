import {map} from 'lodash/collection'
import getOutdatedDestinationContent from 'contentful-batch-libs/get/get-outdated-destination-content'

/**
 * Gets the response from the destination space with the content that needs
 * to be updated. If it's the initial sync, and content exists, we abort
 * and tell the user why.
 */
export default function getTransformedDestinationResponse ({
  managementClient,
  spaceId,
  sourceResponse,
  skipContentModel
}) {
  return getOutdatedDestinationContent({
    managementClient: managementClient,
    spaceId: spaceId,
    entryIds: map(sourceResponse.entries, 'sys.id'),
    assetIds: map(sourceResponse.assets, 'sys.id')
  })
  .then((destinationResponse) => {
    if (skipContentModel) {
      destinationResponse.contentTypes = []
      destinationResponse.locales = []
    }

    if (sourceResponse.isInitialSync && (destinationResponse.contentTypes.length > 0 || destinationResponse.assets.length > 0)) {
      throw new Error('Your destination space already has some content.\n' +
                'If you have a token file, please place it on the same directory which you are currently in.\n' +
                'Otherwise, please run this tool on an empty space.\n' +
                'If you\'d like more information, please consult the README at:\n' +
                'https://github.com/contentful/contentful-import')
    }
    return destinationResponse
  })
}
