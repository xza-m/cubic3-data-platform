// frontend/tests/e2e-v2/p28-query-analysis-smoke.spec.ts
//
// P28 — 查询中心首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - /queries（QueryConsole）能打开
//   - 单一数据目录 + 右上角「执行」按钮可见
//   - 选中数据源后加载底层数据库表
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
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema',
    envelope({
      datasource_id: 1,
      databases: ['teaching'],
      fetched_at: '2026-04-26T10:00:00+08:00',
    }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema/teaching',
    envelope({
      datasource_id: 1,
      database: 'teaching',
      tables: [
        { table_name: 'lesson_progress', comment: '课程进度', row_count: 120 },
        { table_name: 'students', comment: '学生', row_count: 36 },
      ],
      fetched_at: '2026-04-26T10:00:01+08:00',
    }),
  )
})

test('P28 查询控制台首屏能打开并渲染核心区域 @p28', async ({ page }) => {
  await gotoV2(page, '/queries')
  await expect(page).toHaveURL(/\/queries$/)

  // 单一数据目录 + fixture 数据源名称
  await expect(page.getByText('数据目录').first()).toBeVisible()
  await expect(page.getByTestId('query-resource-source-1').getByText('教学 PostgreSQL')).toBeVisible()
  await expect(page.getByText('lesson_progress').first()).toBeVisible()
  await expect(page.getByText('点击填入查询')).toHaveCount(0)
  await expect(page.getByText('课程进度')).toHaveCount(0)

  await page.getByTestId('query-resource-table-lesson_progress').hover()
  await expect(page.getByRole('tooltip')).toContainText('课程进度')

  // 数据源选择收敛到左侧资源栏，避免工具栏重复筛选和右侧上下文挤压编辑器。
  await expect(page.getByTestId('query-resource-source-select')).toBeVisible()
  await expect(page.getByText('执行上下文')).toHaveCount(0)
  await expect(page.getByText('/api/v1/queries/execute')).toHaveCount(0)

  // 右上角「执行」按钮
  const runBtn = page.getByRole('button', { name: /执行/ }).first()
  await expect(runBtn).toBeVisible()
})

test('P28 查询控制台默认 SQL 可直接执行 @p28', async ({ page }) => {
  let sentSql: string | null = null
  await page.route('**/api/v1/queries/execute', async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    const body = req.postDataJSON() as { sql_query?: string }
    sentSql = body.sql_query ?? null
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          columns: ['hello'],
          data: [{ hello: 1 }],
          row_count: 1,
          execution_time_ms: 12,
        }),
      ),
    })
  })

  await gotoV2(page, '/queries')
  await expect(page.getByTestId('query-resource-source-1').getByText('教学 PostgreSQL')).toBeVisible()
  await page.getByRole('button', { name: /执行/ }).first().click()

  await expect(page.getByText('1 行').first()).toBeVisible()
  expect(sentSql).toBe('SELECT 1 AS hello')
})
