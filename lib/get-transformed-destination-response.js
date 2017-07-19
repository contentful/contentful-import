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
  contentModelOnly,
  skipLocales,
  skipContentModel
}) {
  return getOutdatedDestinationContent({
    managementClient,
    spaceId,
    sourceResponse,
    contentModelOnly,
    skipLocales,
    skipContentModel
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
