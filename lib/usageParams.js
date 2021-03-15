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
  .option('environment-id', {
    describe: 'ID the environment in the destination space',
    type: 'string',
    default: 'master',
    demand: false
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
  .option('upload-assets', {
    describe: 'When pointing to an export file that has with it a directory with an asset export made using the downloadAssets option, upload those files instead of pointing to the URLs',
    type: 'boolean',
    default: false
  })
  .option('error-log-file', {
    describe: 'Full path to the error log file',
    type: 'string'
  })
  .option('host', {
    describe: 'Management API host',
    type: 'string',
    default: 'api.contentful.com'
  })
  .option('proxy', {
    describe: 'Proxy configuration in HTTP auth format: [http|https]://host:port or [http|https]://user:password@host:port',
    type: 'string'
  })
  .option('raw-proxy', {
    describe: 'Pass proxy config to Axios instead of creating a custom httpsAgent',
    type: 'boolean',
    default: false
  })
  .config('config', 'An optional configuration JSON file containing all the options for a single run')
  .argv
