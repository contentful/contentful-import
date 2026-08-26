const EMBARGOED_ASSET_URL_PATTERN = /((images)|(assets)|(downloads)|(videos))\.secure\./i

type AssetFile = {
  url?: unknown
  upload?: unknown
}

type Asset = {
  sys?: {
    id?: unknown
  }
  fields?: {
    file?: Record<string, AssetFile>
  }
}

type Content = {
  assets?: Asset[]
}

export type EmbargoedAssetReference = {
  assetId: string
  locale: string
}

export function isEmbargoedAssetUrl (url: unknown): url is string {
  return typeof url === 'string' && EMBARGOED_ASSET_URL_PATTERN.test(url)
}

export function getEmbargoedAssetReferences (content: Content): EmbargoedAssetReference[] {
  return (content.assets || []).flatMap((asset) => {
    const assetId = typeof asset.sys?.id === 'string' ? asset.sys.id : 'unknown'

    return Object.entries(asset.fields?.file || {}).flatMap(([locale, file]) => {
      const assetUrl = file?.url || file?.upload

      if (!isEmbargoedAssetUrl(assetUrl)) {
        return []
      }

      return [{ assetId, locale }]
    })
  })
}
