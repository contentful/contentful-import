import Joi from 'joi'

const entrySchema = {
  sys: Joi.object(),
  fields: Joi.object()
}

const contentTypeSchema = {
  sys: Joi.object(),
  fields: Joi.array().items(Joi.object().keys({
    id: Joi.string(),
    name: Joi.string(),
    type: Joi.string().regex(/Symbol|Text|Integer|Number|Date|Object|Boolean|Array|Link/),
    validations: Joi.array(),
    disabled: Joi.boolean(),
    omitted: Joi.boolean()
  }))
}

const assetSchema = {
  sys: Joi.object(),
  fields: Joi.object({
    file: Joi.object().pattern(/\S+-\S+/, Joi.object({
      url: Joi.string(),
      details: Joi.object({
        size: Joi.number(),
        image: Joi.object({
          width: Joi.number(),
          height: Joi.number()
        }),
        fileName: Joi.string(),
        contentType: Joi.string()
      })
    }))
  })
}
const editorInterfaceSchema = {
  sys: Joi.object(),
  controls: Joi.array().items([{fieldId: Joi.string(), widgetId: Joi.string()}])
}
const localeSchema = {
  name: Joi.string(),
  internal_code: Joi.string(),
  code: Joi.string(),
  fallbackCode: Joi.string().allow([null]),
  default: Joi.boolean(),
  contentManagementApi: Joi.boolean(),
  contentDeliveryApi: Joi.boolean(),
  optional: Joi.boolean,
  sys: Joi.object()
}

const webhookSchema = {
  name: Joi.string(),
  url: Joi.string().uri({scheme: [/https?/]}),
  topics: Joi.array(),
  httpBasicUsername: Joi.string()
}

const payloadSchema = Joi.array().items([Joi.object({
  entries: Joi.array([entrySchema]),
  contentTypes: Joi.array().items([contentTypeSchema]),
  assets: Joi.array().items([assetSchema]),
  locales: Joi.array().items([localeSchema]),
  editorInterfaces: Joi.array().items([editorInterfaceSchema]),
  webhooks: Joi.array().items([webhookSchema])
})])

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
