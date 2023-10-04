export class ContentfulAssetError extends Error {
  filePath: string
  constructor (message: string, filePath: string) {
    super(message)
    this.filePath = filePath
  }
}

export class ContentfulValidationError extends Error {
  error?: {
    sys: { id: string }
    details: {
      errors: Array<{ name: string }>
    }
  }
}
