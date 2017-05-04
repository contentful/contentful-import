import yargs from 'yargs'
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
  .option('content-model-only', {
    describe: 'Import only content types',
    type: 'boolean',
    default: false
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
  .option('proxy', {
    describe: 'Proxy configuration in HTTP auth format: host:port or user:password@host:port',
    type: 'string'
  })
  .config('config', 'An optional configuration JSON file containing all the options for a single run')
  .argv
