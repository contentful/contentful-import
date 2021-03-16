import fs from 'fs'
import { promisify } from 'util'
import { join } from 'path'

import Promise from 'bluebird'
import Listr from 'listr'
import verboseRenderer from 'listr-verbose-renderer'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { wrapTask } from 'contentful-batch-libs/dist/listr'

import * as assets from './assets'
import * as creation from './creation'
import * as publishing from './publishing'

const stat = promisify(fs.stat)

const DEFAULT_CONTENT_STRUCTURE = {
  entries: [],
  assets: [],
  contentTypes: [],
  tags: [],
  locales: [],
  webhooks: [],
  editorInterfaces: []
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
 * - prePublishDelay: milliseconds wait before publishing
 * - contentModelOnly: synchronizes only content types and locales
 * - skipLocales: skips locales when synchronizing the content model
 * - skipContentModel: synchronizes only entries and assets
 * - skipContentPublishing: create content but don't publish it
 * - uploadAssets: upload exported files instead of pointing to an existing URL
 * - assetsDirectory: path to exported asset files to be uploaded instead of pointing to an existing URL
 */

export default function pushToSpace ({
  sourceData,
  destinationData = {},
  client,
  spaceId,
  environmentId,
  prePublishDelay,
  contentModelOnly,
  skipContentModel,
  skipLocales,
  skipContentPublishing,
  timeout,
  retryLimit,
  listrOptions,
  uploadAssets,
  assetsDirectory
}) {
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

  const getAssetStreamForURL = async (url) => {
    const [, assetPath] = url.split('//')
    const filePath = join(assetsDirectory, assetPath)
    try {
      await stat(filePath)
      return fs.createReadStream(filePath)
    } catch (err) {
      const error = new Error('Cannot open asset from filesystem')
      error.filePath = filePath
      throw error
    }
  }

  return new Listr([
    {
      title: 'Connecting to space',
      task: wrapTask(async (ctx, task) => {
        const space = await client.getSpace(spaceId)
        const environment = await space.getEnvironment(environmentId)

        ctx.space = space
        ctx.environment = environment
      })
    },
    {
      title: 'Importing Locales',
      task: wrapTask(async (ctx, task) => {
        const locales = await creation.createLocales(
          { target: ctx.environment, type: 'Locale' },
          sourceData.locales,
          destinationData.locales
        )

        ctx.data.locales = locales
      }),
      skip: () => skipContentModel || skipLocales
    },
    {
      title: 'Importing Content Types',
      task: wrapTask(async (ctx, task) => {
        const allContentTypes = await creation.createEntities(
          { target: ctx.environment, type: 'ContentType' },
          sourceData.contentTypes,
          destinationData.contentTypes
        )

        const contentTypes = removeEmptyEntities(allContentTypes)

        ctx.data.contentTypes = contentTypes

        if (contentTypes.length < 5) {
          await Promise.delay(prePublishDelay)
        }
      }),
      skip: () => skipContentModel
    },
    {
      title: 'Publishing Content Types',
      task: wrapTask(async (ctx, task) => {
        const allPublishedContentTypes = await publishEntities(
          ctx,
          task,
          ctx.data.contentTypes,
          sourceData.contentTypes
        )
        const publishedContentTypes = removeEmptyEntities(allPublishedContentTypes)
        ctx.data.contentTypes = publishedContentTypes
      }),
      skip: (ctx) => skipContentModel
    },
    {
      title: 'Importing Tags',
      task: wrapTask(async (ctx, task) => {
        const allTags = await creation.createEntities(
          { target: ctx.environment, type: 'Tag' },
          sourceData.tags,
          destinationData.tags
        )
        const tags = removeEmptyEntities(allTags)
        ctx.data.tags = tags
      }),
      // we remove `tags` from destination data if an error was thrown trying to access them
      // this means the user doesn't have access to this feature, skip importing tags
      skip: () => !destinationData.tags
    },
    {
      title: 'Importing Editor Interfaces',
      task: wrapTask(async (ctx, task) => {
        const allEditorInterfacesBeingFetched = ctx.data.contentTypes.map(async (contentType) => {
          const editorInterface = sourceData.editorInterfaces.find((editorInterface) => {
            return editorInterface.sys.contentType.sys.id === contentType.sys.id
          })

          if (!editorInterface) {
            return Promise.resolve()
          }

          try {
            const ctEditorInterface = await ctx.environment.getEditorInterfaceForContentType(contentType.sys.id)
            logEmitter.emit('info', `Fetched editor interface for ${contentType.name}`)
            ctEditorInterface.controls = editorInterface.controls
            const updatedEditorInterface = await ctEditorInterface.update()
            return updatedEditorInterface
          } catch (err) {
            err.entity = editorInterface
            throw err
          }
        })

        const allEditorInterfaces = await Promise.all(allEditorInterfacesBeingFetched)
        const editorInterfaces = removeEmptyEntities(allEditorInterfaces)

        ctx.data.editorInterfaces = editorInterfaces
      }),
      skip: (ctx) => skipContentModel || ctx.data.contentTypes.length === 0
    },
    {
      title: 'Uploading Assets',
      task: wrapTask(async (ctx, task) => {
        for (const asset of sourceData.assets) {
          for (const file of Object.values(asset.transformed.fields.file)) {
            try {
              logEmitter.emit('info', `Uploading Asset file ${file.upload}`)
              const assetStream = await getAssetStreamForURL(file.upload)
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
            } catch (err) {
              logEmitter.emit('error', err)
            }
          }
        }
      }),
      skip: (ctx) => !uploadAssets || !sourceData.assets.length
    },
    {
      title: 'Importing Assets',
      task: wrapTask(async (ctx, task) => {
        const allAssets = await creation.createEntities(
          { target: ctx.environment, type: 'Asset' },
          sourceData.assets,
          destinationData.assets
        )
        const assetsToProcess = removeEmptyEntities(allAssets)

        const allProcessedAssets = await assets.processAssets(assetsToProcess, {
          timeout,
          retryLimit
        })
        const processedAssets = removeEmptyEntities(allProcessedAssets)
        ctx.data.assets = processedAssets

        if (processedAssets.length < 5) {
          await Promise.delay(prePublishDelay)
        }
      }),
      skip: (ctx) => contentModelOnly
    },
    {
      title: 'Publishing Assets',
      task: wrapTask(async (ctx, task) => {
        const allPublishedAssets = await publishEntities(ctx, task, ctx.data.assets, sourceData.assets)
        const publishedAssets = removeEmptyEntities(allPublishedAssets)
        ctx.data.publishedAssets = publishedAssets
      }),
      skip: (ctx) => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Archiving Assets',
      task: wrapTask(async (ctx, task) => {
        const allArchivedAssets = await archiveEntities(ctx, task, ctx.data.assets, sourceData.assets)
        const archivedAssets = removeEmptyEntities(allArchivedAssets)
        ctx.data.archivedAssets = archivedAssets
      }),
      skip: (ctx) => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Importing Content Entries',
      task: wrapTask(async (ctx, task) => {
        const allEntries = await creation.createEntries(
          { target: ctx.environment, skipContentModel },
          sourceData.entries,
          destinationData.entries
        )
        const entries = removeEmptyEntities(allEntries)
        ctx.data.entries = entries

        if (entries.length < 5) {
          await Promise.delay(prePublishDelay)
        }
      }),
      skip: (ctx) => contentModelOnly
    },
    {
      title: 'Publishing Content Entries',
      task: wrapTask(async (ctx, task) => {
        const allPublishedEntries = await publishEntities(ctx, task, ctx.data.entries, sourceData.entries)
        const publishedEntries = removeEmptyEntities(allPublishedEntries)
        ctx.data.publishedEntries = publishedEntries
      }),
      skip: (ctx) => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Archiving Entries',
      task: wrapTask(async (ctx, task) => {
        const allArchivedEntries = await archiveEntities(ctx, task, ctx.data.entries, sourceData.entries)
        const archivedEntries = removeEmptyEntities(allArchivedEntries)
        ctx.data.archivedEntries = archivedEntries
      }),
      skip: (ctx) => contentModelOnly || skipContentPublishing
    },
    {
      title: 'Creating Web Hooks',
      task: wrapTask(async (ctx, task) => {
        const allWebhooks = await creation.createEntities(
          { target: ctx.space, type: 'Webhook' },
          sourceData.webhooks,
          destinationData.webhooks
        )
        const webhooks = removeEmptyEntities(allWebhooks)
        ctx.data.webhooks = webhooks
      }),
      skip: (ctx) =>
        contentModelOnly || (environmentId !== 'master' && 'Webhooks can only be imported in master environment')
    }
  ], listrOptions)
}

// In case some entity throws an error, we null it in the list to avoid further processing.
// This functions removes the nulled entities from the lists.
function removeEmptyEntities (entityList) {
  return entityList.filter((entity) => !!entity && entity.sys)
}

function archiveEntities (ctx, task, entities, sourceEntities) {
  const entityIdsToArchive = sourceEntities
    .filter(({original}) => original.sys.archivedVersion)
    .map(({original}) => original.sys.id)

  const entitiesToArchive = entities
    .filter((entity) => entityIdsToArchive.indexOf(entity.sys.id) !== -1)

  return publishing.archiveEntities(entitiesToArchive)
}

function publishEntities (ctx, task, entities, sourceEntities) {
  // Find all entities in source content which are published
  const entityIdsToPublish = sourceEntities
    .filter(({original}) => original.sys.publishedVersion)
    .map(({original}) => original.sys.id)

  // Filter imported entities and publish only these who got published in the source
  const entitiesToPublish = entities
    .filter((entity) => entityIdsToPublish.indexOf(entity.sys.id) !== -1)

  return publishing.publishEntities(entitiesToPublish)
}
