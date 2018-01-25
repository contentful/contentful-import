import Joi from 'joi'

const entrySchema = {
  sys: Joi.object(),
  fields: Joi.object()
}

const contentTypeSchema = {
  sys: Joi.object(),
  fields: Joi.array().required().items(Joi.object().keys({
    id: Joi.string().required(),
    name: Joi.string().required(),
    type: Joi.string().required().regex(/Symbol|Text|Integer|Number|Date|Object|Boolean|Array|Link/),
    validations: Joi.array(),
    disabled: Joi.boolean(),
    omitted: Joi.boolean()
  }))
}

const assetSchema = {
  sys: Joi.object(),
  fields: Joi.object({
    file: Joi.object().required().pattern(/\S+-\S+/, Joi.object({
      url: Joi.string().required(),
      details: Joi.object({
        size: Joi.number(),
        image: Joi.object({
          width: Joi.number(),
          height: Joi.number()
        }),
        fileName: Joi.string().required(),
        contentType: Joi.string().required()
      })
    }))
  }).required()
}
const editorInterfaceSchema = {
  sys: Joi.object(),
  controls: Joi.array().items([{fieldId: Joi.string(), widgetId: Joi.string()}])
}
const localeSchema = {
  name: Joi.string().required(),
  internal_code: Joi.string().required(),
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
  url: Joi.string().uri().required(),
  topics: Joi.array().required(),
  httpBasicUsername: Joi.string()
}

const payloadSchema = Joi.object({
  entries: Joi.array().items([entrySchema]),
  contentTypes: Joi.array().items([contentTypeSchema]),
  assets: Joi.array().items([assetSchema]),
  locales: Joi.array().items([localeSchema]),
  editorInterfaces: Joi.array().items([editorInterfaceSchema]),
  webhooks: Joi.array().items([webhookSchema])
})

const assertPayload = (payload) => {
  const result = Joi.validate(payload, payloadSchema)
  if (result.error) {
    throw result.error
  }
}

const assertDefaultLocale = (source, destination) => {
  const sourceDefaultLocale = source.locales.find((locale) => locale.default === true)
  const destinationDefaultLocale = destination.locales.find((locale) => locale.default === true)

  if (!sourceDefaultLocale || !destinationDefaultLocale) {
    return
  }

  if (sourceDefaultLocale.code !== destinationDefaultLocale.code) {
    throw new Error(`
      Please make sure the destination space have the same default locale as the source\n
      Default locale for source space : ${sourceDefaultLocale.code}\n
      Default locale for destination space: ${destinationDefaultLocale.code}\n
    `)
  }
}

export {
  assertPayload,
  assertDefaultLocale
}
