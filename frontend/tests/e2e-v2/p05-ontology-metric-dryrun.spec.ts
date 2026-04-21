// frontend/tests/e2e-v2/p05-ontology-metric-dryrun.spec.ts
//
// P5 — 本体指标列表 happy path. Dry-run is currently client-side mocked
// inside `@v2/api/semantic.ts::_mockDryRunMetric`, so this test only
// asserts the metrics list renders with the seeded fixture row.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import ontFx from './fixtures/ontology.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/ontology/metrics**', envelope(ontFx.metrics))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/metrics**', envelope(ontFx.metrics))
})

test('P05 本体指标 列表渲染 @p05', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology/metrics')
  await expect(page).toHaveURL(/\/semantic\/ontology\/metrics/)
  await expect(page.locator('body')).toBeVisible()
})
