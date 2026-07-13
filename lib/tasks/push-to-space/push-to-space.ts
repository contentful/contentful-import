import Listr from 'listr'
import verboseRenderer from 'listr-verbose-renderer'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { wrapTask } from 'contentful-batch-libs/dist/listr'
import {
  ComponentProps,
  DataAssemblyProps,
  ExperienceProps,
  ExperienceFragmentProps,
  ExperienceTemplateProps,
  UpsertComponentProps,
  UpsertExperienceTemplateProps,
  UpsertExperienceFragmentProps,
  UpsertExperienceProps,
  UpdateDataAssemblyProps,
  UpsertDesignTokenProps,
} from 'contentful-management'

import * as assets from './assets'
import * as creation from './creation'
import * as publishing from './publishing'
import type { DestinationData, TransformedSourceData, Resources, TransformedAsset } from '../../types'
import { GRAPHQL_SCHEMA_STALE_DELAYS_MS, isGraphQLSchemaStaleError } from '../../utils/graphql-schema-backoff'
import { buildDataAssemblySys } from '../../utils/exo-entity-payloads'
import sortComponents from '../../utils/sort-components'
import sortExperienceFragments from '../../utils/sort-experience-fragments'
import { filterExoEntitiesToPublish, filterExoEntitiesToUnpublish, publishExoEntity, unpublishExoEntity } from '../../utils/publish-exo-entities'
import { sortOrReport } from '../../utils/sort-or-report'
import { importExoFolders } from '../../utils/import-exo-folders'

