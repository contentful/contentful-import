import { cloneDeep } from 'lodash'

import {
  contentTypeMock,
  entryMock,
  assetMock,
  localeMock,
  webhookMock
} from 'contentful-batch-libs/test/mocks/'

import transformSpace from '../../../lib/transform/transform-space'

const tagMock = {
  sys: {
    id: 'myTagId'
  },
  name: 'mytagname'
}

const space = {
  contentTypes: [contentTypeMock],
  entries: [entryMock],
  assets: [assetMock],
  locales: [localeMock],
  webhooks: [webhookMock],
  tags: [tagMock]
}
const destinationSpace = cloneDeep(space)

space.doNotTouch = true

test('applies transformers to give space data', () => {
  const result = transformSpace(space, destinationSpace)
  expect(result.contentTypes[0]).toHaveProperty('original')
  expect(result.contentTypes[0]).toHaveProperty('transformed')
  expect(result.entries[0]).toHaveProperty('original')
  expect(result.entries[0]).toHaveProperty('transformed')
  expect(result.assets[0]).toHaveProperty('original')
  expect(result.assets[0]).toHaveProperty('transformed')
  expect(result.tags[0]).toHaveProperty('original')
  expect(result.tags[0]).toHaveProperty('transformed')
  expect(result.locales[0]).toHaveProperty('original')
  expect(result.locales[0]).toHaveProperty('transformed')
  expect(result.webhooks[0]).toHaveProperty('original')
  expect(result.webhooks[0]).toHaveProperty('transformed')
  expect(result.doNotTouch).toBe(true)
})

test('applies custom transformers to give space data', () => {
  const result = transformSpace(space, destinationSpace, {
    entries: (entry) => 'transformed'
  })
  expect(result.entries[0].transformed).toBe('transformed')
})

test('applies transformers to given entity types', () => {
  space.customEntities = [{ type: 'custom' }]
  const result = transformSpace(space, destinationSpace, {}, ['entries'])
  expect(result.contentTypes[0]).not.toHaveProperty('original')
  expect(result.contentTypes[0]).not.toHaveProperty('transformed')
  expect(result.entries[0]).toHaveProperty('original')
  expect(result.entries[0]).toHaveProperty('transformed')
})
