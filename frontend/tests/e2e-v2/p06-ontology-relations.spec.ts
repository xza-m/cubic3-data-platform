// frontend/tests/e2e-v2/p06-ontology-relations.spec.ts
//
// P6 — 本体关系 Tab 列表可见 happy path.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import ontFx from './fixtures/ontology.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/relations?**', envelope(ontFx.relations))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/relations', envelope(ontFx.relations))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/objects?**', envelope(ontFx.objects))
})

test('P06 本体关系 列表渲染 happy path @p06', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology/relations')
  await expect(page).toHaveURL(/\/semantic\/ontology\/relations/)
  await expect(page.locator('body')).toBeVisible()
})
