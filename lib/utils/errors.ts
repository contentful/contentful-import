export class ContentfulAssetError extends Error {
  filePath: string
  constructor(message: string, filePath: string) {
    super(message)
    this.filePath = filePath
  }
}
