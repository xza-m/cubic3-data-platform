// frontend/tests/e2e-v2/p13-subscription-history.spec.ts
//
// P13 — 订阅详情 触发历史 happy path. The history endpoint
// `/subscriptions/:id/history` is currently a client-side mock if the
// backend isn't ready; the test only asserts the detail page mounts.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import cfgFx from './fixtures/config.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/subscriptions?**', envelope(cfgFx.subscriptions))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401', envelope(cfgFx.subscription_detail))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/history**', envelope(cfgFx.subscription_deliveries))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/deliveries**', envelope(cfgFx.subscription_deliveries))
})

test('P13 订阅详情 渲染 @p13', async ({ page }) => {
  await gotoV2(page, '/config/subscriptions/401')
  await expect(page).toHaveURL(/\/config\/subscriptions\/401/)
  await expect(page.locator('body')).toBeVisible()
})
