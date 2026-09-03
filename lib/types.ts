import type { AssetProps, ContentTypeProps, EditorInterfaceProps, EntryProps, Link, LocaleProps, ReleaseProps, TagProps, WebhookProps } from 'contentful-management'
import type { ComponentProps, DataAssemblyProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps } from 'contentful-management'

export type { ComponentProps, DataAssemblyProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps }

export type Resources = {
  contentTypes?: ContentTypeProps[]
  tags?: TagProps[]
  locales?: LocaleProps[]
  entries?: EntryProps[]
  assets?: AssetProps[]
  editorInterfaces?: EditorInterfaceProps[]
  webhooks?: WebhookProps[]
  components?: ComponentProps[]
  experienceTemplates?: ExperienceTemplateProps[]
  experienceFragments?: ExperienceFragmentProps[]
  dataAssemblies?: DataAssemblyProps[]
  experiences?: ExperienceProps[]
  designTokens?: DesignTokenProps[]
  releases?: ReleaseProps[]
}

// TODO: should ResourcesUnion also include Releases and Experience Orchestration entities? If so, we need to update the type accordingly.
export type ResourcesUnion = (ContentTypeProps | TagProps | LocaleProps | EntryProps | AssetProps | EditorInterfaceProps | WebhookProps)[]

export type DestinationData = Resources

export type TransformedAsset = {
  fields: { file: { upload?: string, uploadFrom: Link<'Upload'> }[] },
  sys: { id: string }
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

  // TODO: QUESTION: should these be EntityTransformed types as well? If so, we need to update the type accordingly.
  components?: ComponentProps[]
  experienceTemplates?: ExperienceTemplateProps[]
  experienceFragments?: ExperienceFragmentProps[]
  dataAssemblies?: DataAssemblyProps[]
  experiences?: ExperienceProps[]
  designTokens?: DesignTokenProps[]
  releases?: EntityTransformed<ReleaseProps, any>[]
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
