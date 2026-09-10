import { execFileSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

// Runs against the actual built dist/ and bin/ artifacts in separate `node`
// processes, mirroring how a real consumer loads the package. Anything that
// only runs the TypeScript source through ts-jest (as the rest of the suite
// does) would miss packaging-only failures like a broken ESM build or a
// CJS/ESM interop mismatch in the CLI binary — both of which have shipped
// undetected in the past.

const rootDir = resolve(__dirname, '../..')
const cjsEntry = resolve(rootDir, 'dist/index.js')
const esmEntry = resolve(rootDir, 'dist/index.mjs')
const binPath = resolve(rootDir, 'bin/contentful-import')

describe('packaged entry points', () => {
  test('dist/index.js is requireable and exposes the import function directly (CJS consumers)', () => {
    const output = execFileSync('node', ['-e', `
      const spaceImport = require(${JSON.stringify(cjsEntry)})
      if (typeof spaceImport !== 'function') {
        throw new Error('expected default export to be a function, got ' + typeof spaceImport)
      }
      console.log('ok')
    `]).toString().trim()

    expect(output).toBe('ok')
  })

  test('dist/index.mjs loads under the native ESM loader and exposes the import function as the default export', () => {
    const entryUrl = pathToFileURL(esmEntry).href
    const output = execFileSync('node', ['--input-type=module', '-e', `
      import spaceImport from '${entryUrl}'
      if (typeof spaceImport !== 'function') {
        throw new Error('expected default export to be a function, got ' + typeof spaceImport)
      }
      console.log('ok')
    `]).toString().trim()

    expect(output).toBe('ok')
  })

  test('bin/contentful-import runs without a module-loading error', () => {
    // Regression test for a bug where the CJS build footer unwrapped
    // dist/usageParams.js's export, and bin/contentful-import's extra
    // `.default` on top resolved to undefined, crashing before ever
    // reaching the content file. A healthy CLI should fail later, on the
    // missing file, not on a TypeError while parsing options.
    const tmpDir = mkdtempSync(resolve(tmpdir(), 'contentful-import-smoke-'))
    const missingContentFile = resolve(tmpDir, 'does-not-exist.json')

    let stderr = ''
    try {
      execFileSync(
        'node',
        [binPath, '--space-id', 'x', '--management-token', 'y', '--content-file', missingContentFile],
        { stdio: 'pipe' }
      )
    } catch (err) {
      stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? ''
    }

    expect(stderr).not.toMatch(/TypeError/)
    expect(stderr).toMatch(/ENOENT|no such file/)
  })
})
