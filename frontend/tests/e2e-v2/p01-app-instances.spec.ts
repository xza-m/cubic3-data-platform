// frontend/tests/e2e-v2/p01-app-instances.spec.ts
//
// P1 — 应用实例 list / detail happy path.
//
// W5.G unblock：`/apps/instances` 与 `/apps/instances/:id` 已在 routes.tsx
// 注册，对应页面 `Instances.tsx` / `InstanceDetail.tsx` 已存在。

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import instancesFx from './fixtures/instances.json' with { type: 'json' }
import appsFx from './fixtures/apps.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  // catchAll first so后注册的具体 mock 在 LIFO 下优先匹配
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/app-instances?**', envelope(instancesFx.list))
  await mockJsonRoute(page, '**/api/v1/app-instances/101', envelope(instancesFx.detail))
  await mockJsonRoute(page, '**/api/v1/app-executions?**', envelope(instancesFx.executions))
  await mockJsonRoute(page, '**/api/v1/apps?**', envelope(appsFx.list))
  await mockJsonRoute(page, '**/api/v1/apps/teaching_assistant', envelope(appsFx.detail))
})

test('P01 应用实例 列表→详情 happy path @p01', async ({ page }) => {
  await gotoV2(page, '/apps/instances')

  // List page renders header + row from fixture
  await expect(page.getByRole('heading', { name: '应用实例', exact: false }).or(
    page.getByText('应用实例', { exact: true }),
  ).first()).toBeVisible()
  await expect(page.getByText('教学助手 · 三年级', { exact: false })).toBeVisible()

  // 行内"详情"按钮跳转到详情页
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page).toHaveURL(/\/apps\/instances\/101$/)

  // 详情页 header 渲染实例名 + 状态 + health chip
  await expect(page.getByText('教学助手 · 三年级', { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/健康|healthy|health/i).first()).toBeVisible()
})
