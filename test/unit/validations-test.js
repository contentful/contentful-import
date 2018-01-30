import test from 'blue-tape'
import { assertPayload } from '../../lib/utils/validations'

test('payload validation should succeed when given an empty payload', (t) => {
  t.plan(1)
  try {
    assertPayload({entries: [], locales: [], contentTypes: [], assets: []})
  } catch (e) {
    t.fail('it should not throw an error')
  }
  t.pass('it should suceed')
  t.end()
})

test('payload validation should succeed when given a valid payload', (t) => {
  t.plan(1)
  try {
    assertPayload({
      entries: [],
      locales: [],
      contentTypes: [{
        'sys': {
          'space': {
            'sys': {
              'type': 'Link',
              'linkType': 'Space',
              'id': '28p9vvm1oxuw'
            }
          },
          'id': 'person',
          'type': 'ContentType',
          'createdAt': '2017-05-11T12:04:23.540Z',
          'updatedAt': '2017-05-18T14:04:51.650Z',
          'createdBy': {
            'sys': {
              'type': 'Link',
              'linkType': 'User',
              'id': '066RqBikAjzKy0SWUEtFvH'
            }
          },
          'updatedBy': {
            'sys': {
              'type': 'Link',
              'linkType': 'User',
              'id': '2AAFsI4st4sZPlF1LFT13q'
            }
          },
          'publishedCounter': 7,
          'version': 14,
          'publishedBy': {
            'sys': {
              'type': 'Link',
              'linkType': 'User',
              'id': '2AAFsI4st4sZPlF1LFT13q'
            }
          },
          'publishedVersion': 13,
          'firstPublishedAt': '2017-05-11T12:04:23.869Z',
          'publishedAt': '2017-05-18T14:04:51.628Z'
        },
        'displayField': 'name',
        'name': 'Person',
        'description': '',
        'fields': [
          {
            'id': 'name',
            'name': 'Name',
            'type': 'Symbol',
            'localized': false,
            'required': true,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'title',
            'name': 'Title',
            'type': 'Symbol',
            'localized': false,
            'required': true,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'company',
            'name': 'Company',
            'type': 'Symbol',
            'localized': false,
            'required': true,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'shortBio',
            'name': 'Short Bio',
            'type': 'Text',
            'localized': false,
            'required': true,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'email',
            'name': 'Email',
            'type': 'Symbol',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'phone',
            'name': 'Phone',
            'type': 'Symbol',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'facebook',
            'name': 'Facebook',
            'type': 'Symbol',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'twitter',
            'name': 'Twitter',
            'type': 'Symbol',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'github',
            'name': 'Github',
            'type': 'Symbol',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false
          },
          {
            'id': 'image',
            'name': 'Image',
            'type': 'Link',
            'localized': false,
            'required': false,
            'validations': [],
            'disabled': false,
            'omitted': false,
            'linkType': 'Asset'
          }
        ]
      }],
      assets: []
    })
  } catch (e) {
    t.fail('it should not throw an error')
  }
  t.pass('it should suceed')
  t.end()
})

test('payload validation should fail when given an invalid data', (t) => {
  t.plan(4)
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
    t.equals(e.details[0].entity, 'a title (myAsset)')
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
