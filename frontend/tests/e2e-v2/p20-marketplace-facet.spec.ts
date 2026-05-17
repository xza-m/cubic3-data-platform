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

test('P20 应用市场卡片网格按内容自然排列 @p20', async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1152 })
  const manyApps = Array.from({ length: 7 }, (_, index) => {
    const source = appsFx.list[index % appsFx.list.length]
    return {
      ...source,
      id: index + 10,
      code: `layout_app_${index + 1}`,
      name: `布局应用 ${index + 1}`,
      category: index % 2 === 0 ? '教学' : '运营',
      instance_count: index,
    }
  })
  await mockJsonRoute(page, '**/api/v1/apps?**', envelope(manyApps))
  await mockJsonRoute(
    page,
    '**/api/v1/apps/categories',
    envelope([
      { category: '教学', display_name: '教学', app_count: 4 },
      { category: '运营', display_name: '运营', app_count: 3 },
    ]),
  )

  await gotoV2(page, '/apps')

  const cards = page.getByTestId('marketplace-app-card')
  await expect(cards).toHaveCount(7)
  const firstRow = await cards.nth(0).boundingBox()
  const secondRow = await cards.nth(3).boundingBox()
  const thirdRow = await cards.nth(6).boundingBox()
  expect(firstRow).not.toBeNull()
  expect(secondRow).not.toBeNull()
  expect(thirdRow).not.toBeNull()
  expect((secondRow?.y ?? 0) - (firstRow?.y ?? 0)).toBeLessThan(190)
  expect((thirdRow?.y ?? 0) - (secondRow?.y ?? 0)).toBeLessThan(190)
})