async function withGraphQLSchemaBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= GRAPHQL_SCHEMA_STALE_DELAYS_MS.length; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isGraphQLSchemaStaleError(err) || attempt === GRAPHQL_SCHEMA_STALE_DELAYS_MS.length) {
        throw err
      }
      const delay = GRAPHQL_SCHEMA_STALE_DELAYS_MS[attempt]
      logEmitter.emit('warning', `DataAssembly GraphQL schema not yet current, retrying in ${delay}ms (attempt ${attempt + 1}/${GRAPHQL_SCHEMA_STALE_DELAYS_MS.length})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      lastErr = err
    }
  }
  throw lastErr
}

const DEFAULT_CONTENT_STRUCTURE = {
  entries: [],
  assets: [],
  contentTypes: [],
  tags: [],
  locales: [],
  webhooks: [],
  editorInterfaces: []
}

type DestinationDataById = {
  [K in keyof Resources]: Map<string, any>
}

type PushToSpaceParams = {
  destinationData: DestinationData,
  sourceData: TransformedSourceData,
  client?: any,
  spaceId: string,
  environmentId: string,
  includeExperienceOrchestration?: boolean,
  contentModelOnly?: boolean,
  skipContentModel?: boolean,
  skipContentUpdates?: boolean,
  skipLocales?: boolean,
  skipContentPublishing?: boolean,
  timeout?: number,
  retryLimit?: number,
  listrOptions?: any,
  uploadAssets?: boolean,
  skipAssetUpdates?: boolean,
  assetsDirectory?: string,
  requestQueue?: any
}

/**
 * Pushes all changes to a given space. Handles (un)publishing
 * as well as delays after creation and before publishing.
 *
 * Creates everything in the right order so that a content type for a given entry
 * is there when entry creation for that content type is attempted.
 *
 * Allows only content model or only content pushing.
 *
 * Options:
 * - sourceData: see DEFAULT_CONTENT_STRUCTURE
 * - destinationData: see DEFAULT_CONTENT_STRUCTURE
 * - client: preconfigured management API client
 * - spaceId: ID of space content is being copied to
 * - contentModelOnly: synchronizes only content types and locales
 * - skipLocales: skips locales when synchronizing the content model
 * - skipContentModel: synchronizes only entries and assets
 * - skipContentPublishing: create content but don't publish it
 * - uploadAssets: upload exported files instead of pointing to an existing URL
 * - assetsDirectory: path to exported asset files to be uploaded instead of pointing to an existing URL
 */

export type PushToSpaceContext = {
  type: string,
  target: any,
}

export default function pushToSpace({
  sourceData,
  destinationData = {},
  client,
  spaceId,
  environmentId,
  includeExperienceOrchestration,
  contentModelOnly,
  skipContentModel,
  skipContentUpdates,
  skipLocales,
  skipContentPublishing,
  timeout,
  retryLimit,
  listrOptions,
  uploadAssets,
  skipAssetUpdates,
  assetsDirectory,
  requestQueue
}: PushToSpaceParams) {
  sourceData = {
    ...DEFAULT_CONTENT_STRUCTURE,
    ...sourceData
  }
  destinationData = {
    ...DEFAULT_CONTENT_STRUCTURE,
    ...destinationData
  }

  listrOptions = listrOptions || {
    renderer: verboseRenderer
  }

  const destinationDataById: DestinationDataById = {}

  for (const [entityType, entities] of Object.entries(destinationData)) {
    const entitiesById = new Map()

    for (const entity of entities) {
      entitiesById.set(entity.sys.id, entity)
    }

    destinationDataById[entityType] = entitiesById
  }

  return new Listr([
    {
      title: 'Importing Locales',
      task: wrapTask(async (ctx) => {
        if (!destinationDataById.locales) {
          return
        }
        const locales = await creation.createLocales({
          context: { client, spaceId, environmentId, type: 'Locale' },
          entities: sourceData.locales,
          destinationEntitiesById: destinationDataById.locales,
          requestQueue
        })

        ctx.data.locales = locales
      }),
      skip: () => skipContentModel || skipLocales
    },
    {
      title: 'Importing Content Types',
      task: wrapTask(async (ctx) => {
        if (!destinationDataById.contentTypes) {
          return
        }
        const contentTypes = await creation.createEntities({
          context: { client, spaceId, environmentId, type: 'ContentType' },
          entities: sourceData.contentTypes,
          destinationEntitiesById: destinationDataById.contentTypes,
          skipUpdates: false,
          requestQueue
        })

        ctx.data.contentTypes = contentTypes
      }),
      skip: () => skipContentModel
    },
    {
      title: 'Publishing Content Types',
      task: wrapTask(async (ctx) => {
        const publishedContentTypes = await publishEntities({
          entities: ctx.data.contentTypes,
          sourceEntities: sourceData.contentTypes,
          client,
          spaceId,
          environmentId,
          requestQueue
        })
        ctx.data.contentTypes = publishedContentTypes
      }),
      skip: () => skipContentModel
    },
    {
      title: 'Importing Tags',
      task: wrapTask(async (ctx) => {
        if (sourceData.tags && destinationDataById.tags) {
          const tags = await creation.createEntities({
            context: { client, spaceId, environmentId, type: 'Tag' },
            entities: sourceData.tags,
            destinationEntitiesById: destinationDataById.tags,
            skipUpdates: false,
            requestQueue
          })
          ctx.data.tags = tags
        }
      }),
      // we remove `tags` from destination data if an error was thrown trying to access them
      // this means the user doesn't have access to this feature, skip importing tags
      skip: () => !destinationDataById.tags
    },
    {
      title: 'Importing Editor Interfaces',
      task: wrapTask(async (ctx) => {
        const allEditorInterfacesBeingFetched = ctx.data.contentTypes.map(async (contentType) => {
          if (!sourceData.editorInterfaces) {
            return
          }

          const editorInterface = sourceData.editorInterfaces.find((editorInterface) => {
            return editorInterface.sys.contentType.sys.id === contentType.sys.id
          })

          if (!editorInterface) {
            return
          }

          try {
            const ctEditorInterface = await requestQueue.add(() =>
              client.editorInterface.get({ spaceId, environmentId, contentTypeId: contentType.sys.id })
            )
            logEmitter.emit('info', `Fetched editor interface for ${contentType.name}`)

            const updatedData = {
              ...ctEditorInterface,
              controls: editorInterface.controls,
              groupControls: editorInterface.groupControls,
              editorLayout: editorInterface.editorLayout,
              sidebar: editorInterface.sidebar,
              editors: editorInterface.editors,
            }

            const updatedEditorInterface = await requestQueue.add(() =>
              client.editorInterface.update(
                { spaceId, environmentId, contentTypeId: contentType.sys.id },
                updatedData
              )
            )
            return updatedEditorInterface
          } catch (err: any) {
            err.entity = editorInterface
            logEmitter.emit('error', err)
            return null
          }
        })

        const allEditorInterfaces = await Promise.all(allEditorInterfacesBeingFetched)
        const editorInterfaces = allEditorInterfaces.filter((editorInterface) => editorInterface)

        ctx.data.editorInterfaces = editorInterfaces
      }),
      skip: (ctx) => skipContentModel || ctx.data.contentTypes.length === 0
    },
    {
      title: 'Uploading Assets',
      task: wrapTask(async (ctx) => {
        const allPendingUploads: TransformedAsset[] = []

        for (const asset of sourceData.assets) {
          for (const file of Object.values(asset.transformed.fields.file)) {
            allPendingUploads.push(requestQueue.add(async () => {
              try {
                logEmitter.emit('info', `Uploading Asset file ${file.upload}`)
                const assetStream = await assets.getAssetStreamForURL(file.upload, assetsDirectory)
                const upload = await client.upload.create(
                  { spaceId, environmentId },
                  { file: assetStream }
                )

                delete file.upload

                file.uploadFrom = {
                  sys: {
                    type: 'Link',
                    linkType: 'Upload',
                    id: upload.sys.id
                  }
                }

                return upload
              } catch (err) {
                logEmitter.emit('error', err)
              }
            }))
          }
        }

        // We call the pending uploads for the side effects
        // so we can just await all pending ones that are queued
        const uploads = await Promise.all(allPendingUploads)

        ctx.data.uploadedAssetFiles = uploads
      }),
      skip: () => !uploadAssets || !sourceData.assets.length
    },
    {
      title: 'Importing Assets',
      task: wrapTask(async (ctx) => {
        if (!destinationDataById.assets) {
          return
        }
        const assetsToProcess = await creation.createEntities({
          context: { client, spaceId, environmentId, type: 'Asset' },
          entities: sourceData.assets,
          destinationEntitiesById: destinationDataById.assets,
          skipUpdates: skipAssetUpdates,
          requestQueue
        })

        const processedAssets = await assets.processAssets({
          assets: assetsToProcess,
          client,
          spaceId,
          environmentId,
          timeout,
          retryLimit,
          requestQueue
        })
        ctx.data.assets = processedAssets
      }),
      skip: () => contentModelOnly
    },
    {
      title: 'Publishing Assets',
      task: wrapTask(async (ctx) => {
        const publishedAssets = await publishEntities({
          entities: ctx.data.assets,
          sourceEntities: sourceData.assets,
          client,
          spaceId,
          environmentId,
          requestQueue
        })
        ctx.data.publishedAssets = publishedAssets
      }),
      skip: () => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Archiving Assets',
      task: wrapTask(async (ctx) => {
        const archivedAssets = await archiveEntities({
          entities: ctx.data.assets,
          sourceEntities: sourceData.assets,
          client,
          spaceId,
          environmentId,
          requestQueue
        })
        ctx.data.archivedAssets = archivedAssets
      }),
      skip: () => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Importing Content Entries',
      task: wrapTask(async (ctx) => {
        const entries = await creation.createEntries({
          context: { client, spaceId, environmentId, skipContentModel, type: 'Entry' },
          entities: sourceData.entries,
          destinationEntitiesById: destinationDataById.entries,
          skipUpdates: skipContentUpdates,
          requestQueue
        })
        ctx.data.entries = entries
      }),
      skip: () => contentModelOnly
    },
    {
      title: 'Publishing Content Entries',
      task: wrapTask(async (ctx) => {
        const publishedEntries = await publishEntities({
          entities: ctx.data.entries,
          sourceEntities: sourceData.entries,
          client,
          spaceId,
          environmentId,
          requestQueue
        })
        ctx.data.publishedEntries = publishedEntries
      }),
      skip: () => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Archiving Entries',
      task: wrapTask(async (ctx) => {
        const archivedEntries = await archiveEntities({
          entities: ctx.data.entries,
          sourceEntities: sourceData.entries,
          client,
          spaceId,
          environmentId,
          requestQueue
        })
        ctx.data.archivedEntries = archivedEntries
      }),
      skip: () => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Creating Web Hooks',
      task: wrapTask(async (ctx) => {
        if (!sourceData.webhooks || !destinationDataById.webhooks) {
          return
        }
        const webhooks = await creation.createEntities({
          context: { client, spaceId, environmentId, type: 'Webhook' },
          entities: sourceData.webhooks,
          destinationEntitiesById: destinationDataById.webhooks,
          requestQueue
        })
        ctx.data.webhooks = webhooks
      }),
      skip: () =>
        contentModelOnly || (environmentId !== 'master' && 'Webhooks can only be imported in master environment')
    },
    {
      title: 'Create ExO Folders',
      task: wrapTask(async () => {

        try {
          const space = await client.space.get({ spaceId })
          await importExoFolders({
            client,
            organizationId: space.sys.organization.sys.id,
            destinationSpaceId: spaceId,
            sourceEntities: {
              designTokens: sourceData.designTokens,
              components: sourceData.components,
              experienceTemplates: sourceData.experienceTemplates,
              experienceFragments: sourceData.experienceFragments,
              experiences: sourceData.experiences,
            },
          })
        } catch (error) {
          logEmitter.emit('warning', `Unable to create Experience Orchestration (ExO) folders, error: ${error}`)
        }
      }),
      skip: () => !includeExperienceOrchestration
    },
    {
      title: 'Importing Data Assemblies',
      task: wrapTask(async (ctx) => {
        const results = await Promise.all((sourceData.dataAssemblies || []).map(async (entity) => {
          try {
            const existing = destinationDataById.dataAssemblies?.get(entity.sys.id)
            let result
            if (existing) {
              const payload: UpdateDataAssemblyProps = { ...omitSys(entity), sys: buildDataAssemblySys(entity, existing.sys.version) }
              result = await withGraphQLSchemaBackoff(() => client.dataAssembly.update(
                { spaceId, environmentId, dataAssemblyId: entity.sys.id },
                payload
              ))
              logEmitter.emit('info', `UPDATE DataAssembly ${entity.sys.id}`)
            } else {
              const payload: UpdateDataAssemblyProps = { ...omitSys(entity), sys: buildDataAssemblySys(entity, 0) }
              result = await withGraphQLSchemaBackoff(() => client.dataAssembly.update(
                { spaceId, environmentId, dataAssemblyId: entity.sys.id },
                payload
              ))
              logEmitter.emit('info', `CREATE DataAssembly ${entity.sys.id}`)
            }
            return result
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
            return null
          }
        }))
        ctx.data.dataAssemblies = results.filter(Boolean)
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.dataAssemblies || []).length
    },
    {
      title: 'Publishing Data Assemblies',
      task: wrapTask(async (ctx: { data: { dataAssemblies: DataAssemblyProps[], publishedDataAssemblies: DataAssemblyProps[] } }) => {
        const entitiesToPublish = filterExoEntitiesToPublish(ctx.data.dataAssemblies, sourceData.dataAssemblies || [])
        const results = await Promise.all(entitiesToPublish.map((entity) =>
          publishExoEntity<DataAssemblyProps>('DataAssembly', entity, () => client.dataAssembly.publish(
            { spaceId, environmentId, dataAssemblyId: entity.sys.id, version: entity.sys.version }
          ))
        ))
        ctx.data.publishedDataAssemblies = results.filter((entity): entity is DataAssemblyProps => entity !== null)
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.dataAssemblies || []).length
    },
    {
      title: 'Importing Design Tokens',
      task: wrapTask(async (ctx) => {
        const results = await Promise.all((sourceData.designTokens || []).map(async (entity) => {
          try {
            const existing = destinationDataById.designTokens?.get(entity.sys.id)
            if (existing) {
              const payload: UpsertDesignTokenProps = { ...entity, sys: { id: entity.sys.id, type: 'DesignToken', version: existing.sys.version } }
              const result = await client.designToken.upsert({ spaceId, environmentId, designTokenId: entity.sys.id }, payload)
              logEmitter.emit('info', `UPDATE DesignToken ${entity.sys.id}`)
              return result
            } else {
              const payload: UpsertDesignTokenProps = { ...omitSys(entity), sys: { id: entity.sys.id, type: 'DesignToken' } }
              const result = await client.designToken.upsert({ spaceId, environmentId, designTokenId: entity.sys.id }, payload)
              logEmitter.emit('info', `CREATE DesignToken ${entity.sys.id}`)
              return result
            }
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
            return null
          }
        }))
        ctx.data.designTokens = results.filter(Boolean)
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.designTokens || []).length
    },
    {
      title: 'Importing Components',
      task: wrapTask(async (ctx) => {
        const sorted = sortOrReport(() => sortComponents(sourceData.components || []))
        const results: any[] = []
        for (const entity of sorted) {
          try {
            const existing = destinationDataById.components?.get(entity.sys.id)
            if (existing) {
              const payload: UpsertComponentProps = { ...entity, sys: { id: entity.sys.id, type: 'Component', version: existing.sys.version } }
              const result = await client.component.upsert({ spaceId, environmentId, componentId: entity.sys.id }, payload)
              logEmitter.emit('info', `UPDATE Component ${entity.sys.id}`)
              results.push(result)
            } else {
              const payload: UpsertComponentProps = { ...omitSys(entity), sys: { id: entity.sys.id, type: 'Component' } }
              const result = await client.component.upsert({ spaceId, environmentId, componentId: entity.sys.id }, payload)
              logEmitter.emit('info', `CREATE Component ${entity.sys.id}`)
              results.push(result)
            }
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
          }
        }
        ctx.data.components = results
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.components || []).length
    },
    {
      title: 'Publishing Components',
      task: wrapTask(async (ctx) => {
        const entitiesToPublish = filterExoEntitiesToPublish(ctx.data.components, sourceData.components || [])
        // Sorted and sequential: a Component's publish validation resolves nested
        // Component/DataAssembly references against their *published* state, so a
        // parent can't publish before the Components it embeds are published.
        const sorted = sortOrReport(() => sortComponents(entitiesToPublish))
        const results: ComponentProps[] = []
        for (const entity of sorted) {
          const published = await publishExoEntity<ComponentProps>('Component', entity, () => client.component.publish(
            { spaceId, environmentId, componentId: entity.sys.id, version: entity.sys.version }
          ))
          if (published) results.push(published)
        }
        ctx.data.publishedComponents = results
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.components || []).length
    },
    {
      title: 'Importing Experience Templates',
      task: wrapTask(async (ctx) => {
        const results = await Promise.all((sourceData.experienceTemplates || []).map(async (entity) => {
          try {
            const existing = destinationDataById.experienceTemplates?.get(entity.sys.id)
            if (existing) {
              const payload: UpsertExperienceTemplateProps = { ...entity, sys: { id: entity.sys.id, type: 'ExperienceTemplate', version: existing.sys.version } }
              const result = await client.experienceTemplate.upsert({ spaceId, environmentId, experienceTemplateId: entity.sys.id }, payload)
              logEmitter.emit('info', `UPDATE ExperienceTemplate ${entity.sys.id}`)
              return result
            } else {
              const payload: UpsertExperienceTemplateProps = { ...omitSys(entity), sys: { id: entity.sys.id, type: 'ExperienceTemplate' } }
              const result = await client.experienceTemplate.upsert({ spaceId, environmentId, experienceTemplateId: entity.sys.id }, payload)
              logEmitter.emit('info', `CREATE ExperienceTemplate ${entity.sys.id}`)
              return result
            }
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
            return null
          }
        }))
        ctx.data.experienceTemplates = results.filter(Boolean)
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.experienceTemplates || []).length
    },
    {
      title: 'Publishing Experience Templates',
      task: wrapTask(async (ctx: { data: { experienceTemplates: ExperienceTemplateProps[], publishedExperienceTemplates: ExperienceTemplateProps[] } }) => {
        const entitiesToPublish = filterExoEntitiesToPublish(ctx.data.experienceTemplates, sourceData.experienceTemplates || [])
        const results = await Promise.all(entitiesToPublish.map((entity) =>
          publishExoEntity<ExperienceTemplateProps>('ExperienceTemplate', entity, () => client.experienceTemplate.publish(
            { spaceId, environmentId, experienceTemplateId: entity.sys.id, version: entity.sys.version }
          ))
        ))
        ctx.data.publishedExperienceTemplates = results.filter((entity): entity is ExperienceTemplateProps => entity !== null)
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experienceTemplates || []).length
    },
    {
      title: 'Importing Experience Fragments',
      task: wrapTask(async (ctx) => {
        const sorted = sortOrReport(() => sortExperienceFragments(sourceData.experienceFragments || []))
        const results: any[] = []
        for (const entity of sorted) {
          try {
            const existing = destinationDataById.experienceFragments?.get(entity.sys.id)
            if (existing) {
              // once an ExperienceFragment is created, its component cannot be changed to a different component -
              // the API rejects `component` on UPDATE even when the value is unchanged, so omit it entirely
              const payload: UpsertExperienceFragmentProps = { ...entity, sys: { id: entity.sys.id, type: 'ExperienceFragment', version: existing.sys.version } }
              const result = await client.experienceFragment.upsert({ spaceId, environmentId, experienceFragmentId: entity.sys.id }, payload)
              logEmitter.emit('info', `UPDATE ExperienceFragment ${entity.sys.id}`)
              results.push(result)
            } else {
              const payload: UpsertExperienceFragmentProps = { ...omitSys(entity), component: entity.sys.component, sys: { id: entity.sys.id, type: 'ExperienceFragment' } }
              const result = await client.experienceFragment.upsert({ spaceId, environmentId, experienceFragmentId: entity.sys.id }, payload)
              logEmitter.emit('info', `CREATE ExperienceFragment ${entity.sys.id}`)
              results.push(result)
            }
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
          }
        }
        ctx.data.experienceFragments = results
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.experienceFragments || []).length
    },
    {
      title: 'Publishing Experience Fragments',
      task: wrapTask(async (ctx) => {
        const entitiesToPublish = filterExoEntitiesToPublish(ctx.data.experienceFragments, sourceData.experienceFragments || [])
        // Sorted and sequential, same reasoning as Publishing Components: an ExperienceFragment
        // can reference other ExperienceFragments in its slots, resolved against published state.
        const sorted = sortOrReport(() => sortExperienceFragments(entitiesToPublish))
        const results: ExperienceFragmentProps[] = []
        for (const entity of sorted) {
          const published = await publishExoEntity<ExperienceFragmentProps>('ExperienceFragment', entity, () => client.experienceFragment.publish(
            { spaceId, environmentId, experienceFragmentId: entity.sys.id, version: entity.sys.version }
          ))
          if (published) results.push(published)
        }
        ctx.data.publishedExperienceFragments = results
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experienceFragments || []).length
    },
    {
      title: 'Importing Experiences',
      task: wrapTask(async (ctx) => {
        const results = await Promise.all((sourceData.experiences || []).map(async (entity) => {
          try {
            const existing = destinationDataById.experiences?.get(entity.sys.id)
            if (existing) {
              // once an Experience is created, its experienceTemplate cannot be changed to a different experienceTemplate -
              // the API rejects `experienceTemplate` on UPDATE even when the value is unchanged, so omit it entirely
              const payload: UpsertExperienceProps = { ...entity, sys: { id: entity.sys.id, type: 'Experience', version: existing.sys.version } }
              const result = await client.experience.upsert({ spaceId, environmentId, experienceId: entity.sys.id }, payload)
              logEmitter.emit('info', `UPDATE Experience ${entity.sys.id}`)
              return result
            } else {
              const payload: UpsertExperienceProps = { ...omitSys(entity), experienceTemplate: entity.sys.experienceTemplate, sys: { id: entity.sys.id, type: 'Experience' } }
              const result = await client.experience.upsert({ spaceId, environmentId, experienceId: entity.sys.id }, payload)
              logEmitter.emit('info', `CREATE Experience ${entity.sys.id}`)
              return result
            }
          } catch (err: any) {
            err.entity = entity
            logEmitter.emit('error', err)
            return null
          }
        }))
        ctx.data.experiences = results.filter(Boolean)
      }),
      skip: () => !includeExperienceOrchestration || !(sourceData.experiences || []).length
    },
    {
      title: 'Publishing Experiences',
      task: wrapTask(async (ctx: { data: { experiences: ExperienceProps[], publishedExperiences: ExperienceProps[] } }) => {
        const entitiesToPublish = filterExoEntitiesToPublish(ctx.data.experiences, sourceData.experiences || [])
        const results = await Promise.all(entitiesToPublish.map((entity) =>
          publishExoEntity<ExperienceProps>('Experience', entity, () => client.experience.publish(
            { spaceId, environmentId, experienceId: entity.sys.id, version: entity.sys.version }
          ))
        ))
        ctx.data.publishedExperiences = results.filter((entity): entity is ExperienceProps => entity !== null)
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experiences || []).length
    },
    // Unpublishing runs after all Importing/Publishing tasks, in reverse dependency order
    // (Experience first, DataAssembly last) - the API rejects unpublishing an entity that a
    // still-published parent references, so parents must unpublish before the children they embed.
    {
      title: 'Unpublishing Experiences',
      task: wrapTask(async (ctx: { data: { experiences: ExperienceProps[] } }) => {
        const entitiesToUnpublish = filterExoEntitiesToUnpublish(ctx.data.experiences, sourceData.experiences || [])
        await Promise.all(entitiesToUnpublish.map((entity) =>
          unpublishExoEntity<ExperienceProps>('Experience', entity, () => client.experience.unpublish(
            { spaceId, environmentId, experienceId: entity.sys.id, version: entity.sys.version }
          ))
        ))
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experiences || []).length
    },
    {
      title: 'Unpublishing Experience Fragments',
      task: wrapTask(async (ctx) => {
        const entitiesToUnpublish = filterExoEntitiesToUnpublish(ctx.data.experienceFragments, sourceData.experienceFragments || [])
        // Sorted and sequential, reverse of Publishing Experience Fragments: the API rejects
        // unpublishing a fragment that a still-published parent references, so ancestors must
        // unpublish first.
        const sorted = sortExperienceFragments(entitiesToUnpublish).reverse()
        for (const entity of sorted) {
          await unpublishExoEntity<ExperienceFragmentProps>('ExperienceFragment', entity, () => client.experienceFragment.unpublish(
            { spaceId, environmentId, experienceFragmentId: entity.sys.id, version: entity.sys.version }
          ))
        }
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experienceFragments || []).length
    },
    {
      title: 'Unpublishing Experience Templates',
      task: wrapTask(async (ctx: { data: { experienceTemplates: ExperienceTemplateProps[] } }) => {
        const entitiesToUnpublish = filterExoEntitiesToUnpublish(ctx.data.experienceTemplates, sourceData.experienceTemplates || [])
        await Promise.all(entitiesToUnpublish.map((entity) =>
          unpublishExoEntity<ExperienceTemplateProps>('ExperienceTemplate', entity, () => client.experienceTemplate.unpublish(
            { spaceId, environmentId, experienceTemplateId: entity.sys.id, version: entity.sys.version }
          ))
        ))
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.experienceTemplates || []).length
    },
    {
      title: 'Unpublishing Components',
      task: wrapTask(async (ctx) => {
        const entitiesToUnpublish = filterExoEntitiesToUnpublish(ctx.data.components, sourceData.components || [])
        // Sorted and sequential, reverse of Publishing Components: the API rejects unpublishing
        // a Component that a still-published parent references, so ancestors must unpublish first.
        const sorted = sortComponents(entitiesToUnpublish).reverse()
        for (const entity of sorted) {
          await unpublishExoEntity<ComponentProps>('Component', entity, () => client.component.unpublish(
            { spaceId, environmentId, componentId: entity.sys.id, version: entity.sys.version }
          ))
        }
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.components || []).length
    },
    {
      title: 'Unpublishing Data Assemblies',
      task: wrapTask(async (ctx: { data: { dataAssemblies: DataAssemblyProps[] } }) => {
        const entitiesToUnpublish = filterExoEntitiesToUnpublish(ctx.data.dataAssemblies, sourceData.dataAssemblies || [])
        await Promise.all(entitiesToUnpublish.map((entity) =>
          unpublishExoEntity<DataAssemblyProps>('DataAssembly', entity, () => client.dataAssembly.unpublish(
            { spaceId, environmentId, dataAssemblyId: entity.sys.id, version: entity.sys.version }
          ))
        ))
      }),
      skip: () => !includeExperienceOrchestration || skipContentPublishing || !(sourceData.dataAssemblies || []).length
    }
  ], listrOptions)
}

function omitSys(entity) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sys: _sys, ...rest } = entity
  return rest
}

// function archiveEntities({ entities, sourceEntities, requestQueue }) {
function archiveEntities({ entities, sourceEntities, client, spaceId, environmentId, requestQueue }) {
  const entityIdsToArchive = sourceEntities
    .filter(({ original }) => original.sys.archivedVersion)
    .map(({ original }) => original.sys.id)

  const entitiesToArchive = entities
    .filter((entity) => entityIdsToArchive.indexOf(entity.sys.id) !== -1)

  return publishing.archiveEntities({ entities: entitiesToArchive, client, spaceId, environmentId, requestQueue })
}

// function publishEntities({ entities, sourceEntities, requestQueue }) {
function publishEntities({ entities, sourceEntities, client, spaceId, environmentId, requestQueue }) {
  // Find all entities in source content which are published
  const entityIdsToPublish = sourceEntities
    .filter(({ original }) => original.sys.publishedVersion)
    .map(({ original }) => original.sys.id)

  // Filter imported entities and publish only these who got published in the source
  const entitiesToPublish = entities
    .filter((entity) => entityIdsToPublish.indexOf(entity.sys.id) !== -1)

  return publishing.publishEntities({ entities: entitiesToPublish, client, spaceId, environmentId, requestQueue })
}
