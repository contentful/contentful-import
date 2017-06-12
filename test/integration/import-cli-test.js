import test from 'tape'
import nixt from 'nixt'
import { join } from 'path'
import { createClient } from 'contentful-management'
const bin = join(__dirname, '../../', 'bin')
const app = () => {
  return nixt({ newlines: true }).cwd(bin).base('./contentful-import').clone()
}

const managementToken = process.env.MANAGEMENT_TOKEN
const orgId = process.env.ORG_ID

test('It should import space properly when running as a cli', (t) => {
  const client = createClient({accessToken: managementToken})
  return client.createSpace({name: 'temp contentful-import space'}, orgId)
    .then((space) => {
      app()
        .run(` --space-id ${space.sys.id} --management-token ${managementToken} --content-file sample-space.json`)
        .stdout(/The following entities were imported/)
        .stdout(/Content Types {13}| 3/)
        .stdout(/Editor Interfaces {9}| 3/)
        .stdout(/Entries {19}| 6/)
        .stdout(/Assets {20}| 6/)
        .stdout(/Locales {19}| 1/)
        .stdout(/Webhooks {18}| 0/)
        .stdout(/Roles {21}| 7/)
        .end(() => {
          space.delete().then(t.end)
        })
    })
})
