import type { AssetProps, ContentTypeProps, EditorInterfaceProps, EntryProps, Link, LocaleProps, ReleasePayloadV2, ReleaseProps, TagProps, WebhookProps } from 'contentful-management'
import type { ComponentProps, DataAssemblyProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps } from 'contentful-management'

export type { ComponentProps, DataAssemblyProps, DesignTokenProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps }

// contentful-import only supports Release.v2 ("Releases") - a Release.v1 ("Launch") release
// is skipped and logged as an error at import time rather than sent to the API (see the
// "Importing Releases" task). ReleaseV2Props narrows contentful-management's ReleaseProps to
// that assumption.
//
// contentful-management's ReleaseProps.entities is typed as flat BaseCollection<Link<Entity>>
// (the Release.v1 shape) for all releases, but real Release.v2 API responses - both GET and
// what create/update expect - nest each item as { entity: Link<Entity>, action?: 'publish'|'unpublish' },
// matching ReleasePayloadV2['entities']. The SDK type doesn't discriminate on sys.schemaVersion,
// so it's simply wrong for v2 (confirmed against live GET/POST/PUT payloads, still broken as of
// contentful-management@12.15.0; reported upstream in contentful/contentful-management.js).
// Since we only handle v2 here, ReleaseV2Props/ReleaseV2Entities can be used directly instead of
// trusting ReleaseProps.
export type ReleaseV2Entities = ReleasePayloadV2['entities']
export type ReleaseV2Props = Omit<ReleaseProps, 'entities'> & { entities: ReleaseV2Entities }

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

// Technically, currently only ContentTypeProps, EntryProps and AssetProps are being used from this type in publishing.ts.
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
  releases?: EntityTransformed<ReleaseV2Props, any>[]
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
