// frontend/tests/e2e-v2/p02-datasource-test-connection.spec.ts
//
// P2 — 连接详情页"测试连接"按钮 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1/test', envelope(dsFx.test_connection_ok))
})

test('P02 连接详情 测试连接 → 成功提示 @p02', async ({ page }) => {
  await gotoV2(page, '/data-center/connections/1')

  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  const testBtn = page.getByRole('button', { name: /测试连接/ })
  await expect(testBtn).toBeVisible()
  await testBtn.click()

  await expect(page.getByText(/连接成功|测试成功|成功/).first()).toBeVisible()
})
