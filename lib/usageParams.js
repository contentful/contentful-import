import yargs from 'yargs'
import log from 'npmlog'
import * as packageFile from '../package'

export default yargs
  .version(packageFile.version || 'Version only available on installed package')
  .usage('Usage: $0 [options]')
  .option('space-id', {
    describe: 'ID of the destination space',
    type: 'string',
    demand: true
  })
  .option('management-token', {
    describe: 'Contentful management API token for the destination space',
    type: 'string',
    demand: true
  })
  .option('content-file', {
    describe: 'JSON file that contains data to be import to your space',
    type: 'string',
    demand: true
  })
  .option('skip-content-model', {
    describe: 'Skip importing content types and locales',
    type: 'boolean',
    default: false
  })
  .option('skip-locales', {
    describe: 'Skip importing locales',
    type: 'boolean',
    default: false
  })
  .option('skip-content-publishing', {
    describe: 'Skips content publishing. Creates content but does not publish it',
    type: 'boolean',
    default: false
  })
  .option('error-log-file', {
    describe: 'Full path to the error log file',
    type: 'string'
  })
  .option('managementHost', {
    describe: 'Management API host',
    type: 'string',
    default: 'api.contentful.com'
  })
  .config('config', 'An optional configuration JSON file containing all the options for a single run')
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
