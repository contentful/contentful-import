try {
  module.exports = require('./dist/run-contentful-import').default
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    require('babel-register')
    module.exports = require('./lib/run-contentful-import').default
  } else {
    console.log(err)
    process.exit(1)
  }
}
