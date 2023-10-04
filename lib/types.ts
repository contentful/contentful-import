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

export type EntityTransformed<TransformedType, OriginalType> = {
  original: OriginalType
  transformed: TransformedType
}

// TODO This is wip, mainly focusing on making expectations from the
// tests align with types. Next step should be to completely
// understand how the data is being transformed before being passed to
// pushToSpace and expand and restrict the types accordingly
export type TransformedSourceData = Pick<Resources, 'tags' | 'locales' | 'webhooks' | 'editorInterfaces'> & {
  assets: EntityTransformed<TransformedAsset, any>[]
  contentTypes: EntityTransformed<ContentTypeProps, any>[]
  entries: EntityTransformed<EntryProps, any>[]
}

export type OriginalSourceData = Resources
