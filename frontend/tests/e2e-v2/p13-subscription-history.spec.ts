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
  await mockJsonRoute(
    page,
    '**/api/v1/subscriptions/401',
    envelope({
      ...cfgFx.subscription_detail,
      app_instance_id: 101,
      channel_id: 301,
      event_types: ['app.execution.completed'],
      filter_conditions: {},
      delivery_config: {},
      description: null,
      created_by: 'ou_test_user',
      app_instance: {
        id: 101,
        name: 'DataAgent 智能问答',
        app_code: 'data_agent',
        app_name: 'DataAgent 智能问答',
      },
      channel: {
        id: 301,
        name: '运维飞书机器人',
        channel_type: 'lark',
      },
    }),
  )
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/history**', envelope(cfgFx.subscription_deliveries))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/deliveries**', envelope(cfgFx.subscription_deliveries))
})

test('P13 订阅详情 渲染并把动作收敛到 header @p13', async ({ page }) => {
  await gotoV2(page, '/config/subscriptions/401')
  await expect(page).toHaveURL(/\/config\/subscriptions\/401/)
  await expect(page.getByText('每日抽取告警').first()).toBeVisible()

  const detailHeader = page.locator('header').filter({ hasText: '每日抽取告警' })
  await expect(detailHeader.getByRole('button', { name: /^触发$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^暂停$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^渠道$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^编辑$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^删除$/ })).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^立即触发此订阅$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^查看渠道$/ })).toHaveCount(0)
})
