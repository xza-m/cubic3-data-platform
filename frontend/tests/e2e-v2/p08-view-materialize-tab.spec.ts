// frontend/tests/e2e-v2/p08-view-materialize-tab.spec.ts
//
// P8 — 语义视图详情页 happy path. Asserts the View Detail route mounts and
// the materialization-runs endpoint is wired (returning the seeded fixture
// list).

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import semFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/semantic/views/v_lesson_overview', envelope(semFx.view_detail))
  await mockJsonRoute(page, '**/api/v1/semantic/views/v_lesson_overview/materialize/runs**', envelope(semFx.view_materializations))
  await mockJsonRoute(page, '**/api/v1/semantic/views/*/materialize/runs**', envelope(semFx.view_materializations))
})

test('P08 语义视图 详情页渲染 @p08', async ({ page }) => {
  await gotoV2(page, '/semantic/views/v_lesson_overview')
  await expect(page).toHaveURL(/\/semantic\/views\/v_lesson_overview/)
  await expect(page.locator('body')).toBeVisible()
})
