import { Readable } from 'stream'
import { MockedFs } from '../../types'

const fs: MockedFs = jest.createMockFromModule('fs')

let mockFiles: any[] = []

function __setMockFiles (newMockFiles: any[]) {
  mockFiles = newMockFiles
}

function stat (filePath: string, callback: (err: Error | null, filePath?: string) => void) {
  if (mockFiles.includes(filePath)) {
    callback(null, filePath)
  } else {
    callback(new Error())
  }
}

function createReadStream () {
  return new Readable({
    read () {}
  })
}

fs.__setMockFiles = __setMockFiles
fs.stat = stat
fs.createReadStream = createReadStream

module.exports = fs
