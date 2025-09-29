import Listr from 'listr'
import verboseRenderer from 'listr-verbose-renderer'

import { logEmitter, wrapTask } from 'contentful-batch-libs'

import * as assets from './assets'
import * as creation from './creation'
import * as publishing from './publishing'
import type { DestinationData, TransformedSourceData, Resources, TransformedAsset } from '../../types'
import { ContentfulEntityError } from '../../utils/errors'

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
  client: any,
  spaceId: string,
  environmentId: string,
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

export default function pushToSpace ({
  sourceData,
  destinationData = {},
  client,
  spaceId,
  environmentId,
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
      title: 'Connecting to space',
      task: wrapTask(async (ctx) => {
        const space = await client.getSpace(spaceId)
        const environment = await space.getEnvironment(environmentId)

        ctx.space = space
        ctx.environment = environment
      })
    },
    {
      title: 'Importing Locales',
      task: wrapTask(async (ctx) => {
        if (!destinationDataById.locales) {
          return
        }
        const locales = await creation.createLocales({
          context: { target: ctx.environment, type: 'Locale' },
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
          context: { target: ctx.environment, type: 'ContentType' },
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
            context: { target: ctx.environment, type: 'Tag' },
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
            const ctEditorInterface = await requestQueue.add(() => ctx.environment.getEditorInterfaceForContentType(contentType.sys.id))
            logEmitter.emit('info', `Fetched editor interface for ${contentType.name}`)
            ctEditorInterface.controls = editorInterface.controls
            ctEditorInterface.groupControls = editorInterface.groupControls
            ctEditorInterface.editorLayout = editorInterface.editorLayout
            ctEditorInterface.sidebar = editorInterface.sidebar
            ctEditorInterface.editors = editorInterface.editors

            const updatedEditorInterface = await requestQueue.add(() => ctEditorInterface.update())
            return updatedEditorInterface
          } catch (err: any) {
            if (err instanceof ContentfulEntityError) {
              err.entity = editorInterface
            }
            throw err
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
                const upload = await ctx.environment.createUpload({
                  fileName: asset.transformed.sys.id,
                  file: assetStream
                })

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
          context: { target: ctx.environment, type: 'Asset' },
          entities: sourceData.assets,
          destinationEntitiesById: destinationDataById.assets,
          skipUpdates: skipAssetUpdates,
          requestQueue
        })

        const processedAssets = await assets.processAssets({
          assets: assetsToProcess,
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
          context: { target: ctx.environment, skipContentModel },
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
          context: { target: ctx.space, type: 'Webhook' },
          entities: sourceData.webhooks,
          destinationEntitiesById: destinationDataById.webhooks,
          requestQueue
        })
        ctx.data.webhooks = webhooks
      }),
      skip: () =>
        contentModelOnly || (environmentId !== 'master' && 'Webhooks can only be imported in master environment')
    }
  ], listrOptions)
}

function archiveEntities ({ entities, sourceEntities, requestQueue }) {
  const entityIdsToArchive = sourceEntities
    .filter(({ original }) => original.sys.archivedVersion)
    .map(({ original }) => original.sys.id)

  const entitiesToArchive = entities
    .filter((entity) => entityIdsToArchive.indexOf(entity.sys.id) !== -1)

  return publishing.archiveEntities({ entities: entitiesToArchive, requestQueue })
}

function publishEntities ({ entities, sourceEntities, requestQueue }) {
  // Find all entities in source content which are published
  const entityIdsToPublish = sourceEntities
    .filter(({ original }) => original.sys.publishedVersion)
    .map(({ original }) => original.sys.id)

  // Filter imported entities and publish only these who got published in the source
  const entitiesToPublish = entities
    .filter((entity) => entityIdsToPublish.indexOf(entity.sys.id) !== -1)

  return publishing.publishEntities({ entities: entitiesToPublish, requestQueue })
}
