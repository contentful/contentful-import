import { test, describe } from 'vitest'

import path from 'path'
import nixt from 'nixt'

const bin = path.resolve(__dirname, '../../bin')

const app = () => {
  return nixt({ newlines: true }).cwd(bin).base('./contentful-import ').clone()
}
/**
 * Note, writing unit test for CLI tools is not trivial, because of the nature of jest/tests
 * running in one process, while the CLI tool is running in another process.  I've attempted to
 * use nixt to capture stdout/stderr, codes but it seems like nixt isn't capturing ALL output from
 * potentially multiple processes. So I've added only the most basic tests here.  An actual test
 * to assert that an import occured successfully could be handled in an integration test. see
 * https://github.com/contentful/contentful-cli/tree/main/test/integration for a better maintained
 * integration test suite.
 */
describe('contentful-import yargs', () => {
  test('prints helpful information', done => {
    app()
      .run('--help')
      .code(0)
      .stdout(/Usage:/)
      .stdout(/--version/)
      .stdout(/--help/)
      .stdout(/--space-id/)
      .stdout(/--environment-id/)
      .stdout(/--management-token/)
      .stdout(/--content-file/)
      .stdout(/--content-model-only/)
      .stdout(/--skip-content-model/)
      .stdout(/--skip-locales/)
      .stdout(/--skip-content-publishing/)
      .stdout(/--upload-assets/)
      .stdout(/--assets-directory/)
      .stdout(/--error-log-file/)
      .stdout(/--host/)
      .stdout(/--proxy/)
      .stdout(/--raw-proxy/)
      .stdout(/--rate-limit/)
      .stdout(/-H, --header/)
      .stdout(/--config/)
      .end(done)
  })

  test("throws an error about missing dependent arguments, when passing '--upload-assets' but NOT '--assets-directory'", done => {
    app()
      // omit --assets directory
      .run(
        `--space-id
        mock-space-id
        --management-token
        mock-management-token
        --upload-assets
        --content-file __mocks__/mock-content-file.json`
      )
      .code(1) // Ensure the process exits with an error
      .stderr(/Missing dependent arguments/)
      .stderr(/upload-assets -> assets-directory/g)
      .end(done)
  })
})
