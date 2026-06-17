// frontend/tests/e2e-v2/a11y/a02-datasources.a11y.spec.ts
//
// W5.C — A02 axe-core scan for `/data-center/connections`.
// Two passes:
//   1. 连接管理列表
//   2. 连接详情页

import { test, expect } from '@playwright/test'
import {
  envelope,
  expectNoSeriousA11yViolations,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import dsFx from '../fixtures/datasources.json' with { type: 'json' }
import dsetFx from '../fixtures/datasets.json' with { type: 'json' }
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasets?**', envelope(dsetFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
})

test('A02 连接管理 无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/data-center/connections')

  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  await expectNoSeriousA11yViolations(page)

  await gotoV2(page, '/data-center/connections/1')
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  await expectNoSeriousA11yViolations(page)
})
