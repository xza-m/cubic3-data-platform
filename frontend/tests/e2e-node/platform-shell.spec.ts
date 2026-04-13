import { expect, test } from '@playwright/test'
import { prepareAuthenticatedPage } from './helpers'

const DASHBOARD_OVERVIEW_FIXTURE = {
  stats: {
    datasource_total: 5,
    dataset_total: 12,
    semantic_model_total: 12,
    today_query_count: 3,
    ai_chat_count: null,
  },
  trends: {
    datasource_month_delta: 2,
    dataset_week_delta: 5,
    query_count_week: 18,
  },
  recent_queries: [
    {
      id: 1,
      name: 'SELECT count(*) FROM lesson_progress',
      datasource_name: '教学 PostgreSQL',
      executed_at: '2026-03-28T08:35:00+08:00',
      status: 'success',
    },
  ],
  health: {
    datasource_connectivity: 98,
    semantic_coverage: null,
    query_success_rate: 99.2,
  },
}

const DATASOURCE_LIST_FIXTURE = {
  items: [
    {
      id: 1,
      name: '教学 PostgreSQL',
      source_type: 'postgresql',
      description: 'E2E fixture datasource',
      connection_config: {
        host: 'localhost',
        port: '5432',
        database: 'teaching',
      },
      extra_config: {},
      is_active: true,
      connection_status: 'connected',
      created_at: '2026-03-28T08:00:00+08:00',
      updated_at: '2026-03-28T08:00:00+08:00',
    },
  ],
  total: 1,
  page: 1,
  page_size: 100,
  total_pages: 1,
}

const DATASOURCE_TYPE_FIXTURE = [
  {
    type: 'postgresql',
    display_name: 'PostgreSQL',
    description: 'PostgreSQL 数据源',
  },
]

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('平台壳层支持模块导航', async ({ page }) => {
  await page.route('**/api/v1/dashboard/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: DASHBOARD_OVERVIEW_FIXTURE,
      }),
    })
  })
  await page.route('**/api/v1/data-center/datasources/types', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: DATASOURCE_TYPE_FIXTURE,
      }),
    })
  })
  await page.route('**/api/v1/data-center/datasources?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: DATASOURCE_LIST_FIXTURE,
      }),
    })
  })

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible()
  await expect(page.getByText('数据健康')).toBeVisible()

  const sidebar = page.getByTestId('app-shell-sidebar')
  await sidebar.hover()
  const datasourceButton = sidebar.getByRole('button', { name: /^数据源$/ })

  if (!(await datasourceButton.isVisible())) {
    await sidebar.getByRole('button', { name: /^数据中心$/ }).click()
  }
  await datasourceButton.click()
  await expect(page).toHaveURL(/\/data-center\/datasources$/)
})
