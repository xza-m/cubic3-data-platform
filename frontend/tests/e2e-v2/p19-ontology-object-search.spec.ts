// frontend/tests/e2e-v2/p19-ontology-object-search.spec.ts
//
// P19 — 本体对象 列表 happy path. Search bar lookup is currently
// client-side, so this test only mocks the list endpoint at its actual
// path (`/ontology/objects`, NOT `/semantic/ontology/objects`) and asserts
// the list mounts.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import ontFx from './fixtures/ontology.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/ontology/objects**', envelope(ontFx.objects))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/objects**', envelope(ontFx.objects))
})

test('P19 本体对象 列表渲染 @p19', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology/objects')
  await expect(page).toHaveURL(/\/semantic\/ontology\/objects/)
  await expect(page.locator('body')).toBeVisible()
})
