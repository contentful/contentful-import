import { expect, test } from 'vitest'
import { cloneDeep } from 'lodash'

import {
  contentTypeMock,
  entryMock,
  assetMock,
  localeMock,
  webhookMock
} from 'contentful-batch-libs/test/mocks/index.js'

import transformSpace from '../../../lib/transform/transform-space'
import { Resources, TransformedSourceData } from '../../../lib/types'
import { TagSysProps } from 'contentful-management'
import type { AssetProps, LocaleProps, WebhookProps } from 'contentful-management'

const tagMock = {
  sys: ({
    id: 'myTagId'
  } as TagSysProps),
  name: 'mytagname'
}

type ResourcesWithDoNotTouch = Resources & {
  doNotTouch?: boolean;
}

type TransformedSourceDataWithDoNotTouch = TransformedSourceData & {
  doNotTouch?: boolean;
}

const space: ResourcesWithDoNotTouch = {
  contentTypes: [contentTypeMock],
  entries: [entryMock],
  assets: [assetMock as unknown as AssetProps],
  locales: [localeMock as LocaleProps],
  webhooks: [webhookMock as WebhookProps],
  tags: [tagMock]
}
const destinationSpace = cloneDeep(space)

space.doNotTouch = true

test('applies transformers to give space data', () => {
  const result = transformSpace(space, destinationSpace) as TransformedSourceDataWithDoNotTouch

  expect(result.contentTypes[0]).toHaveProperty('original')
  expect(result.contentTypes[0]).toHaveProperty('transformed')
  expect(result.entries?.[0]).toHaveProperty('original')
  expect(result.entries?.[0]).toHaveProperty('transformed')
  expect(result.assets[0]).toHaveProperty('original')
  expect(result.assets[0]).toHaveProperty('transformed')
  expect(result.tags?.[0]).toHaveProperty('original')
  expect(result.tags?.[0]).toHaveProperty('transformed')
  expect(result.locales?.[0]).toHaveProperty('original')
  expect(result.locales?.[0]).toHaveProperty('transformed')
  expect(result.webhooks?.[0]).toHaveProperty('original')
  expect(result.webhooks?.[0]).toHaveProperty('transformed')
  expect(result.doNotTouch).toBe(true)
})

test('applies custom transformers to give space data', () => {
  const result = transformSpace(space, destinationSpace, {
    entries: () => 'transformed'
  })
  expect(result.entries?.[0]?.transformed).toBe('transformed')
})

test('applies transformers to given entity types', () => {
  const result = transformSpace(space, destinationSpace, {}, ['entries'])
  expect(result.contentTypes[0]).not.toHaveProperty('original')
  expect(result.contentTypes[0]).not.toHaveProperty('transformed')
  expect(result.entries[0]).toHaveProperty('original')
  expect(result.entries[0]).toHaveProperty('transformed')
})
