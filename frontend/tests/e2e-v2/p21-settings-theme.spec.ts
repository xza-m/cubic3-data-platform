// frontend/tests/e2e-v2/p21-settings-theme.spec.ts
//
// P21 — 设置页 切换主题 → dark class 生效 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, prepareV2Page, envelope } from './helpers'
import prefFx from './fixtures/preferences.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)

  let current = { ...prefFx.default }
  await page.route('**/api/v1/users/me/preferences', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() ?? '{}')
      current = { ...current, ...body, updated_at: new Date().toISOString() }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(current)),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(current)),
    })
  })
})

test('P21 设置 切换暗色主题 → dark class 生效 @p21', async ({ page }) => {
  await gotoV2(page, '/settings')

  await expect(page.getByText(/主题|theme/i).first()).toBeVisible()

  await page.getByRole('button', { name: /^深色$/ }).click()

  const saveBtn = page.getByRole('button', { name: '保存偏好' })
  await saveBtn.click()

  await expect(page.locator('html.dark, html[data-theme="dark"]')).toHaveCount(1, { timeout: 5_000 })
})
