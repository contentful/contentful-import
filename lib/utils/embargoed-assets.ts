const EMBARGOED_ASSET_HOST_PATTERN = /^[^.]+\.secure\.ctfassets\.net$/i

type AssetFile = {
  url?: unknown
  upload?: unknown
}

type Content = {
  assets?: Array<{
    fields?: {
      file?: Record<string, AssetFile>
    }
  }>
}

function getHostname (url: string) {
  try {
    const normalizedUrl = url.startsWith('//') ? `https:${url}` : url
    return new URL(normalizedUrl).hostname
  } catch {
    return undefined
  }
}

export function isEmbargoedAssetUrl (url: unknown): url is string {
  if (typeof url !== 'string') {
    return false
  }

  const hostname = getHostname(url)
  return hostname ? EMBARGOED_ASSET_HOST_PATTERN.test(hostname) : false
}

export function getEmbargoedAssetCount (content: Content): number {
  return (content.assets || []).reduce((count, asset) => {
    const embargoedAssetFiles = Object.values(asset.fields?.file || {}).filter((file) => {
      return isEmbargoedAssetUrl(file?.url) || isEmbargoedAssetUrl(file?.upload)
    })

    return count + embargoedAssetFiles.length
  }, 0)
}
