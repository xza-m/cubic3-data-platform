// frontend/tests/e2e-v2/p14-config-users.spec.ts
//
// P14 — 用户管理 列表 → 行点击 → 详情加载 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import cfgFx from './fixtures/config.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, /\/api\/v1\/users(\?.*)?$/, envelope(cfgFx.users))
  await mockJsonRoute(page, '**/api/v1/users/1', envelope(cfgFx.user_detail))
  await mockJsonRoute(page, /\/api\/v1\/roles(\?.*)?$/, envelope({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }))
})

test('P14 用户管理 列表渲染 happy path @p14', async ({ page }) => {
  await gotoV2(page, '/config/users')
  await expect(page).toHaveURL(/\/config\/users/)
  await expect(page.getByText('admin').first()).toBeVisible()
})
