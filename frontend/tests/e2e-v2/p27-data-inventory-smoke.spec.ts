// frontend/tests/e2e-v2/p27-data-inventory-smoke.spec.ts
//
// P27 — 数据中心（数据源 + 数据集）首屏 smoke
// 补齐 Round 3 清理时迁移 e2e-node 遗留的缺口。
//
// 覆盖：
//   - /data-center/datasources 列表页能打开 + fixture 项可见
//   - /data-center/datasets 列表页能打开 + fixture 项可见
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §5。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }
import dsetFx from './fixtures/datasets.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasources(\?.*)?$/,
    envelope(dsFx.list),
  )
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasets(\?.*)?$/,
    envelope(dsetFx.list),
  )
})

test('P27 数据源列表首屏能打开并渲染 fixture 项 @p27', async ({ page }) => {
  await gotoV2(page, '/data-center/datasources')
  await expect(page).toHaveURL(/\/data-center\/datasources$/)
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
})

test('P27 数据集列表首屏能打开并渲染 fixture 项 @p27', async ({ page }) => {
  await gotoV2(page, '/data-center/datasets')
  await expect(page).toHaveURL(/\/data-center\/datasets$/)
  await expect(page.getByText('订单宽表').first()).toBeVisible()
})
