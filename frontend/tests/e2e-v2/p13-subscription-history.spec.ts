// frontend/tests/e2e-v2/p13-subscription-history.spec.ts
//
// P13 — 订阅详情触发历史 happy path。

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import cfgFx from './fixtures/config.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/channels**', envelope(cfgFx.channels))
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
        channel_type: 'feishu',
      },
    }),
  )
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/history**', envelope(cfgFx.subscription_deliveries))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/deliveries**', envelope(cfgFx.subscription_deliveries))
})

test('P13 订阅详情 渲染 header 动作与触发历史 @p13', async ({ page }) => {
  await gotoV2(page, '/config/subscriptions/401')
  await expect(page).toHaveURL(/\/config\/subscriptions\/401/)
  await expect(page.getByText('每日同步告警').first()).toBeVisible()

  const detailHeader = page.locator('main header').filter({ hasText: '每日同步告警' })
  await expect(detailHeader).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^立即触发此订阅$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^暂停$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^查看渠道$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^编辑$/ })).toHaveCount(1)
  await expect(detailHeader.getByRole('button', { name: /^删除$/ })).toHaveCount(1)
  await expect(page.locator('main').getByRole('button', { name: /^立即触发此订阅$/ })).toHaveCount(1)
  await expect(page.locator('main').getByRole('button', { name: /^查看渠道$/ })).toHaveCount(1)

  await page.getByRole('tab', { name: /^触发历史$/ }).click()
  await expect(page.getByText('共 1 条记录')).toBeVisible()
  const historyTable = page.getByRole('table')
  await expect(historyTable.getByText('应用执行完成')).toBeVisible()
  await expect(historyTable.getByText('成功')).toBeVisible()
  await expect(historyTable.getByText('sync_failed: 学习行为同步')).toBeVisible()
  await expect(historyTable.getByText('328 ms')).toBeVisible()
})

test('P13 新建订阅展示渠道下拉与事件选项 @p13', async ({ page }) => {
  await gotoV2(page, '/config/subscriptions/new')
  await expect(page).toHaveURL(/\/config\/subscriptions\/new/)
  await expect(page.getByRole('heading', { name: '新建订阅' })).toBeVisible()

  const channelSelect = page.locator('#new-sub-channel')
  await expect(channelSelect).toBeVisible()
  await expect(channelSelect).toContainText('运维飞书机器人 · 飞书 · 启用')

  const createButton = page.getByRole('button', { name: /^创建订阅$/ })
  await expect(createButton).toBeDisabled()
  await page.getByLabel('应用执行完成').check()
  await expect(createButton).toBeEnabled()
  await expect(page.getByLabel('数据提取失败')).toBeVisible()
})
