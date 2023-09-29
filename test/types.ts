import type { Readable } from 'stream'

export type MockedFs = {
  __setMockFiles: (newMockFiles: any[]) => void;
  stat: (filePath: string, callback: (err: Error | null, filePath?: string) => void) => void;
  createReadStream: () => Readable;
}
