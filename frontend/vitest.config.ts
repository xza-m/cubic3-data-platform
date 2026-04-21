import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/legacy'),
      '@v2': path.resolve(__dirname, './src/v2'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/v2/test/setup.ts'],
    globals: true,
    css: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: [
      'tests/**',
      'src/legacy/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/legacy/**',
        'src/v2/test/**',
        // Hook/component test helpers
        'src/v2/hooks/test-utils.tsx',
        // Untestable in unit (router/portal/visual heavy) — covered by E2E
        'src/v2/components/CommandPalette.tsx',
        'src/v2/components/ResourceListPage.tsx',
      ],
      // CI gate — keep these subtrees ≥ 80% on all four metrics.
      thresholds: {
        'src/v2/components/**/*.{ts,tsx}': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/v2/hooks/**/*.{ts,tsx}': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        'src/v2/lib/**/*.{ts,tsx}': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
})
