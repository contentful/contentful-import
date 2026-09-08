import { createClient } from 'contentful-management'

import runContentfulImport from '../../dist/index'

const managementToken = process.env.MANAGEMENT_TOKEN as string
const orgId = process.env.ORG_ID as string
const environmentId = 'master'

jest.setTimeout(2 * 60 * 1000)

// Releases (Timeline) is a separate, GA Contentful feature, not part of Experience
// Orchestration - covered by its own throwaway space/import run rather than reusing
// exo.utils.ts's fixtures, which are ExO-specific.
describe('Importing Releases', () => {
  let spaceId: string
  let plainClient
  let importResult: any
  const entryId = 'test-entry-for-release'
  const contentTypeId = 'testPage'

  beforeAll(async () => {
    plainClient = createClient({ accessToken: managementToken })
    const space = await plainClient.space.create({ organizationId: orgId }, { name: 'IMPORT [AUTO] TOOL RELEASES TMP' })
    spaceId = space.sys.id

    importResult = await runContentfulImport({
      spaceId,
      environmentId,
      managementToken,
      content: {
        contentTypes: [
          {
            // publishedVersion here (not on the entry alone) is what makes the "Publishing
            // Content Types" task actually publish it - without it, the content type is
            // created but stays unpublished, and the Entry create in the next task 400s
            // with "content type ... was not activated".
            sys: { id: contentTypeId, type: 'ContentType', publishedVersion: 1 },
            name: 'Test Page',
            displayField: 'title',
            fields: [
              { id: 'title', name: 'Title', type: 'Symbol', required: false, localized: false }
            ]
          }
        ],
        entries: [
          {
            sys: { id: entryId, type: 'Entry', contentType: { sys: { id: contentTypeId, type: 'Link', linkType: 'ContentType' } }, publishedVersion: 1 },
            fields: { title: { 'en-US': 'Test Page' } }
          }
        ],
        releases: [
          {
            sys: { id: 'test-release', type: 'Release', schemaVersion: 'Release.v2' },
            title: 'Test Release for import',
            entities: {
              sys: { type: 'Array' },
              items: [
                { entity: { sys: { type: 'Link', linkType: 'Entry', id: entryId } }, action: 'publish' }
              ]
            }
          }
        ]
      },
      useVerboseRenderer: true
    })
  })

  afterAll(async () => {
    await plainClient.space.delete({ spaceId })
  })

  test('creates the Entry the Release references', async () => {
    const entry = await plainClient.entry.get({ spaceId, environmentId, entryId })
    expect(entry.sys.id).toBe(entryId)
    expect(entry.sys.publishedVersion).toBeDefined()
  })

  test('creates the Release with its title, schemaVersion, and entities collection - at a server-generated id, not the source id', async () => {
    expect(importResult.releases).toHaveLength(1)
    const created = importResult.releases[0]

    // The Releases API always server-generates sys.id on create - it must NOT equal the
    // source export's "test-release" id, confirming the create payload doesn't (and can't)
    // preserve it.
    expect(created.sys.id).not.toBe('test-release')
    expect(created.sys.schemaVersion).toBe('Release.v2')
    expect(created.title).toBe('Test Release for import')
    expect(created.entities.items).toHaveLength(1)
    expect(created.entities.items[0].entity.sys.id).toBe(entryId)
    expect(created.entities.items[0].entity.sys.linkType).toBe('Entry')
    expect(created.entities.items[0].action).toBe('publish')

    // Independently re-fetch by the server-generated id (not release.query, which - unlike
    // release.get - was observed returning an empty result immediately after create in this
    // same sandbox, apparently an indexing-lag quirk of the query endpoint specifically) to
    // confirm the release genuinely persisted, not just that create() resolved.
    const refetched = await plainClient.release.get({ spaceId, environmentId, releaseId: created.sys.id })
    expect(refetched.sys.id).toBe(created.sys.id)
    expect(refetched.title).toBe('Test Release for import')
  })
})
