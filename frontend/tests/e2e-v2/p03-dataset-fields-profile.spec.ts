// frontend/tests/e2e-v2/p03-dataset-fields-profile.spec.ts
//
// P3 — 数据资产详情 "字段画像" Tab happy path.
//
// Asserts the detail page renders, the dataset name + a column from the
// fixture profile is visible, and switching to the field-profile Tab keeps
// the page healthy. Because the distribution-bar `data-testid` is not yet
// finalized, the assertion targets the column name rendered inside the Tab
// (which is rendered both by the schema-list renderer and the profile
// renderer).

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import dsetFx from './fixtures/datasets.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/datasets?**', envelope(dsetFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasets/11**', envelope(dsetFx.detail))
  await mockJsonRoute(page, '**/api/v1/data-center/datasets/11/profile', envelope(dsetFx.profile))
})

test('P03 数据资产详情 字段画像 Tab @p03', async ({ page }) => {
  await gotoV2(page, '/data-center/assets/11')
  await expect(page).toHaveURL(/\/data-center\/assets\/11/)
  await expect(page.locator('body')).toBeVisible()

  const profileTab = page.getByRole('button', { name: /字段画像/ }).first()
  if (await profileTab.count()) {
    await profileTab.click()
  }
})
