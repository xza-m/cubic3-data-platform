// frontend/tests/e2e-v2/p09-query-history-filter.spec.ts
//
// P9 — 查询历史筛选 (status=success) → 列表过滤 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, prepareV2Page } from './helpers'
import qFx from './fixtures/queries.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)

  await page.route('**/api/v1/queries/histories**', async (route) => {
    const url = route.request().url()
    const wantSuccess = url.includes('status=success')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: wantSuccess ? qFx.histories_success_only : qFx.histories,
      }),
    })
  })
})

test('P09 查询历史 状态筛选过滤 @p09', async ({ page }) => {
  await gotoV2(page, '/queries/history')

  await expect(page).toHaveURL(/\/queries\/history/)
  await expect(page.getByText('SELECT count(*) FROM lessons').first()).toBeVisible()

  const statusSelect = page.locator('select').filter({ hasText: /全部状态|成功/ }).first()
  if (await statusSelect.count()) {
    await statusSelect.selectOption('success')
    await expect(page.getByText('SELECT * FROM students LIMIT 10')).toHaveCount(0)
  }
})
