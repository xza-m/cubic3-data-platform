// frontend/tests/e2e-v2/p20-marketplace-facet.spec.ts
//
// P20 — 应用市场 选 facet "教学" → 列表过滤 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import appsFx from './fixtures/apps.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/apps?**', envelope(appsFx.list))
  await mockJsonRoute(
    page,
    '**/api/v1/apps/categories',
    envelope(
      appsFx.categories.map((category) => ({
        category,
        display_name: category,
        app_count: appsFx.list.filter((app) => app.category === category).length,
      })),
    ),
  )
})

test('P20 应用市场 facet "教学" 过滤 @p20', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await gotoV2(page, '/apps')

  await expect(page.getByText('教学助手')).toBeVisible()
  await expect(page.getByText('运营驾驶舱')).toBeVisible()

  await page.getByRole('button', { name: /^教学$/ }).first().click()

  await expect(page.getByText('教学助手')).toBeVisible()
  await expect(page.getByText('运营驾驶舱')).toHaveCount(0)
  expect(errors, `pageerror:\n${errors.join('\n')}`).toEqual([])
})
