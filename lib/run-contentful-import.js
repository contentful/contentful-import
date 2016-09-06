import fs from 'fs'
import createClient from 'contentful-batch-libs/utils/create-clients'
import pushToSpace from 'contentful-batch-libs/push/push-to-space'
import Promise from 'bluebird'
var log = require('npmlog')

Promise.promisifyAll(fs)

export default function runContentfulImport(usageParams) {
	let {opts, errorLogFile} = usageParams 
	let exportToFile = true
	if(!opts) {
		exportToFile = false
		opts = {}
		opts.destinationSpace = usageParams.spaceId
		opts.destinationManagementToken = usageParams.managementToken
		opts.content = usageParams.content
	}
	const clients = createClients(opts)

	// push the content to the destination space
	return pushToSpace({
		sourceContent: opts.content,
		destinationContent: {},
		managementClient: clients.managementClient,
		spaceId: opts.destinationSpace
	})
		.catch((err) => {
			throw err
		})
}
