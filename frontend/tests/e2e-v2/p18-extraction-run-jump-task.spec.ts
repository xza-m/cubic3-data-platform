// frontend/tests/e2e-v2/p18-extraction-run-jump-task.spec.ts
//
// P18 — 同步 Run 详情页 happy path. The page hits `/api/v1/extraction/runs`
// (NOT `/data-center/extraction-runs`). The run detail uses a `<button>`
// (not `<a>`) labelled "查看所属任务" — the test only asserts the page
// mounts and the error message text from the seeded run is visible.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'

const failedRun = {
  id: 9001,
  task_id: 201,
  run_type: 'manual',
  triggered_by: 'admin',
  status: 'failed',
  start_time: '2026-04-21T02:00:00+08:00',
  end_time: '2026-04-21T02:00:30+08:00',
  duration_ms: 30000,
  row_count: null,
  result_file_path: null,
  result_size_mb: null,
  delivery_method: null,
  delivery_info: null,
  error_message: 'connection refused',
  created_at: '2026-04-21T02:00:00+08:00',
}

const runsList = {
  items: [failedRun],
  total: 1,
  page: 1,
  page_size: 100,
  total_pages: 1,
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/extraction/runs?**', envelope(runsList))
  await mockJsonRoute(page, '**/api/v1/extraction/runs', envelope(runsList))
})

test('P18 同步 Run 详情页渲染 @p18', async ({ page }) => {
  await gotoV2(page, '/data-center/sync/runs/9001')
  await expect(page).toHaveURL(/\/data-center\/sync\/runs\/9001/)
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('connection refused').first()).toBeVisible()
})
