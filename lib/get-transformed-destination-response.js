import {map} from 'lodash/collection'

import getOutdatedDestinationContent from 'contentful-batch-libs/dist/get/get-outdated-destination-content'

/**
 * Gets the response from the destination space with the content that needs
 * to be updated. If it's the initial sync, and content exists, we abort
 * and tell the user why.
 */
export default function getTransformedDestinationResponse ({
  managementClient,
  spaceId,
  sourceResponse,
  skipLocales,
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

    if (skipLocales) {
      destinationResponse.locales = []
    }

    return destinationResponse
  })
}
