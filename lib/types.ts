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

export type ResourcesUnion = (ContentTypeProps | TagProps | LocaleProps | EntryProps | AssetProps | EditorInterfaceProps | WebhookProps)[]

export type DestinationData = Resources

export type TransformedAsset = {
  fields: {
    file: {
      [locale: string]: {
        upload?: string,
        uploadFrom?: Link<'Upload'>,
        fileName?: string,
        contentType?: string
      }
    }
  },
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
export type TransformedSourceData = {
  assets: EntityTransformed<TransformedAsset, any>[]
  contentTypes: EntityTransformed<ContentTypeProps, any>[]
  entries: EntityTransformed<EntryProps, any>[]
  locales: EntityTransformed<LocaleProps, any>[]
  tags: EntityTransformed<TagProps, any>[]
  webhooks: EntityTransformed<WebhookProps, any>[]
  editorInterfaces: EditorInterfaceProps[]
}

export type TransformedSourceDataUnion = (
  EntityTransformed<TransformedAsset, any> |
  EntityTransformed<ContentTypeProps, any> |
  EntityTransformed<EntryProps, any> |
  EntityTransformed<LocaleProps, any> |
  EntityTransformed<TagProps, any> |
  EntityTransformed<WebhookProps, any> |
  EntityTransformed<EditorInterfaceProps, any>
)[]

export type OriginalSourceData = Resources
