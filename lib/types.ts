import type { AssetProps, ContentTypeProps, EditorInterfaceProps, EntryProps, LocaleProps, TagProps, WebhookProps } from 'contentful-management'

export type SpaceResources = {
  contentTypes?: ContentTypeProps[]
  tags?: TagProps[]
  locales?: LocaleProps[]
  entries?: EntryProps[]
  assets?: AssetProps[]
  editorInterfaces?: EditorInterfaceProps[]
  webhooks?: WebhookProps[]
}
