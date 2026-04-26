// frontend/tests/e2e-v2/p23-dashboard-shell-smoke.spec.ts
//
// P23 — Dashboard / Shell 首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - 登录后默认 landing 能渲染 /dashboard
//   - KPI 卡片（数据源 / 数据集 / 语义模型 / 今日查询）可见
//   - "最近查询" / "平台健康度" 两个主卡片可见
//   - 顶部导航到「查询工作台」CTA 可点
//
// 本 spec 不覆盖深度交互；用途是"壳能起、默认首屏不炸"。
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §1。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'

const OVERVIEW_FIXTURE = {
  stats: {
    datasource_total: 12,
    dataset_total: 48,
    semantic_model_total: 6,
    today_query_count: 321,
  },
  trends: {
    datasource_month_delta: 2,
    dataset_week_delta: 5,
    query_count_week: 1800,
  },
  health: {
    datasource_connectivity: 0.96,
    semantic_coverage: 0.82,
    query_success_rate: 0.99,
  },
  recent_queries: [
    {
      id: 9001,
      name: 'SELECT count(*) FROM lessons',
      datasource_name: '教学 PostgreSQL',
      status: 'success',
      executed_at: '2026-04-21T09:00:00+08:00',
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/dashboard/overview', envelope(OVERVIEW_FIXTURE))
  // 偏好接口决定默认 landing —— 确保走 /dashboard 而不是其它偏好项。
  await mockJsonRoute(
    page,
    '**/api/v1/users/me/preferences',
    envelope({ default_landing: '/dashboard' }),
  )
})

test('P23 Dashboard 首屏 KPI + 侧卡片可见 @p23', async ({ page }) => {
  await gotoV2(page, '/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)

  // KPI 卡片
  await expect(page.getByText('数据源').first()).toBeVisible()
  await expect(page.getByText('数据集').first()).toBeVisible()
  await expect(page.getByText('语义模型').first()).toBeVisible()
  await expect(page.getByText('今日查询').first()).toBeVisible()

  // 最近查询 + 平台健康度 两个次要卡片
  await expect(page.getByText('最近查询').first()).toBeVisible()
  await expect(page.getByText('平台健康度').first()).toBeVisible()

  // 来自 fixture 的最近查询内容
  await expect(page.getByText('SELECT count(*) FROM lessons').first()).toBeVisible()

  // Dashboard 不展示仅对深层模块有价值的空壳区域，也不暴露后端接口路径。
  await expect(page.getByText('/api/v1/dashboard/overview')).toHaveCount(0)
  await expect(page.getByText('当前模块未提供上下文')).toHaveCount(0)
  await expect(page.getByText('上下文面板')).toHaveCount(0)
  await expect(page.getByText('平台健康度与最近活动')).toHaveCount(0)

  // 用户确认 topbar 暂时保留现状。
  await expect(page.getByRole('button', { name: '历史' })).toBeVisible()
  await expect(page.getByRole('button', { name: '变更' })).toBeVisible()
  await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
})

test('P23 Dashboard 根路径按偏好重定向到 /dashboard @p23', async ({ page }) => {
  await gotoV2(page, '/')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('平台健康度').first()).toBeVisible()
})
