import { cloneDeep } from 'lodash-es'

import { logEmitter } from 'contentful-batch-libs/dist/logging'
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

jest.mock('contentful-batch-libs/dist/logging', () => ({
  logEmitter: { emit: jest.fn() }
}))

const mockEmit = jest.mocked(logEmitter.emit)

afterEach(() => {
  mockEmit.mockClear()
})

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

  test('preserves metadata.concepts (ExO folder placement) on all 5 non-DataAssembly types when stripping tags', () => {
    const folderConcept = { sys: { id: 'contentful.folder-abc' } }
    const spaceWithConcepts: ResourcesWithDoNotTouch = {
      contentTypes: [contentTypeMock],
      locales: [localeMock as LocaleProps],
      components: [{ sys: { id: 'c1', type: 'Component' }, metadata: { tags: [tagLink], concepts: [folderConcept] } } as any],
      experienceTemplates: [{ sys: { id: 'et1', type: 'ExperienceTemplate' }, metadata: { tags: [tagLink], concepts: [folderConcept] } } as any],
      experienceFragments: [{ sys: { id: 'ef1', type: 'ExperienceFragment' }, metadata: { tags: [tagLink], concepts: [folderConcept] } } as any],
      experiences: [{ sys: { id: 'e1', type: 'Experience' }, metadata: { tags: [tagLink], concepts: [folderConcept] } } as any],
      designTokens: [{ sys: { id: 'dt1', type: 'DesignToken' }, metadata: { tags: [tagLink], concepts: [folderConcept] } } as any]
    }
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    const result = transformSpace(cloneDeep(spaceWithConcepts), destinationWithoutTags) as any

    for (const type of ['components', 'experienceTemplates', 'experienceFragments', 'experiences', 'designTokens']) {
      expect(result[type][0].metadata.tags).toBeUndefined()
      expect(result[type][0].metadata.concepts).toEqual([folderConcept])
    }
  })

  test('does not mutate the source DesignToken\'s metadata when stripping tags', () => {
    const sourceMetadata = { tags: [tagLink], concepts: [{ sys: { id: 'contentful.folder-abc' } }] }
    const space: ResourcesWithDoNotTouch = {
      contentTypes: [contentTypeMock],
      locales: [localeMock as LocaleProps],
      designTokens: [{ sys: { id: 'dt1', type: 'DesignToken' }, metadata: sourceMetadata } as any]
    }
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    transformSpace(space, destinationWithoutTags)

    expect(sourceMetadata).toEqual({ tags: [tagLink], concepts: [{ sys: { id: 'contentful.folder-abc' } }] })
  })

  test('warns once, counting every affected entity across entries/assets/ExO types, when tags are stripped', () => {
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    transformSpace(cloneDeep(exoSpace), destinationWithoutTags)

    const tagWarnings = mockEmit.mock.calls.filter(([event]) => event === 'warning')
    expect(tagWarnings).toHaveLength(1)
    expect(tagWarnings[0][1]).toMatch(/6 entities/)
  })

  test('does not warn when the destination has Tags access', () => {
    const destinationWithTags = { contentTypes: [], locales: [], tags: [tagMock] }
    transformSpace(cloneDeep(exoSpace), destinationWithTags)

    expect(mockEmit).not.toHaveBeenCalled()
  })

  test('does not warn when no entity actually has metadata.tags set', () => {
    const spaceWithoutTagData: ResourcesWithDoNotTouch = {
      contentTypes: [contentTypeMock],
      locales: [localeMock as LocaleProps],
      components: [{ sys: { id: 'c1', type: 'Component' } } as any]
    }
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    transformSpace(spaceWithoutTagData, destinationWithoutTags)

    expect(mockEmit).not.toHaveBeenCalled()
  })

  test('counts entries and assets alongside ExO types in the same warning', () => {
    const mixedSpace: ResourcesWithDoNotTouch = {
      contentTypes: [contentTypeMock],
      locales: [localeMock as LocaleProps],
      entries: [{ ...entryMock, metadata: { tags: [tagLink] } }] as any,
      assets: [{ ...assetMock, metadata: { tags: [tagLink] } }] as any,
      components: [{ sys: { id: 'c1', type: 'Component' }, metadata: { tags: [tagLink] } } as any]
    }
    const destinationWithoutTags = { contentTypes: [], locales: [] }
    transformSpace(mixedSpace, destinationWithoutTags)

    const tagWarnings = mockEmit.mock.calls.filter(([event]) => event === 'warning')
    expect(tagWarnings).toHaveLength(1)
    expect(tagWarnings[0][1]).toMatch(/3 entities/)
  })
})
