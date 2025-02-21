import { ContentTypeProps, EntryProps, TagProps, WebhookProps } from 'contentful-management'
import { find, omit, pick, reduce } from 'lodash-es'

/**
 * Default transformer methods for each kind of entity.
 *
 * In the case of assets it also changes the asset url to the upload property
 * as the whole upload process needs to be followed again.
 */

export function contentTypes (contentType: ContentTypeProps) {
  return contentType
}

export function tags (tag: TagProps) {
  return tag
}

export function entries (entry: EntryProps, _, tagsEnabled = false) {
  return removeMetadataTags(entry, tagsEnabled)
}

export function webhooks (webhook: WebhookProps) {
  // Workaround for webhooks with credentials
  if (webhook.httpBasicUsername) {
    delete webhook.httpBasicUsername
  }

  // Workaround for webhooks with secret headers
  if (webhook.headers) {
    webhook.headers = webhook.headers.filter(header => !header.secret)
  }

  return webhook
}

export function assets (asset, _, tagsEnabled = false) {
  const transformedAsset = omit(asset, 'sys')
  transformedAsset.sys = pick(asset.sys, 'id')
  transformedAsset.fields = pick(asset.fields, 'title', 'description')
  transformedAsset.fields.file = reduce(
    asset.fields.file,
    (newFile, localizedFile, locale) => {
      newFile[locale] = pick(localizedFile, 'contentType', 'fileName')
      if (!localizedFile.uploadFrom) {
        const assetUrl = localizedFile.url || localizedFile.upload
        newFile[locale].upload = `${/^(http|https):\/\//i.test(assetUrl) ? '' : 'https:'}${assetUrl}`
      } else {
        newFile[locale].uploadFrom = localizedFile.uploadFrom
      }
      return newFile
    },
    {}
  )
  return removeMetadataTags(transformedAsset, tagsEnabled)
}

export function locales (locale, destinationLocales) {
  const transformedLocale = pick(locale, 'code', 'name', 'contentManagementApi', 'contentDeliveryApi', 'fallbackCode', 'optional')
  const destinationLocale = find(destinationLocales, { code: locale.code })
  if (destinationLocale) {
    // This will implicitly remove the locale ID
    // which then causes the create path to not pick `createLocaleWithId` but `createLocale` instead
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    transformedLocale.sys = pick(destinationLocale.sys, 'id')
  }

  return transformedLocale
}

function removeMetadataTags (entity, tagsEnabled = false) {
  if (!tagsEnabled) {
    delete entity.metadata
  }
  return entity
}
