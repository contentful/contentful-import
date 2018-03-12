import { resolve } from 'path'

import nixt from 'nixt'
import { createClient } from 'contentful-management'

const bin = resolve(__dirname, '..', '..', 'bin')
const app = () => {
  return nixt({ newlines: true }).cwd(bin).base('./contentful-import').clone()
}

const managementToken = process.env.MANAGEMENT_TOKEN
const orgId = process.env.ORG_ID
let spaceHandle

jest.setTimeout(1.5 * 60 * 1000) // 1.5min timeout

afterAll(() => {
  return spaceHandle.delete()
})

test('It should import space properly when running as a cli', (done) => {
  const client = createClient({accessToken: managementToken})
  client.createSpace({name: 'temp contentful-import space'}, orgId)
    .then((space) => {
      console.log(`Created temporary space ${space.sys.id} to test importing via CLI`)
      spaceHandle = space
      app()
        .run(` --space-id ${space.sys.id} --management-token ${managementToken} --content-file ${resolve(__dirname, 'sample-space.json')}`)
        .code(0)
        .expect(result => {
          if (result.stderr.length) {
            console.log(result.stdout)
            console.log(result.stderr)
            throw new Error('Should not have stderr output.')
          }
        })
        .end(error => {
          expect(error).toBeUndefined()
          done()
        })
    })
})
