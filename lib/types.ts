import type { AssetProps, ContentTypeProps, EditorInterfaceProps, EntryProps, Link, LocaleProps, TagProps, WebhookProps } from 'contentful-management'

export type Resources = {
  contentTypes?: ContentTypeProps[]
  tags?: TagProps[]
  locales?: LocaleProps[]
  entries?: EntryProps[]
  assets?: AssetProps[]
  editorInterfaces?: EditorInterfaceProps[]
  webhooks?: WebhookProps[]
}

export type DestinationData = Resources

// TODO For some reasons, the asset objects used here do not conform
// with the asset type from contentful-management, e.g. having an
// additional field "transformed". Thats why for now we use our own
// divergent object.
export type TransformedAsset = {
  fields: { file: { upload: string, uploadFrom: Link<'Upload'> }[] },
  sys: {id: string}
}

type OriginalContentType = ContentTypeProps

export type AssetWithTransformed = {
  transformed: TransformedAsset,
  original: any
}

type ContentTypeWithOriginal = {
  original: OriginalContentType
}

export type TransformedSourceData = Pick<Resources, 'entries' | 'tags' | 'locales' | 'webhooks' | 'editorInterfaces'> & {
  assets: AssetWithTransformed[]
  contentTypes: ContentTypeWithOriginal[]
}

// // TODO Completely understand how the data is being transformed
// // and constrain the types accordingly
export type OriginalSourceData = Resources
