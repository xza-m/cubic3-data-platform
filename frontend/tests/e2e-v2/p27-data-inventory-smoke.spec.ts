// frontend/tests/e2e-v2/p27-data-inventory-smoke.spec.ts
//
// P27 — 数据中心（连接 + 资产）首屏 smoke
// 补齐 Round 3 清理时迁移 e2e-node 遗留的缺口。
//
// 覆盖：
//   - /data-center/connections 连接管理能打开 + fixture 项可见
//   - /data-center/assets 资产目录能打开 + fixture 项可见
//   - /data-center/impact 影响分析能打开 + 准备度摘要可见
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

test('P27 连接管理首屏能打开并渲染 fixture 项 @p27', async ({ page }) => {
  await gotoV2(page, '/data-center/connections')
  await expect(page).toHaveURL(/\/data-center\/connections$/)
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await expect(page.getByText('生产 MaxCompute').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /数据连接/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: '新建连接' })).toBeVisible()
})

test('P27 连接管理每行可测试连接状态 @p27', async ({ page }) => {
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/test',
    envelope(dsFx.test_connection_ok),
  )
  await gotoV2(page, '/data-center/connections')

  const request = page.waitForRequest((req) =>
    req.method() === 'POST' && req.url().includes('/api/v1/data-center/datasources/1/test'),
  )
  await page.getByRole('row', { name: /教学 PostgreSQL/ }).getByRole('button', { name: '测试连接' }).click()

  await request
  await expect(page.getByText('连接测试通过')).toBeVisible()
})

test('P27 资产目录首屏能打开并渲染 fixture 项 @p27', async ({ page }) => {
  await gotoV2(page, '/data-center/assets')
  await expect(page).toHaveURL(/\/data-center\/assets$/)
  await expect(page.getByText('订单宽表').first()).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await expect(page.getByRole('link', { name: /数据资产/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: '登记资产' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建连接' })).toHaveCount(0)
})

test('P27 影响分析首屏能打开并呈现影响摘要 @p27', async ({ page }) => {
  await gotoV2(page, '/data-center/impact')
  await expect(page).toHaveURL(/\/data-center\/impact$/)
  await expect(page.getByRole('link', { name: /影响分析/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('订单宽表').first()).toBeVisible()
  await expect(page.getByText('语义中心 / BI / Data Agent')).toHaveCount(0)
  const contextPanel = page.locator('aside').filter({ hasText: '准备度摘要' })
  await expect(contextPanel.getByRole('heading', { name: '准备度摘要' })).toBeVisible()
  await expect(contextPanel.getByText('可建模资产')).toBeVisible()
  await expect(contextPanel.getByText('暂无阻断项，已同步资产可继续进入语义建设。')).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新建连接' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '登记资产' })).toHaveCount(0)
})
