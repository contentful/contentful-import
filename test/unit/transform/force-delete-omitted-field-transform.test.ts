import { cloneMock } from 'contentful-batch-libs/test/mocks/'
import { ContentTypeProps } from 'contentful-management'
import { forceDeleteOmittedFieldTransform } from '../../../lib/transform/force-delete-omitted-field-transform'

test('It should transform content types by dropping omitted fields', () => {
  const contentTypeMock = cloneMock('contentType') as ContentTypeProps
  contentTypeMock.fields[0].omitted = true
  expect(contentTypeMock.fields).toHaveLength(1)
  const transformedContentTypeMock = forceDeleteOmittedFieldTransform(contentTypeMock)
  expect(transformedContentTypeMock.fields).toHaveLength(0)
})
