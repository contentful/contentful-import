import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'
import externaliseDependencies from '@itxch/vite-plugin-externalise-dependencies'

export default defineConfig({
  plugins: [
    dts({
      entryRoot: './',
      tsconfigPath: 'tsconfig.json'
    }),
    externaliseDependencies()
  ],

  build: {
    ssr: true,
    emptyOutDir: true,
    reportCompressedSize: true,

    target: 'es2023',
    modulePreload: {
      polyfill: false
    },
    commonjsOptions: {
      transformMixedEsModules: true
    },

    lib: {
      entry: {
        'lib/index': 'lib/index.ts',
        'lib/usageParams': 'lib/usageParams.ts'
      },
      formats: ['es', 'cjs']
    },

    rollupOptions: {
      output: {
        preserveModules: true,
        interop: (id) => {
          if (id === 'p-queue') return 'esModule'

          return 'default'
        }
      }
    }
  },

  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.{ts,tsx,js,jsx}'],
      exclude: ['node_modules/**']
    }
  }
})
