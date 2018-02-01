import { join } from 'path'

import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/index'

const managementToken = process.env.MANAGEMENT_TOKEN
const orgId = process.env.ORG_ID
const sampleSpaceFile = join(__dirname, 'sample-space.json')

let spaceHandle

jest.setTimeout(1.5 * 60 * 1000) // 1.5min timeout

afterAll(() => {
  return spaceHandle.delete()
})

test('It should import a space properly when used as a lib', () => {
  const client = createClient({ accessToken: managementToken })
  return client.createSpace({name: 'temp contentful-import space'}, orgId)
    .then((space) => {
      console.log(`Created temporary space ${space.sys.id} to test importing as lib`)
      spaceHandle = space
      return runContentfulImport({
        spaceId: space.sys.id,
        managementToken,
        contentFile: sampleSpaceFile,
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
        .then(() => {
          return space.delete()
        })
    })
})
