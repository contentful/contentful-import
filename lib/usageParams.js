const yargs = require('yargs')
const log = require('npmlog')
const packageFile = require('../package')

const opts = yargs
  .version(packageFile.version || 'Version only available on installed package')
  .usage('Usage: $0 [options]')
  .option('space-id', {
    describe: 'ID of the destination space',
    type: 'string',
    demand: true
  })
  .option('management-token', {
    describe: 'Management API token for the destination space',
    type: 'string',
    demand: true
	})
	.option('content-file', {
		describe: 'json file that contains data to be import to your space',
		type: 'string',
		demand: true
	})
  .config('config', 'Configuration file with required values')
  .check(function (argv) {
    if (!argv.spaceId) {
      log.error('Please provide --space-id to be used to import \n' +
          'For more info See: https://www.npmjs.com/package/contentful-import'
      )
      process.exit(1)
    }
    if (!argv.managementToken) {
      log.error('Please provide --management-token to be used for import \n' +
          'For more info See: https://www.npmjs.com/package/contentful-import'
      )
      process.exit(1)
    }
    if (!argv.contentFile) {
      log.error('Please provide --content-file to be used for import \n' +
          'For more info See: https://www.npmjs.com/package/contentful-import'
      )
      process.exit(1)
    }
    return true
  })
  .argv

opts.destinationSpace = opts.destinationSpace || opts.spaceId
opts.sourceManagementToken = opts.sourceManagementToken || opts.managementToken
opts.exportDir = opts.exportDir || process.cwd()

module.exports = {
  opts: opts,
  errorLogFile: opts.exportDir + '/contentful-import-' + Date.now() + '.log'
}
