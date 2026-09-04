import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 69,
        lines: 70,
      },
    },
  },
})
