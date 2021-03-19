const { Readable } = require('stream')

const fs = jest.genMockFromModule('fs')

let mockFiles = []

function __setMockFiles (newMockFiles) {
  mockFiles = newMockFiles
}

function stat (filePath, callback) {
  if (mockFiles.includes(filePath)) {
    callback(null, filePath)
  } else {
    callback(new Error())
  }
}

function createReadStream () {
  return new Readable()
}

fs.__setMockFiles = __setMockFiles
fs.stat = stat
fs.createReadStream = createReadStream

module.exports = fs
