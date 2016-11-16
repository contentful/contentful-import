import test from 'tape'
import sinon from 'sinon'
import runContentfulImport from '../lib/run-contentful-import'
import Promise from 'bluebird'
const createClientsStub = sinon.stub().returns({ source: {delivery: {}}, destination: {management: {}} })
runContentfulImport.__Rewire__('createClients', createClientsStub)
const getTransformedDestinationResponse = sinon.stub().returns(
  Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []})
)
runContentfulImport.__Rewire__('getTransformedDestinationResponse', getTransformedDestinationResponse)

const transformSpaceStub = sinon.stub().returns(Promise.resolve({contentTypes: [], entries: [], assets: [], locales: []}))
runContentfulImport.__Rewire__('transformSpace', transformSpaceStub)
const pushToSpaceStub = sinon.stub().returns(Promise.resolve({}))
runContentfulImport.__Rewire__('pushToSpace', pushToSpaceStub)
test('Runs Contentful Import', (t) => {
  runContentfulImport({
    opts: {content: {}},
    errorLogFile: 'errorlogfile'
  })
  .then(() => {
    t.ok(createClientsStub.called, 'create clients')
    t.ok(transformSpaceStub.called, 'transform space')
    t.ok(pushToSpaceStub.called, 'push to space')
    runContentfulImport.__ResetDependency__('createClients')
    runContentfulImport.__ResetDependency__('transformSpace')
    runContentfulImport.__ResetDependency__('pushToSpace')
    t.end()
  })
})

