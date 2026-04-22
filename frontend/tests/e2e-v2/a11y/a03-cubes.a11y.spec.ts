// frontend/tests/e2e-v2/a11y/a03-cubes.a11y.spec.ts
//
// W5.C — A03 axe-core scan for `/semantic/cubes`.
// Covers grid view + after focusing the first card.

import { test, expect } from '@playwright/test'
import {
  envelope,
  expectNoSeriousA11yViolations,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

const cubesList = {
  cubes: [
    {
      name: 'fct_lesson',
      title: '课程事实',
      datasource_name: '教学 PostgreSQL',
      domain_name: '教学域',
      status: 'active',
      dimensions_count: 6,
      measures_count: 4,
      updated_at: '2026-04-15T08:00:00+08:00',
    },
    {
      name: 'fct_exam',
      title: '考试事实',
      datasource_name: '教学 PostgreSQL',
      domain_name: '教学域',
      status: 'draft',
      dimensions_count: 5,
      measures_count: 3,
      updated_at: '2026-04-10T08:00:00+08:00',
    },
  ],
  total: 2,
  page: 1,
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/semantic/cubes**', envelope(cubesList))
})

test('A03 Cube 列表（卡片视图）无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/semantic/cubes')

  await expect(page.getByText('课程事实')).toBeVisible()

  await expectNoSeriousA11yViolations(page)

  // Move focus to the first card to verify focus-visible styles + ARIA
  // metadata are also clean (cards are interactive).
  await page.keyboard.press('Tab')
  await expectNoSeriousA11yViolations(page)
})
