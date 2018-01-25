import test from 'blue-tape'
import { assertPayload } from '../../lib/utils/validations'

test('payload validation should succeed when given and empty payload', (t) => {
  t.plan(1)
  try {
    assertPayload({entries: [], locales: [], contentTypes: [], assets: []})
  } catch (e) {
    t.fail('it should not throw an error')
  }
  t.pass('it should suceed')
  t.end()
})

test('payload validation should fail when given an invalid data', (t) => {
  t.plan(3)
  const brokenAsset = {
    sys: {id: 'myAsset'},
    fields: {
      title: {'en-US': 'a title'},
      fileName: 'anAssets.png',
      contentType: 'image/png'
    }
  }

  try {
    assertPayload({
      entries: [],
      locales: [],
      contentTypes: [],
      assets: [brokenAsset]
    })
  } catch (e) {
    t.ok(e, 'it should throw an error')
    t.deepEquals(e.details.length, 1, 'it should have one error')
    t.deepEquals(e.details[0].path,
      ['assets', 0, 'fields', 'file'],
      'it should have the correct path to the file preperty'
    )
    t.end()
    return
  }
  t.fail('it should not succeed')
  t.end()
})
