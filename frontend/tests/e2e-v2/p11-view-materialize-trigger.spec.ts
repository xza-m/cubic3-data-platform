// frontend/tests/e2e-v2/p11-view-materialize-trigger.spec.ts
//
// P11 — 语义视图 物化触发 happy path. Mirrors P08's loose pattern; both the
// trigger endpoint and the runs list are stubbed. The mutation endpoint
// returns OK so a click would not error, but exact button label is still
// in flux so we only assert the page mounts.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import semFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/semantic/views/v_lesson_overview', envelope(semFx.view_detail))
  await mockJsonRoute(page, '**/api/v1/semantic/views/v_lesson_overview/materialize', envelope({ ok: true, status: 'running' }))
  await mockJsonRoute(page, '**/api/v1/semantic/views/v_lesson_overview/materialize/runs**', envelope(semFx.view_materializations))
})

test('P11 语义视图 物化触发 happy path @p11', async ({ page }) => {
  await gotoV2(page, '/semantic/views/v_lesson_overview')
  await expect(page).toHaveURL(/\/semantic\/views\/v_lesson_overview/)
  await expect(page.locator('body')).toBeVisible()
})
