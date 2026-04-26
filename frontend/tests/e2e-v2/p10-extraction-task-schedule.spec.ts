// frontend/tests/e2e-v2/p10-extraction-task-schedule.spec.ts
//
// P10 — 抽取任务详情 调度 Tab happy path. The page hits
// `/api/v1/extraction/tasks` (NOT `/data-center/extraction-tasks`).

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'

const taskListItem = {
  id: 201,
  task_name: '学习行为抽取',
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

test('P10 抽取任务 详情页渲染 @p10', async ({ page }) => {
  await gotoV2(page, '/extraction-tasks/201')
  await expect(page).toHaveURL(/\/extraction\/tasks\/201/)
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('学习行为抽取').first()).toBeVisible()
})
