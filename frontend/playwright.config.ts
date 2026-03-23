import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseURL = process.env.DOMAIN_SMOKE_BASE_URL ?? 'http://127.0.0.1:3100'
const baseUrlObject = new URL(baseURL)
const managedLocalHosts = new Set(['127.0.0.1', 'localhost'])
const shouldManageLocalServer =
  !process.env.DOMAIN_SMOKE_BASE_URL || managedLocalHosts.has(baseUrlObject.hostname)
const managedServerPort = baseUrlObject.port || '3100'
const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests/e2e-node',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      animations: 'disabled',
      scale: 'css',
    },
  },
  fullyParallel: false,
  reporter: [['list']],
  webServer: shouldManageLocalServer
    ? {
        command: `npm run dev -- --host ${baseUrlObject.hostname} --port ${managedServerPort} --strictPort`,
        cwd: configDir,
        reuseExistingServer: false,
        timeout: 120_000,
        url: new URL('/login', baseURL).toString(),
      }
    : undefined,
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
