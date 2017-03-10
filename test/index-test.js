import test from 'tape'
import sinon from 'sinon'
import contentfulImport from '../lib/index'
import Promise from 'bluebird'
const createClientsStub = sinon.stub().returns({ source: {delivery: {}}, destination: {management: {}} })
contentfulImport.__Rewire__('createClients', createClientsStub)
const getTransformedDestinationResponse = sinon.stub().returns(
  Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []})
)
contentfulImport.__Rewire__('getTransformedDestinationResponse', getTransformedDestinationResponse)

const transformSpaceStub = sinon.stub().returns(Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []}))
contentfulImport.__Rewire__('transformSpace', transformSpaceStub)
const pushToSpaceStub = sinon.stub().returns(Promise.resolve({}))
contentfulImport.__Rewire__('pushToSpace', pushToSpaceStub)
test('Runs Contentful Import', (t) => {
  contentfulImport({
    opts: {content: {}},
    errorLogFile: 'errorlogfile'
  })
  .then(() => {
    t.ok(createClientsStub.called, 'create clients')
    t.ok(transformSpaceStub.called, 'transform space')
    t.ok(pushToSpaceStub.called, 'push to space')
    contentfulImport.__ResetDependency__('createClients')
    contentfulImport.__ResetDependency__('transformSpace')
    contentfulImport.__ResetDependency__('pushToSpace')
    t.end()
  })
})
