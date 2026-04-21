// frontend/tests/e2e-v2/p22-instance-health.spec.ts
//
// P22 — 应用详情 Header health chip 可见 happy path.
//
// W5.G unblock：HealthChip 组件落地，AppDetail / InstanceDetail header
// 在 enabled chip 旁渲染 health chip。后端 health 字段缺省时显示 "健康未知"。

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import appsFx from './fixtures/apps.json' with { type: 'json' }
import instancesFx from './fixtures/instances.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/apps/teaching_assistant', envelope(appsFx.detail))
  await mockJsonRoute(page, '**/api/v1/app-executions?**', envelope(instancesFx.executions))
})

test('P22 应用详情 health chip 可见 @p22', async ({ page }) => {
  await gotoV2(page, '/apps/teaching_assistant')
  await expect(page.getByText('教学助手').first()).toBeVisible()
  await expect(page.getByText(/健康|healthy|health/i).first()).toBeVisible()
})
