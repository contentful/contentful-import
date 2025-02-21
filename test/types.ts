import { Readable } from 'stream'

export interface MockedFs {
  __setMockFiles: (files: string[]) => void;
  stat: (filePath: string, callback: (err: Error | null, stats?: any) => void) => void;
  createReadStream: (filePath: string) => Readable;
}
