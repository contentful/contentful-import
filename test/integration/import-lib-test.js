import test from 'tape'
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
      runContentfulImport({ spaceId: space.sys.id, managementToken: managementToken, contentFile: sampleSpaceFile })
        .then(() => {
          return space.delete()
            .then(t.end)
        })
    })
})
