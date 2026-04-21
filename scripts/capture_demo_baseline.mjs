// scripts/capture_demo_baseline.mjs
// Captures fullPage screenshots of the platform-redesign demo for use as
// the Round-2 design contract baseline.

import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Use playwright from frontend/node_modules
const playwrightPath = path.resolve(__dirname, '../frontend/node_modules/playwright')
const { chromium } = await import(playwrightPath + '/index.mjs')

const BASE_URL = 'http://127.0.0.1:3010'
const OUTPUT_DIR = path.resolve(
  __dirname,
  '../docs/superpowers/plans/2026-04-20-platform-redesign/design-baseline'
)
const VIEWPORT = { width: 1440, height: 900 }
const SETTLE_MS = 1000

// Routes extracted from tmp/platform-redesign/src/routes.tsx
// Parameterised routes use representative seed values:
//   :id → 1, :name → demo_cube, :code → demo_app, :instanceId → 1
const ROUTES = [
  '/login',
  '/dashboard',
  '/data-center/datasources',
  '/data-center/datasources/1',
  '/data-center/datasets',
  '/data-center/datasets/1',
  '/data-center/datasets/register',
  '/data-center/datasets/register/table',
  '/data-center/datasets/register/file',
  '/extraction-tasks',
  '/extraction-tasks/1',
  '/extraction/config',
  '/extraction/runs',
  '/extraction/runs/1',
  '/data-chat',
  '/queries',
  '/queries/visual',
  '/queries/my',
  '/queries/my/1',
  '/queries/history',
  '/queries/history/1',
  '/queries/scheduled',
  '/queries/scheduled/1',
  '/apps',
  '/apps/demo_app',
  '/executions',
  '/executions/1',
  '/config/channels',
  '/config/channels/1',
  '/config/subscriptions',
  '/config/subscriptions/1',
  '/semantic/ontology',
  '/semantic/ontology/objects',
  '/semantic/ontology/objects/new',
  '/semantic/ontology/objects/demo_cube',
  '/semantic/ontology/metrics',
  '/semantic/ontology/relations',
  '/semantic/ontology/governance',
  '/semantic/workbench',
  '/semantic/cubes',
  '/semantic/cubes/new',
  '/semantic/cubes/demo_cube/edit',
  '/semantic/cubes/demo_cube',
  '/semantic/domains',
  '/semantic/domains/1',
  '/semantic/views/demo_cube',
]

function pathToFilename(routePath) {
  // /data-center/datasources/1 → data-center__datasources__1.png
  return routePath.replace(/^\//, '').replace(/\//g, '__').replace(/^$/, 'root') + '.png'
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: VIEWPORT })

  // Inject auth token before any page script runs, so ProtectedRoute sees it
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'demo-baseline-token')
  })

  const page = await context.newPage()

  // Mock all API calls so the axios 401 interceptor never fires and clears the token.
  // Return a minimal success envelope that won't crash eager destructuring.
  const mockApiResponse = JSON.stringify({
    code: 0,
    message: 'ok',
    data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 },
  })
  await page.route('**/api/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockApiResponse,
    })
  })

  let succeeded = 0
  let failed = 0
  let totalBytes = 0
  const failedRoutes = []

  for (const route of ROUTES) {
    const filename = pathToFilename(route)
    const outPath = path.join(OUTPUT_DIR, filename)
    try {
      await page.goto(`${BASE_URL}${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      await sleep(SETTLE_MS)

      await page.screenshot({
        path: outPath,
        fullPage: true,
      })

      const { size } = fs.statSync(outPath)
      totalBytes += size
      succeeded++
      console.log(`  ✓  ${route}  →  ${filename}  (${(size / 1024).toFixed(0)} KB)`)
    } catch (err) {
      failed++
      failedRoutes.push(route)
      console.error(`  ✗  ${route}  →  ${err.message.split('\n')[0]}`)
    }
  }

  await browser.close()

  const totalKB = (totalBytes / 1024).toFixed(0)
  const totalMB = (totalBytes / 1024 / 1024).toFixed(2)
  console.log('\n─────────────────────────────────────────')
  console.log(`Routes attempted : ${ROUTES.length}`)
  console.log(`Succeeded        : ${succeeded}`)
  console.log(`Failed           : ${failed}`)
  console.log(`Total disk usage : ${totalKB} KB  (${totalMB} MB)`)
  if (failedRoutes.length) {
    console.log('Failed routes    :')
    failedRoutes.forEach((r) => console.log('  ' + r))
  }
  console.log(`Output dir       : ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
