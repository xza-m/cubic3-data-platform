// frontend/tests/e2e-v2/p10-extraction-task-schedule.spec.ts
//
// P10 — 同步任务详情 调度 Tab happy path. The frontend entry is
// `/data-center/sync/tasks/*`; backend contract remains `/api/v1/extraction/tasks`.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'

const taskListItem = {
  id: 201,
  task_name: '学习行为同步',
  task_code: 'extract_learning_behaviour',
  dataset_id: 11,
  task_type: 'scheduled',
  is_active: true,
  last_run_at: '2026-04-20T02:00:00+08:00',
  last_run_status: 'success',
  created_at: '2026-04-01T08:00:00+08:00',
}

const tasksList = {
  items: [taskListItem],
  total: 1,
  page: 1,
  page_size: 100,
  total_pages: 1,
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/extraction/tasks?**', envelope(tasksList))
  await mockJsonRoute(page, '**/api/v1/extraction/tasks', envelope(tasksList))
})

test('P10 同步任务详情页渲染 @p10', async ({ page }) => {
  await gotoV2(page, '/data-center/sync/tasks/201')
  await expect(page).toHaveURL(/\/data-center\/sync\/tasks\/201/)
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('学习行为同步').first()).toBeVisible()
})

test('P10 同步任务调度保存走后端 PUT 契约 @p10', async ({ page }) => {
  let submittedMethod: string | null = null
  let submittedPayload: { schedule_config?: Record<string, unknown> } | null = null

  await page.route('**/api/v1/extraction/tasks/201', async (route) => {
    const req = route.request()
    if (req.method() !== 'PUT') return route.fallback()
    submittedMethod = req.method()
    submittedPayload = req.postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          ...taskListItem,
          select_fields: [],
          filter_conditions: {},
          sql_template: null,
          row_limit: 100000,
          schedule_config: submittedPayload?.schedule_config ?? null,
          subscription_config: null,
          created_by: 'codex_e2e',
          updated_at: '2026-04-21T09:00:00+08:00',
        }),
      ),
    })
  })

  await gotoV2(page, '/data-center/sync/tasks/201')
  await page.getByRole('button', { name: '调度' }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: '保存调度' }).click()

  await expect(page.getByText('已保存')).toBeVisible()
  expect(submittedMethod).toBe('PUT')
  expect(submittedPayload).toMatchObject({
    schedule_config: {
      cron: '0 8 * * *',
      enabled: true,
      timezone: 'Asia/Shanghai',
    },
  })
})
