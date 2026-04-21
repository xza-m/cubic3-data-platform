// frontend/tests/e2e-v2/a11y/a05-settings.a11y.spec.ts
//
// W5.C — A05 axe-core scan for `/settings`.
// Form-heavy page (segmented controls + numeric input + path input).

import { test, expect } from '@playwright/test'
import {
  envelope,
  expectNoSeriousA11yViolations,
  gotoV2,
  installApiCatchAll,
  prepareV2Page,
} from '../helpers'
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await page.route('**/api/v1/users/me/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(prefFx.default)),
    })
  })
})

test('A05 设置页 无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/settings')

  await expect(page.getByText(/主题|theme/i).first()).toBeVisible()

  await expectNoSeriousA11yViolations(page, { disableRules: ['color-contrast'] })
})
