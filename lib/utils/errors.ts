import type { AssetProps, EditorInterfaceProps, EntryProps } from 'contentful-management'

export class ContentfulAssetError extends Error {
  filePath: string
  constructor (message: string, filePath: string) {
    super(message)
    this.filePath = filePath
  }
}

export class ContentfulValidationError extends Error {
  error?: {
    sys: { id: string };
    details: {
      errors: Array<{ name: string }>;
    };
  }
}

export class ContentfulEntityError extends Error {
  entity: EntryProps | AssetProps | EditorInterfaceProps
}

export class ContentfulMultiError extends Error {
  errors: ContentfulValidationError[]
}
