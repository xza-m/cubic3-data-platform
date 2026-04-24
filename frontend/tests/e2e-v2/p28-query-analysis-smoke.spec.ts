// frontend/tests/e2e-v2/p28-query-analysis-smoke.spec.ts
//
// P28 — 查询中心首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - /queries（QueryConsole）能打开
//   - 左侧数据源 sidebar + 右上角「执行」按钮可见
//   - fixture 数据源在 sidebar 可见
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §6。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  // QueryConsole 侧栏依赖 useDatasourcesForConsole → /data-center/datasources?page=1&page_size=100
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasources(\?.*)?$/,
    envelope(dsFx.list),
  )
})

test('P28 查询控制台首屏能打开并渲染核心区域 @p28', async ({ page }) => {
  await gotoV2(page, '/queries')
  await expect(page).toHaveURL(/\/queries$/)

  // 侧栏"数据源"标题 + fixture 数据源名称
  await expect(page.getByText('数据源').first()).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  // 右上角「执行」按钮
  const runBtn = page.getByRole('button', { name: /执行/ }).first()
  await expect(runBtn).toBeVisible()
})
