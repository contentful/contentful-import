import { cloneDeep } from 'lodash-es'

import {
  contentTypeMock,
  entryMock,
  assetMock,
  localeMock,
  webhookMock
} from 'contentful-batch-libs/test/mocks/'

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

describe('ExO metadata.tags scrubbing (AIS-552)', () => {
  const tagLink = { sys: { id: 'myTagId', linkType: 'Tag', type: 'Link' } }

  const exoSpace: ResourcesWithDoNotTouch = {
    contentTypes: [contentTypeMock],
    locales: [localeMock as LocaleProps],
    components: [
      { sys: { id: 'c1', type: 'Component' }, metadata: { tags: [tagLink] } } as any
    ],
    experienceTemplates: [
      { sys: { id: 'et1', type: 'ExperienceTemplate' }, metadata: { tags: [tagLink] } } as any
    ],
    experienceFragments: [
      { sys: { id: 'ef1', type: 'ExperienceFragment' }, metadata: { tags: [tagLink] } } as any
    ],
    experiences: [
      { sys: { id: 'e1', type: 'Experience' }, metadata: { tags: [tagLink] } } as any
    ],
    dataAssemblies: [
      { sys: { id: 'da1', type: 'DataAssembly' }, metadata: { tags: [tagLink] } } as any
    ],
    designTokens: [
      { sys: { id: 'dt1', type: 'DesignToken' }, metadata: { tags: [tagLink] } } as any
    ]
  }

  test('strips metadata.tags from all 6 ExO entity types when destination lacks Tags access', () => {
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    const result = transformSpace(cloneDeep(exoSpace), destinationWithoutTags) as any

    expect(result.components[0].metadata).toBeUndefined()
    expect(result.experienceTemplates[0].metadata).toBeUndefined()
    expect(result.experienceFragments[0].metadata).toBeUndefined()
    expect(result.experiences[0].metadata).toBeUndefined()
    expect(result.designTokens[0].metadata).toBeUndefined()
    // DataAssembly.metadata is typed required, so it's zeroed out rather than deleted
    expect(result.dataAssemblies[0].metadata).toEqual({ tags: [] })
  })

  test('keeps metadata.tags on all 6 ExO entity types when destination has Tags access', () => {
    const destinationWithTags = { contentTypes: [], locales: [], tags: [tagMock] }
    const result = transformSpace(cloneDeep(exoSpace), destinationWithTags) as any

    expect(result.components[0].metadata).toEqual({ tags: [tagLink] })
    expect(result.experienceTemplates[0].metadata).toEqual({ tags: [tagLink] })
    expect(result.experienceFragments[0].metadata).toEqual({ tags: [tagLink] })
    expect(result.experiences[0].metadata).toEqual({ tags: [tagLink] })
    expect(result.designTokens[0].metadata).toEqual({ tags: [tagLink] })
    expect(result.dataAssemblies[0].metadata).toEqual({ tags: [tagLink] })
  })
})
