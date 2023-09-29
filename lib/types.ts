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

export type TransformedAsset = {
  fields: { file: { upload: string, uploadFrom: Link<'Upload'> }[] },
  sys: {id: string}
}

export type AssetWithTransformed = {
  transformed: TransformedAsset,
  original: any
}

type OriginalContentType = ContentTypeProps

type ContentTypeWithOriginal = {
  original: OriginalContentType
  transformed: any
}

// TODO This is wip, mainly focusing on making expectations from the
// tests align with types. Next step should be to completely
// understand how the data is being transformed before being passed to
// pushToSpace and expand and restrict the types accordingly
export type TransformedSourceData = Pick<Resources, 'entries' | 'tags' | 'locales' | 'webhooks' | 'editorInterfaces'> & {
  assets: AssetWithTransformed[]
  contentTypes: ContentTypeWithOriginal[]
}

export type OriginalSourceData = Resources
