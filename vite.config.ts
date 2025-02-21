import dts from 'vite-plugin-dts'
import { UserConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { readFileSync } from 'fs'

const externaliseDependencies = () => {
  return {
    name: 'externalise-dependencies',
    config: async ({ root }: UserConfig): Promise<UserConfig | null | void> => {
      const rootDir = root || process.cwd()
      const packageJson = readFileSync(`${rootDir}/package.json`, 'utf-8')
      const deps = Object.keys(JSON.parse(packageJson).dependencies)

      return {
        build: {
          rollupOptions: {
            external: [...deps]
          }
        }
      }
    }
  }
}

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
