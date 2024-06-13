import { ContentTypeProps } from 'contentful-management'

export function forceDeleteOmittedFieldTransform (contentType: ContentTypeProps) {
  const omittedFields = contentType.fields.filter(field => field.omitted)
  omittedFields.forEach(field => {
    contentType.fields = contentType.fields.filter(f => f.id !== field.id)
  })
  return contentType
}
