import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    maxConcurrency: 3,
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      provider: 'v8',
      include: ['lib/**/*']
    },
    projects: [
      {
        extends: true,
        test: {
          name: { label: 'unit', color: 'green' },
          include: ['test/unit/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        extends: true,
        test: {
          name: { label: 'integration', color: 'magenta' },
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 1.5 * 60 * 1000 // 1.5min timeout
        }
      }
    ]
  }
})
