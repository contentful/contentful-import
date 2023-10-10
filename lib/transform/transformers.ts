import { omit, pick, find, reduce } from 'lodash'
import { AssetProps, ContentTypeProps, EntryProps, LocaleProps, TagProps, WebhookProps } from 'contentful-management'
import { MetadataProps } from 'contentful-management/dist/typings/common-types'

/**
 * Default transformer methods for each kind of entity.
 *
 * In the case of assets it also changes the asset url to the upload property
 * as the whole upload process needs to be followed again.
 */

function contentTypes (contentType: ContentTypeProps) {
  return contentType
}

function tags (tag: TagProps) {
  return tag
}

function entries (entry: EntryProps, _, tagsEnabled = false) {
  return removeMetadataTags(entry, tagsEnabled)
}

function webhooks (webhook: WebhookProps) {
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

function assets (asset: AssetProps, _, tagsEnabled = false) {
  const transformedAsset = omit(asset, 'sys')
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  transformedAsset.sys = pick(asset.sys, 'id')
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  transformedAsset.fields = pick(asset.fields, 'title', 'description')
  transformedAsset.fields.file = reduce(
    asset.fields.file,
    (newFile, localizedFile, locale) => {
      newFile[locale] = pick(localizedFile, 'contentType', 'fileName')
      if (!localizedFile.uploadFrom) {
        const assetUrl = localizedFile.url || localizedFile.upload
        newFile[locale].upload = `${/^(http|https):\/\//i.test(assetUrl!) ? '' : 'https:'}${assetUrl}`
      } else {
        newFile[locale].uploadFrom = localizedFile.uploadFrom
      }
      return newFile
    },
    {}
  )
  return removeMetadataTags(transformedAsset, tagsEnabled)
}

function locales (locale: LocaleProps, destinationLocales: Array<LocaleProps>): LocaleProps {
  const transformedLocale = pick(locale, 'code', 'name', 'contentManagementApi', 'contentDeliveryApi', 'fallbackCode', 'optional')
  const destinationLocale = find(destinationLocales, { code: locale.code })
  if (destinationLocale) {
    // This will implicitly remove the locale ID
    // which then causes the create path to not pick `createLocaleWithId` but `createLocale` instead
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    transformedLocale.sys = pick(destinationLocale.sys, 'id')
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return transformedLocale
}

function removeMetadataTags<T extends { metadata?: MetadataProps }> (entity: T, tagsEnabled = false): T {
  if (!tagsEnabled) {
    delete entity.metadata
  }
  return entity
}

export const transformers = {
  contentTypes,
  tags,
  entries,
  webhooks,
  assets,
  locales
}
