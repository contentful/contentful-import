import { Readable } from 'stream'
import { MockedFs } from '../test/types'
import { vi } from 'vitest'

let mockFiles: string[] = []

const createReadStream = vi.fn().mockImplementation(() => {
  return new Readable({
    read () {}
  })
})

const stat = vi.fn().mockImplementation((filePath: string, callback: (err: Error | null, filePath?: string) => void) => {
  if (mockFiles.includes(filePath)) {
    callback(null, filePath)
  } else {
    callback(new Error())
  }
})

const __setMockFiles = vi.fn().mockImplementation((newMockFiles: string[]) => {
  mockFiles = newMockFiles
})

const fsMock = {
  createReadStream,
  stat,
  __setMockFiles
} as MockedFs

export default fsMock
