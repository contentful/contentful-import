import yargs from 'yargs'
import log from 'npmlog'
import * as packageFile from '../package'
import fs from 'fs'

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
  .option('skip-content-model', {
    describe: 'Skips content types and locales. Copies only entries and assets',
    type: 'boolean'
  })
  .option('rate-limit', {
    describe: 'How many requests to perform per period of time, default is 5',
    type: 'number',
    default: 5
  })
  .option('rate-limit-period', {
    describe: 'How much time to wait before retry in ms, default 1000',
    type: 'number',
    default: 1000
  })
  .option('skip-locales', {
    describe: 'Skips locales. Must be used with content-model-only. Copies only content-types',
    type: 'boolean'
  })
  .option('skip-content-publishing', {
    describe: 'Skips content publishing. Creates content but does not publish it',
    type: 'boolean'
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

opts.content = opts.content || JSON.parse(fs.readFileSync(opts.contentFile))
opts.destinationSpace = opts.destinationSpace || opts.spaceId
opts.destinationManagementToken = opts.destinationManagementToken || opts.managementToken
opts.exportDir = opts.exportDir || process.cwd()

module.exports = {
  opts: opts,
  errorLogFile: opts.exportDir + '/contentful-import-' + Date.now() + '.log'
}
