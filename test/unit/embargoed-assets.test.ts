import {
  getEmbargoedAssetCount,
  isEmbargoedAssetUrl
} from '../../lib/utils/embargoed-assets'

describe('isEmbargoedAssetUrl', () => {
  test.each([
    '//assets.secure.ctfassets.net/space/asset/file.pdf',
    'https://images.secure.ctfassets.net/space/asset/file.jpg',
    'http://downloads.secure.ctfassets.net/space/asset/file.zip',
    'https://videos.secure.ctfassets.net/space/asset/file.mp4'
  ])('recognizes %s', (url) => {
    expect(isEmbargoedAssetUrl(url)).toBe(true)
  })

  test.each([
    '//assets.ctfassets.net/space/asset/file.pdf',
    'https://assets.secure.ctfassets.net.example.com/space/asset/file.pdf',
    'https://example.com/assets.secure.ctfassets.net/space/asset/file.pdf',
    'not a URL',
    undefined,
    { url: 'https://assets.secure.ctfassets.net/space/asset/file.pdf' }
  ])('does not recognize %p', (url) => {
    expect(isEmbargoedAssetUrl(url)).toBe(false)
  })
})

test('counts each locale once when its url or upload is embargoed', () => {
  expect(getEmbargoedAssetCount({
    assets: [{
      fields: {
        file: {
          'en-US': {
            url: '//assets.secure.ctfassets.net/space/asset/file.pdf',
            upload: '//assets.secure.ctfassets.net/space/asset/file.pdf'
          },
          'de-DE': {
            upload: 'https://images.secure.ctfassets.net/space/asset/file.pdf'
          },
          'fr-FR': {
            url: '//assets.ctfassets.net/space/asset/file.pdf'
          }
        }
      }
    }]
  })).toBe(2)
})
