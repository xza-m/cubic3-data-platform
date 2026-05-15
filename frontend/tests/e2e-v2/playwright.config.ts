// frontend/tests/e2e-v2/playwright.config.ts
//
// Playwright config dedicated to the v2 (redesign) frontend.
// Completely independent from the legacy `playwright.config.ts` so we never
// risk launching the wrong dev server or pointing the wrong baseURL.
//
// Notes:
// - baseURL points at the v2 dev server (port 3001).
// - webServer launches `npm run dev:v2` with VITE_AUTH_BYPASS=1 so the
//   ProtectedRoute is permissive and tests do not need to drive a login flow.
// - reuseExistingServer is false in CI (CI=true) so each job gets a fresh
//   server; locally we reuse to keep iteration fast.
// - All P1~P22 specs mock `/api/v1/**` via `page.route`, so the dev server only
//   needs to serve the SPA shell; the proxy target is irrelevant.

import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseURL = process.env.V2_E2E_BASE_URL ?? 'http://127.0.0.1:3001'
const baseUrlObject = new URL(baseURL)
const managedServerPort = baseUrlObject.port || '3001'
const configDir = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(configDir, '..', '..')

const isCI = !!process.env.CI
const useExternalServer = process.env.V2_E2E_EXTERNAL_SERVER === '1'
const managedWebServer = {
  command: `npm run dev:v2 -- --host ${baseUrlObject.hostname} --port ${managedServerPort} --strictPort`,
  cwd: frontendDir,
  reuseExistingServer: !isCI,
  timeout: 120_000,
  url: baseURL,
  env: {
    VITE_AUTH_BYPASS: '1',
  },
}

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.resolve(frontendDir, 'playwright-report-v2'), open: 'never' }],
  ],
  ...(useExternalServer ? {} : { webServer: managedWebServer }),
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    timezoneId: 'Asia/Shanghai',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
