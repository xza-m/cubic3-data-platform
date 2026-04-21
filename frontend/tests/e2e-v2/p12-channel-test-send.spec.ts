// frontend/tests/e2e-v2/p12-channel-test-send.spec.ts
//
// P12 — 通知通道详情 发送测试 → 成功提示 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import cfgFx from './fixtures/config.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/channels?**', envelope(cfgFx.channels))
  await mockJsonRoute(page, '**/api/v1/channels/301', envelope(cfgFx.channel_detail))
  await mockJsonRoute(page, '**/api/v1/channels/301/test', envelope(cfgFx.channel_test_ok))
})

test('P12 通知通道 发送测试 成功提示 @p12', async ({ page }) => {
  await gotoV2(page, '/config/channels/301')
  await expect(page.getByText('运维飞书机器人').first()).toBeVisible()

  const testBtn = page.getByRole('button', { name: /发送测试|测试发送|测试/ }).first()
  if (await testBtn.count()) {
    await testBtn.click()
    await expect(page.getByText(/测试发送成功|发送成功|成功/).first()).toBeVisible()
  } else {
    test.fail(true, '"发送测试" button not found on /config/channels/301')
  }
})
