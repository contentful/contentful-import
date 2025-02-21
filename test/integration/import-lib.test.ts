import { join } from 'path'

import 'dotenv/config'
import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/lib/index'

const managementToken = process.env.MANAGEMENT_TOKEN as string
const orgId = process.env.ORG_ID as string
const simpleSampleSpaceFile = join(__dirname, 'exports/simple/sample-space.json')
const customEditorInterfaceFile = join(__dirname, 'exports/with-custom-editor-interface/custom-editor-interface.json')
const withAssetsSpaceFile = join(__dirname, 'exports/with-assets/space-with-downloaded-assets.json')
const assetsDirectory = join(__dirname, 'exports/with-assets')

let space

type Error = {
    errors: {
        error: string | {
            message: string
        }
    }[]
}

const timeout = 1.5 * 60 * 1000 // 1.5min timeout

beforeEach(async () => {
  const client = createClient({ accessToken: managementToken })
  space = await client.createSpace({ name: 'IMPORT [AUTO] TOOL TMP' }, orgId)
})

afterEach(async () => {
  if (space) {
    await space.delete()
  }
})

test('It should import a space properly when used as a lib', async () => {
  console.log(`Created temporary space ${space.sys.id} to test importing as lib`)

  const wrappedFunc = async () => {
    await runContentfulImport({
      spaceId: space.sys.id,
      managementToken,
      contentFile: simpleSampleSpaceFile,
      useVerboseRenderer: true
    })
  }

  let err: Error = { errors: [] }
  await wrappedFunc()
    .catch(e => {
      err = e
    })

  const failedPublishErrors = err.errors.filter((error) => {
    if (!Object.prototype.hasOwnProperty.call(error, 'error')) {
      return false
    }

    if (typeof error.error === 'string' && error.error.indexOf('Could not publish the following entities') !== -1) {
      return false
    }

    if (typeof error.error === 'object' && error.error.message && error.error.message === 'Asset is taking longer then expected to process') {
      return false
    }

    return true
  })
  expect(failedPublishErrors).toHaveLength(0)

  await space.delete()
  // Ensures that there is no deletion attempt in the afterEach function if the
  // deletion had been successful
  space = undefined
}, timeout)

test('It should import a space with assets properly when used as a lib', async () => {
  console.log(`Created temporary space ${space.sys.id} to test importing as lib`)

  const wrappedFunc = async () => {
    await runContentfulImport({
      spaceId: space.sys.id,
      managementToken,
      contentFile: withAssetsSpaceFile,
      uploadAssets: true,
      assetsDirectory,
      useVerboseRenderer: true
    })
  }

  let err: Error = { errors: [] }
  await wrappedFunc()
    .catch(e => {
      err = e
    })

  // only fail on relevant errors
  const failedPublishErrors = err.errors.filter((error) => {
    if (!Object.prototype.hasOwnProperty.call(error, 'error')) {
      return false
    }

    if (typeof error.error === 'string' && error.error.indexOf('Could not publish the following entities') !== -1) {
      return false
    }

    if (typeof error.error === 'object' && error.error.message && error.error.message === 'Asset is taking longer then expected to process') {
      return false
    }

    return true
  })
  expect(failedPublishErrors).toHaveLength(0)
  await space.delete()
  // Ensures that there is no deletion attempt in the afterEach function if the
  // deletion had been successful
  space = undefined
}, timeout)

test('It should import a space with custom editor interfaces properly when used as a lib', async () => {
  console.log(`Created temporary space ${space.sys.id} to test importing as lib`)

  const wrappedFunc = async () => {
    await runContentfulImport({
      spaceId: space.sys.id,
      managementToken,
      contentFile: customEditorInterfaceFile,
      useVerboseRenderer: true
    })
  }

  await wrappedFunc()

  const localClient = createClient({ accessToken: managementToken }, { type: 'plain' })
  const editorInterfaces = await localClient.editorInterface.getMany({
    spaceId: space.sys.id,
    environmentId: 'master'
  })

  expect(editorInterfaces.items).toHaveLength(1)
  expect(editorInterfaces.items[0].sidebar).toHaveLength(1)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  expect(editorInterfaces.items[0].sidebar[0]).toEqual({
    settings: {},
    widgetId: 'custom-app-sidebar-widget-id',
    widgetNamespace: 'app'
  })

  await space.delete()
  // Ensures that there is no deletion attempt in the afterEach function if the
  // deletion had been successful
  space = undefined
}, timeout)
