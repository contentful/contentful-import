import test from 'tape'
import sinon from 'sinon'
import contentfulImport from '../lib/index'
import Promise from 'bluebird'
import { resolve } from 'path'

const createClientsStub = sinon.stub().returns({ source: {delivery: {}}, destination: {management: {}} })
const getTransformedDestinationResponse = sinon.stub().returns(
  Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []})
)
const transformSpaceStub = sinon.stub().returns(Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []}))
const pushToSpaceStub = sinon.stub().returns(Promise.resolve({}))

function setup () {
  contentfulImport.__Rewire__('createClients', createClientsStub)
  contentfulImport.__Rewire__('getTransformedDestinationResponse', getTransformedDestinationResponse)
  contentfulImport.__Rewire__('transformSpace', transformSpaceStub)
  contentfulImport.__Rewire__('pushToSpace', pushToSpaceStub)
}

function teardown () {
  contentfulImport.__ResetDependency__('createClients')
  contentfulImport.__ResetDependency__('getTransformedDestinationResponse')
  contentfulImport.__ResetDependency__('transformSpace')
  contentfulImport.__ResetDependency__('pushToSpace')
  createClientsStub.resetHistory()
  getTransformedDestinationResponse.resetHistory()
  transformSpaceStub.resetHistory()
  pushToSpaceStub.resetHistory()
}

test('Runs Contentful Import', (t) => {
  setup()
  contentfulImport({
    content: {},
    spaceId: 'someSpaceId',
    managementToken: 'someManagementToken',
    errorLogFile: 'errorlogfile'
  })
  .then(() => {
    t.ok(createClientsStub.called, 'create clients')
    t.ok(transformSpaceStub.called, 'transform space')
    t.ok(pushToSpaceStub.called, 'push to space')
    teardown()
    t.end()
  }).catch((error) => {
    t.fail('Should not throw ', error)
    teardown()
    t.end()
  })
})

test('Creates a valid and correct opts object', (t) => {
  setup()

  const errorLogFile = 'errorlogfile'
  const exampleConfig = require('../example-config.json')

  contentfulImport({
    errorLogFile,
    config: resolve(__dirname, '..', 'example-config.json'),
    content: {}
  })
  .then(() => {
    const opts = createClientsStub.args[0][0]
    t.false(opts.skipContentModel, 'defaults are applied')
    t.equal(opts.errorLogFile, errorLogFile, 'defaults can be overwritten')
    t.equal(opts.spaceId, exampleConfig.spaceId, 'config file values are taken')
    teardown()
    t.end()
  }).catch((error) => {
    t.fail('Should not throw ', error)
    teardown()
    t.end()
  })
})
