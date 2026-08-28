import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['lib/index.ts', 'lib/usageParams.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  noExternal: ['contentful-batch-libs', 'lodash-es'],
  platform: 'node',
  cjsInterop: true,
  banner (ctx) {
    if (ctx.format !== 'cjs') {
      return {}
    }
    return {
      js: `"use strict";
if (!globalThis.__contentfulImportCjsDeprecationWarned) {
  globalThis.__contentfulImportCjsDeprecationWarned = true;
  console.warn('[contentful-import] Deprecation notice: the next major version of this package will be ESM-only and will drop require() support. Please migrate consuming code to ES modules (import) ahead of that release.');
}`
    }
  },
  esbuildOptions (options, context) {
    if (context.format === 'esm') {
      options.banner = {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
      }
    }
    if (context.format === 'cjs') {
      options.footer = {
        js: 'module.exports = module.exports.default || module.exports;'
      }
    }
  }
})
