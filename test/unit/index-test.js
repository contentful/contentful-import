import test from 'blue-tape'
import sinon from 'sinon'
import contentfulImport from '../../lib/index'
import Promise from 'bluebird'
import { resolve } from 'path'

const createClientsStub = sinon.stub().returns({ source: {delivery: {}}, destination: {management: {}} })

const getDestinationResponse = sinon.stub().returns(
  Promise.resolve({
    contentTypes: [],
    entries: [],
    assets: [],
    locales: [{
      name: 'German (Germany)',
      internal_code: 'de-DE',
      code: 'de-DE',
      default: true
    }]
  })
)

const transformSpaceStub = sinon.stub().returns(Promise.resolve({
  contentTypes: [],
  entries: [],
  assets: [],
  locales: [
    {
      name: 'German (Germany)',
      code: 'de-DE',
      internal_code: 'de-DE',
      default: true
    },
    {
      name: 'U.S. English',
      code: 'en-US',
      internal_code: 'en-US',
      default: false
    }
  ]
}))
const pushToSpaceStub = sinon.stub().returns(Promise.resolve({}))

function setup () {
  contentfulImport.__Rewire__('createClients', createClientsStub)
  contentfulImport.__Rewire__('getDestinationResponse', getDestinationResponse)
  contentfulImport.__Rewire__('transformSpace', transformSpaceStub)
  contentfulImport.__Rewire__('pushToSpace', pushToSpaceStub)
}

function teardown () {
  contentfulImport.__ResetDependency__('createClients')
  contentfulImport.__ResetDependency__('getDestinationResponse')
  contentfulImport.__ResetDependency__('transformSpace')
  contentfulImport.__ResetDependency__('pushToSpace')
  createClientsStub.resetHistory()
  getDestinationResponse.resetHistory()
  transformSpaceStub.resetHistory()
  pushToSpaceStub.resetHistory()
}

test('Runs Contentful Import', (t) => {
  setup()
  return contentfulImport({
    content: {},
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile'
  })
    .then(() => {
      t.ok(createClientsStub.called, 'create clients')
      t.ok(getDestinationResponse.called, 'loads destination content')
      t.ok(transformSpaceStub.called, 'transform space')
      t.ok(pushToSpaceStub.called, 'push to space')
      teardown()
    }).catch((error) => {
      t.fail('Should not throw ', error)
      teardown()
    })
})

test('Creates a valid and correct opts object', (t) => {
  setup()

  const errorLogFile = 'errorlogfile.json'
  const exampleConfig = require('../../example-config.json')

  return contentfulImport({
    errorLogFile,
    config: resolve(__dirname, '..', '..', 'example-config.json'),
    content: {}
  })
    .then(() => {
      const opts = createClientsStub.args[0][0]
      t.false(opts.skipContentModel, 'defaults are applied')
      t.equal(opts.errorLogFile, resolve(process.cwd(), errorLogFile), 'defaults can be overwritten')
      t.equal(opts.spaceId, exampleConfig.spaceId, 'config file values are taken')
      teardown()
    }).catch((error) => {
      t.fail('Should not throw ', error)
      teardown()
    })
})

test('Stops import when default locales does not match', (t) => {
  setup()
  const errorLogFile = 'errorlogfile.json'
  return contentfulImport({
    errorLogFile,
    config: resolve(__dirname, '..', '..', 'example-config.json'),
    content: {
      locales: [
        {
          name: 'German (Germany)',
          internal_code: 'de-DE',
          code: 'de-DE',
          default: false
        },
        {
          name: 'U.S English',
          code: 'en-US',
          internal_code: 'en-US',
          default: true
        }
      ]
    }
  })
    .then(() => {
      t.fail('It should not succeed')
      teardown()
    }).catch(() => {
      t.pass('It should throw')
      teardown()
    })
})
