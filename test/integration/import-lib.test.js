import { join } from 'path'

import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/index'

const managementToken = process.env.MANAGEMENT_TOKEN
const orgId = process.env.ORG_ID
const simpleSampleSpaceFile = join(__dirname, 'exports/simple/sample-space.json')
const withAssetsSpaceFile = join(__dirname, 'exports/with-assets/space-with-downloaded-assets.json')
const assetsDirectory = join(__dirname, 'exports/with-assets')

let space

jest.setTimeout(1.5 * 60 * 1000) // 1.5min timeout

beforeEach(async () => {
  const client = createClient({ accessToken: managementToken })
  space = await client.createSpace({ name: 'temp contentful-import space' }, orgId)
})

afterEach(async () => {
  await space.delete()
})

test('It should import a space properly when used as a lib', () => {
  console.log(`Created temporary space ${space.sys.id} to test importing as lib`)
  return runContentfulImport({
    spaceId: space.sys.id,
    managementToken,
    contentFile: simpleSampleSpaceFile,
    useVerboseRenderer: true
  })
    .catch((multierror) => {
    // only fail on relevant errors
      const failedPublishErrors = multierror.errors.filter((error) => {
        if (!error.hasOwnProperty('error')) {
          return false
        }

        if (typeof error.error === 'string' && error.error.indexOf('Could not publish the following entities') !== -1) {
          return false
        }

        if ('message' in error.error && error.error.message === 'Asset is taking longer then expected to process') {
          return false
        }

        return true
      })
      expect(failedPublishErrors).toHaveLength(0)
      return space.delete()
    })
})

test('It should import a space with assets properly when used as a lib', () => {
  console.log(`Created temporary space ${space.sys.id} to test importing as lib`)
  return runContentfulImport({
    spaceId: space.sys.id,
    managementToken,
    contentFile: withAssetsSpaceFile,
    uploadAssets: true,
    assetsDirectory,
    useVerboseRenderer: true
  })
    .catch((multierror) => {
    // only fail on relevant errors
      const failedPublishErrors = multierror.errors.filter((error) => {
        if (!error.hasOwnProperty('error')) {
          return false
        }

        if (typeof error.error === 'string' && error.error.indexOf('Could not publish the following entities') !== -1) {
          return false
        }

        if ('message' in error.error && error.error.message === 'Asset is taking longer then expected to process') {
          return false
        }

        return true
      })
      expect(failedPublishErrors).toHaveLength(0)
      return space.delete()
    })
})
