// frontend/tests/e2e-v2/a11y/a02-datasources.a11y.spec.ts
//
// W5.C — A02 axe-core scan for `/data-center/datasources`.
// Two passes:
//   1. List view (no peek)
//   2. Peek panel open — scoped scan to `[role="complementary"]`
//      (PeekPanel renders as <aside role="complementary" aria-label="行预览">)

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
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
})

test('A02 数据源列表 无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/data-center/datasources')

  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  await expectNoSeriousA11yViolations(page)

  // Open the peek panel by clicking the first row, then re-scan with the
  // include selector scoped to the slide-over so we catch dialog-only issues.
  await page.getByText('教学 PostgreSQL').first().click()
  const peek = page.getByRole('complementary', { name: '行预览' })
  await expect(peek).toBeVisible()

  await expectNoSeriousA11yViolations(page, {
    include: ['[role="complementary"][aria-label="行预览"]'],
  })
})
