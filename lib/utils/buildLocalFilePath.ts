import path from 'path'

export function buildLocalFilePath (url, directory, fileName) {
  // handle urls without protocol
  if (url.startsWith('//')) {
    url = 'https:' + url
  }

  const { host, pathname } = new URL(url)
  // Extract directory path without leading slash
  const pathWithoutFilename = pathname.substring(1, pathname.lastIndexOf('/') + 1)
  const localFilePath = fileName ? path.join(directory, host, pathWithoutFilename, fileName) : path.join(directory, host, decodeURIComponent(pathname))

  return localFilePath
}
