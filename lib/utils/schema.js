import Joi from 'joi'

const entrySchema = {
  sys: Joi.object(),
  fields: Joi.object()
}

const tagSchema = {
  name: Joi.string().required(),
  sys: Joi.object()
}

const contentTypeSchema = {
  sys: Joi.object(),
  fields: Joi.array().required().items(Joi.object().keys({
    id: Joi.string().required(),
    name: Joi.string().required(),
    type: Joi.string().required().regex(/^Symbol|Text|Integer|Number|Date|Object|Boolean|Array|Link|Location$/),
    validations: Joi.array(),
    disabled: Joi.boolean(),
    omitted: Joi.boolean(),
    required: Joi.boolean(),
    localized: Joi.boolean(),
    linkType: Joi.string().when('type', { is: 'Link', then: Joi.string().regex(/^Asset|Entry$/), otherwise: Joi.forbidden() })
  }))
}

const assetSchema = {
  sys: Joi.object(),
  fields: Joi.object({
    file: Joi.object().pattern(/.+/, Joi.object({
      url: Joi.string().required(),
      details: Joi.object({
        size: Joi.number(),
        image: Joi.object({
          width: Joi.number(),
          height: Joi.number()
        })
      }),
      fileName: Joi.string().required(),
      contentType: Joi.string().required()
    }))
  }).required()
}
const editorInterfaceSchema = {
  sys: Joi.object(),
  controls: Joi.array().items([{ fieldId: Joi.string(), widgetId: Joi.string() }])
}
const localeSchema = {
  name: Joi.string().required(),
  internal_code: Joi.string(),
  code: Joi.string().required(),
  fallbackCode: Joi.string().allow([null]),
  default: Joi.boolean(),
  contentManagementApi: Joi.boolean(),
  contentDeliveryApi: Joi.boolean(),
  optional: Joi.boolean(),
  sys: Joi.object()
}

const webhookSchema = {
  name: Joi.string(),
  url: Joi.string().replace(/{[^}{]+?}/g, 'x').regex(/^https?:\/\/[^ /}{][^ }{]*$/i).required(),
  topics: Joi.array().required(),
  httpBasicUsername: Joi.string().allow(['', null])
}

/**
 * @returns normalized validation object. Don't use normalized output as payload
 */
const payloadSchema = Joi.object({
  entries: Joi.array().items([entrySchema]),
  contentTypes: Joi.array().items([contentTypeSchema]),
  tags: Joi.array().items([tagSchema]),
  assets: Joi.array().items([assetSchema]),
  locales: Joi.array().items([localeSchema]),
  editorInterfaces: Joi.array().items([editorInterfaceSchema]),
  webhooks: Joi.array().items([webhookSchema])
})
export {
  entrySchema,
  contentTypeSchema,
  tagSchema,
  localeSchema,
  webhookSchema,
  editorInterfaceSchema,
  assetSchema,
  payloadSchema
}
