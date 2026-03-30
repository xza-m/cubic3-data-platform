import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**'],
    },
  },
})
