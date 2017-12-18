import test from 'blue-tape'
import runContentfulImport from '../../dist/index'
import { createClient } from 'contentful-management'
import { join } from 'path'
const managementToken = process.env.MANAGEMENT_TOKEN
const orgId = process.env.ORG_ID
const sampleSpaceFile = join(__dirname, 'sample-space.json')

test('It should import a space properly when used as a lib', (t) => {
  const client = createClient({ accessToken: managementToken })
  return client.createSpace({name: 'temp contentful-import space'}, orgId)
    .then((space) => {
      runContentfulImport({
        spaceId: space.sys.id,
        managementToken,
        contentFile: sampleSpaceFile,
        useVerboseRenderer: true
      })
        .catch((multierror) => {
          const failedPublishErrors = multierror.errors.filter((error) => error.hasOwnProperty('error') && error.error.message.indexOf('Could not publish the following entities') !== -1)
          t.equals(failedPublishErrors.length, 0, 'Is able to publish all entities and does NOT display the failed queue message')
          return space.delete()
        })
        .then(() => {
          t.pass('Finished import as a lib')
          return space.delete()
        })
    })
})
