// frontend/tests/e2e-v2/a11y/a01-dashboard.a11y.spec.ts
//
// W5.C — A01 axe-core scan for the Dashboard (`/dashboard`).
// First-impression page; gate is "no serious/critical violations".

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

const dashboardOverview = {
  stats: {
    datasource_total: 12,
    dataset_total: 87,
    semantic_model_total: 34,
    today_query_count: 218,
  },
  trends: {
    datasource_month_delta: 3,
    dataset_week_delta: 9,
    query_count_week: 1240,
  },
  health: {
    datasource_connectivity: 0.98,
    semantic_coverage: 0.86,
    query_success_rate: 0.94,
  },
  recent_queries: [
    {
      id: 1,
      name: '日活按学段',
      datasource_name: '教学 PostgreSQL',
      status: 'success',
      executed_at: '2026-04-21T09:30:00+08:00',
    },
    {
      id: 2,
      name: '答题失败率',
      datasource_name: '教学 PostgreSQL',
      status: 'failed',
      executed_at: '2026-04-21T09:10:00+08:00',
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/dashboard/overview', envelope(dashboardOverview))
})

test('A01 Dashboard 无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/dashboard')

  await expect(page.getByRole('heading', { name: /语义优先的数据工作台/ })).toBeVisible()
  await expect(page.getByText('日活按学段')).toBeVisible()

  // Round 4 · R-002b：color-contrast 重开；token 侧在 tokens.css 收紧到 ≥4.5:1。
  await expectNoSeriousA11yViolations(page)
})
