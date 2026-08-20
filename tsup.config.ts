import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['lib/index.ts', 'lib/usageParams.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  noExternal: ['contentful-batch-libs', 'lodash', 'date-fns'],
  platform: 'node',
  cjsInterop: true,
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
