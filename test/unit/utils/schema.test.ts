import { describe, expect, test } from 'vitest'
import { webhookSchema } from '../../../lib/utils/schema'
import Joi from 'joi'

describe('webhooks schema', () => {
  test('with valid url', () => {
    expect(Joi.assert('https://www.contentful.com', webhookSchema.url)).toBeUndefined()
  })
  test('with invalid url', async () => {
    const wrappedFunc = async () => {
      Joi.assert('ttps://www.contentful.com', webhookSchema.url)
    }

    let err
    await wrappedFunc()
      .catch(e => { err = e })

    expect(err.name).toBe('ValidationError')
  })
  test('with valid url containing custom payload definition', () => {
    expect(Joi.assert('https://www.contentful.com/webhooks/{ /payload/sys/id }', webhookSchema.url)).toBeUndefined()
  })
  test('with invalid url containing custom payload definition', async () => {
    const wrappedFunc = async () => {
      Joi.assert('https://www.contentful.com/webhooks/{ /payload/sys/id ', webhookSchema.url)
    }

    let err
    await wrappedFunc()
      .catch(e => { err = e })

    expect(err.name).toBe('ValidationError')
  })
  test('with valid url containing more than one custom payload definition', () => {
    expect(
      Joi.assert('https://www.contentful.com/webhooks/{ /payload/sys/id }/{ /payload/sys/id }', webhookSchema.url)
    ).toBeUndefined()
  })
  test('with invalid url containing more than one custom payload definition', async () => {
    const wrappedFunc = async () => {
      Joi.assert('https://www.contentful.com/webhooks/{ /payload/sys/id }/{ /payload/sys/id ', webhookSchema.url)
    }

    let err
    await wrappedFunc()
      .catch(e => { err = e })

    expect(err.name).toBe('ValidationError')
  })
})
