// frontend/tests/e2e-v2/p33-extraction-tasks-shell.spec.ts
//
// P33 — 提取任务模块壳回归。
//
// 覆盖：
//   - /extraction/tasks、/extraction/runs、/extraction/config 都归属提取模块。
//   - 任务列表行点击使用 AppShell 上下文面板，不再另起 PeekPanel。
//   - "立即执行" 真实调用后端 POST，并给出可见反馈。

import { test, expect } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from './helpers'
import exFx from './fixtures/extraction.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/extraction/tasks?**', envelope(exFx.tasks))
  await mockJsonRoute(page, '**/api/v1/extraction/tasks', envelope(exFx.tasks))
  await mockJsonRoute(page, '**/api/v1/extraction/runs?**', envelope(exFx.runs))
  await mockJsonRoute(page, '**/api/v1/extraction/runs', envelope(exFx.runs))
  await mockJsonRoute(
    page,
    '**/api/v1/extraction/health',
    envelope({
      status: 'healthy',
      components: {
        database: 'up',
        redis: 'up',
        task_queue: 'up',
        queue_info: { pending: 0, failed: 0 },
      },
    }),
  )
})

test('P33 提取任务子导航保持模块上下文 + 任务操作走上下文面板 @p33', async ({ page }) => {
  let executePostCount = 0
  await page.route('**/api/v1/extraction/tasks/201/execute', async (route) => {
    executePostCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({ run_id: 9003, job_id: 'job-9003' })),
    })
  })

  await gotoV2(page, '/extraction/tasks')
  await expect(page.getByRole('link', { name: '任务列表', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '执行记录', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '任务配置', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '执行记录', exact: true }).click()
  await expect(page).toHaveURL(/\/extraction\/runs$/)
  await expect(page.getByRole('link', { name: '任务列表', exact: true })).toBeVisible()
  await expect(page.getByText(/^#9001$/)).toBeVisible()

  await page.getByRole('link', { name: '任务配置', exact: true }).click()
  await expect(page).toHaveURL(/\/extraction\/config$/)
  await expect(page.getByText('队列健康').first()).toBeVisible()
  await expect(page.getByRole('link', { name: '任务列表', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '任务列表', exact: true }).click()
  await expect(page).toHaveURL(/\/extraction\/tasks$/)
  await page.getByText('学习行为抽取').click()
  await page.getByRole('button', { name: '展开上下文面板' }).click()

  await expect(page.getByText('选中任务')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '行预览' })).toHaveCount(0)

  await page.getByRole('button', { name: '立即执行' }).click()
  await expect.poll(() => executePostCount).toBe(1)
  await expect(page.getByText('已提交执行 · Run #9003')).toBeVisible()
})
