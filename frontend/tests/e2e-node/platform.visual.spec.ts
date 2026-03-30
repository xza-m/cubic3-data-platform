import { expect, test } from '@playwright/test'
import { prepareAuthenticatedPage } from './helpers'

const FIXED_DASHBOARD_TIME = '2026-03-28T09:00:00+08:00'

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
    {
      id: 2,
      name: 'SELECT * FROM student_answers LIMIT 20',
      datasource_name: '教学 PostgreSQL',
      executed_at: '2026-03-28T07:20:00+08:00',
      status: 'running',
    },
  ],
  health: {
    datasource_connectivity: 98,
    semantic_coverage: null,
    query_success_rate: 99.2,
  },
}

async function freezeDashboardTime(page: import('@playwright/test').Page) {
  await page.addInitScript((iso: string) => {
    const fixedTime = new Date(iso).valueOf()
    const RealDate = Date

    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(fixedTime)
          return
        }
        super(...args)
      }

      static now() {
        return fixedTime
      }
    }

    Object.defineProperty(MockDate, 'parse', { value: RealDate.parse })
    Object.defineProperty(MockDate, 'UTC', { value: RealDate.UTC })
    Object.defineProperty(MockDate, Symbol.hasInstance, { value: (instance: unknown) => instance instanceof RealDate })
    window.Date = MockDate as DateConstructor
  }, FIXED_DASHBOARD_TIME)
}

test('登录页视觉基线', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible()
  await expect(page.getByText('登录以继续使用数据平台')).toBeVisible()
  await expect(page).toHaveScreenshot('platform-login.png', { fullPage: true, maxDiffPixels: 180 })
})

test('平台概览视觉基线', async ({ page }) => {
  await freezeDashboardTime(page)
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
  await prepareAuthenticatedPage(page)
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible()
  await expect(page.getByText('数据健康')).toBeVisible()
  await expect(page.getByText('98%')).toBeVisible()
  await expect(page.getByText('99.2%')).toBeVisible()
  await expect(page).toHaveScreenshot('platform-dashboard.png', { fullPage: true, maxDiffPixels: 220 })
})
