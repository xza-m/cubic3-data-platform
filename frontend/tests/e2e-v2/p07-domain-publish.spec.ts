// frontend/tests/e2e-v2/p07-domain-publish.spec.ts
//
// P7 — 业务上下文资产画布 happy path. The 发布 button + 发布历史 抽屉 live on
// `DomainCanvas`, but the publish history endpoint is currently mocked
// client-side in `@v2/api/semantic.ts::_mockDomainPublishHistory`, so this
// test only asserts navigation succeeds and the canvas shell mounts.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import semFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/semantic/domains?**', envelope(semFx.domains))
  await mockJsonRoute(page, '**/api/v1/semantic/domains', envelope(semFx.domains))
  await mockJsonRoute(page, /\/api\/v1\/semantic\/domains\/domain_teaching(?:\?.*)?$/, envelope(semFx.domain_detail))
  await mockJsonRoute(page, /\/api\/v1\/semantic\/domains\/domain_teaching\/canvas(?:\?.*)?$/, envelope(semFx.domain_canvas))
  await mockJsonRoute(page, /\/api\/v1\/semantic\/domains\/domain_teaching\/publish(?:\?.*)?$/, envelope({ ok: true }))
})

test('P07 业务上下文资产画布渲染 @p07', async ({ page }) => {
  await gotoV2(page, '/semantic/domains/domain_teaching')
  await expect(page).toHaveURL(/\/semantic\/domains\/domain_teaching/)
  await expect(page.getByText('资产画布', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '业务上下文' })).toBeVisible()
  await expect(page.locator('body')).toBeVisible()
})
