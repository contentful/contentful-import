import { assertPayload } from '../../lib/utils/validations'

test('payload validation should succeed when given an empty payload', () => {
  expect(
    () => assertPayload({entries: [], locales: [], contentTypes: [], assets: []})
  ).not.toThrow()
})

test('payload validation should succeed when given a valid payload', () => {
  const payload = {
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
          'id': 'location',
          'name': 'Location',
          'type': 'Location',
          'localized': false,
          'required': true,
          'validations': [],
          'disabled': false,
          'omitted': false
        },
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
  }
  expect(() => assertPayload(payload)).not.toThrow()
})

test('payload validation should fail when given an invalid data', () => {
  const brokenAsset = {
    sys: {id: 'myAsset'},
    fields: {
      title: {'en-US': 'a title'},
      fileName: 'anAssets.png',
      contentType: 'image/png'
    }
  }
  expect(() => assertPayload({
    entries: [],
    locales: [],
    contentTypes: [],
    assets: [brokenAsset, brokenAsset]
  })
  ).toThrowErrorMatchingSnapshot()
})
