// frontend/tests/e2e-v2/p23-dashboard-shell-smoke.spec.ts
//
// P23 — Dashboard / Shell 首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - 登录后默认 landing 能渲染 /dashboard
//   - KPI 卡片（数据源 / 数据资产 / 语义模型 / 平台查询）可见
//   - "运行关注" / "最近查询" / "平台健康度" 主卡片可见
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
    datasource_connectivity: 96,
    semantic_coverage: 82,
    query_success_rate: 99,
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
  await mockJsonRoute(
    page,
    '**/api/v1/auth/me',
    envelope({ user_id: 'feishu:tenant:on_demo', user_name: '轩志昂', roles: ['platform_admin', 'semantic_admin'] }),
  )
  // 偏好接口决定默认 landing —— 确保走 /dashboard 而不是其它偏好项。
  await mockJsonRoute(
    page,
    '**/api/v1/access/me/preferences',
    envelope({ default_landing: '/dashboard' }),
  )
})

test('P23 Dashboard 首屏 KPI + 侧卡片可见 @p23', async ({ page }) => {
  await gotoV2(page, '/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)

  // KPI 卡片
  await expect(page.getByText('数据源').first()).toBeVisible()
  await expect(page.getByText('数据资产').first()).toBeVisible()
  await expect(page.getByText('语义模型').first()).toBeVisible()
  await expect(page.getByText('平台查询').first()).toBeVisible()

  // 运行关注 + 最近查询 + 平台健康度 三个主工作区
  await expect(page.getByText('运行关注').first()).toBeVisible()
  await expect(page.getByText('最近查询').first()).toBeVisible()
  await expect(page.getByText('平台健康度').first()).toBeVisible()

  // 运行关注把关键状态提前，并提供可直接处理的入口。
  await expect(page.getByRole('link', { name: /数据源健康/ })).toHaveAttribute('href', '/data-center/connections')
  await expect(page.getByRole('link', { name: /语义覆盖/ })).toHaveAttribute('href', '/semantic/ontology')
  await expect(page.getByRole('link', { name: /查询活动/ })).toHaveAttribute('href', '/queries/history')
  await expect(page.getByRole('link', { name: /访问治理/ })).toHaveAttribute('href', '/config/access')

  // 来自 fixture 的最近查询内容
  await expect(page.getByText('SELECT count(*) FROM lessons').first()).toBeVisible()
  await expect(page.getByText('近 7 日查询成功率').first()).toBeVisible()
  await expect(page.getByText('99%').first()).toBeVisible()

  // 首页仍保留教程入口，但下沉为辅助入口，避免压过运行状态。
  await expect(page.getByRole('heading', { name: '开始学习' })).toBeVisible()
  await expect(page.getByText('教程下沉为辅助入口，主工作台优先呈现运行状态。')).toBeVisible()
  await expect(page.getByRole('link', { name: /自助查询入门/ })).toHaveAttribute('href', /\/tutorials\/self-service-query\.html$/)
  await expect(page.getByRole('link', { name: /语义建模工作流/ })).toHaveAttribute('href', /\/tutorials\/semantic-modeling\.html$/)
  await expect(page.getByRole('link', { name: /开发应用与推送/ })).toHaveAttribute('href', /\/tutorials\/app-development\.html$/)
  await expect(page.getByRole('link', { name: /权限治理闭环/ })).toHaveAttribute('href', /\/tutorials\/access-governance\.html$/)

  // Dashboard CTA 统一使用小尺寸按钮，避免和其它模块的跳转按钮不一致。
  await expect(page.getByRole('link', { name: /打开查询工作台/ })).toHaveClass(/btn-sm/)
  await expect(page.getByRole('link', { name: /本体工作台/ })).toHaveClass(/btn-sm/)

  // Dashboard 不展示仅对深层模块有价值的空壳区域，也不暴露后端接口路径。
  await expect(page.getByText('/api/v1/dashboard/overview')).toHaveCount(0)
  await expect(page.getByText('当前模块未提供上下文')).toHaveCount(0)
  await expect(page.getByText('上下文面板')).toHaveCount(0)
  await expect(page.getByText('平台健康度与最近活动')).toHaveCount(0)

  // 顶栏保留个人入口，设置入口只保留左下角一个，避免重复心智。
  await expect(page.getByRole('button', { name: '个人信息' })).toBeVisible()
  await expect(page.getByRole('button', { name: '我的偏好' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '历史' })).toBeVisible()
  await expect(page.getByRole('button', { name: '变更' })).toBeVisible()
  await expect(page.getByRole('button', { name: '通知' })).toBeVisible()
})

test('P23 顶栏个人入口打开个人信息页 @p23', async ({ page }) => {
  await gotoV2(page, '/dashboard')

  await page.getByRole('button', { name: '个人信息' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByRole('heading', { name: '个人信息' })).toBeVisible()
  await expect(page.getByText('轩志昂').first()).toBeVisible()
  await expect(page.getByText('platform_admin').first()).toBeVisible()
})

test('P23 Dashboard 根路径按偏好重定向到 /dashboard @p23', async ({ page }) => {
  await gotoV2(page, '/')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('平台健康度').first()).toBeVisible()
})
