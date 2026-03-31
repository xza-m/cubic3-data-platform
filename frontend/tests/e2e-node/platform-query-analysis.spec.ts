import { expect, test } from '@playwright/test'
import { prepareAuthenticatedPage } from './helpers'

async function expectTemplatePanelExpanded(page: import('@playwright/test').Page) {
  await expect(page.getByPlaceholder('搜索模版...')).toBeVisible()
  await expect(page.getByText('最近执行', { exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/data-center/datasources') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              { id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' },
              { id: 2, name: '运营 ClickHouse', source_type: 'clickhouse' },
            ],
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasets') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 9,
                dataset_code: 'lesson_progress',
                dataset_name: '课堂进度',
                dataset_type: 'physical',
                physical_table: 'dwd_lesson_progress',
                field_count: 24,
              },
            ],
            total: 1,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries/statistics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            query_count_week: 12,
            saved_queries_count: 6,
            avg_execution_time_ms: 840,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries/folders') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 10, folder_name: '教学分析', created_by: 'tester', created_at: '2026-03-24T09:00:00Z' },
          ],
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries/templates') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 3,
                template_name: '课堂活跃度分析',
                template_description: '按班级统计课堂活跃度',
                sql_template: 'SELECT * FROM lesson_activity WHERE dt = {{date}}',
                parameters: [
                  { name: 'date', type: 'date', label: '日期', display_name: '日期', required: true },
                ],
                category: '教学分析',
                tags: ['课堂', '活跃度'],
                use_count: 5,
                created_at: '2026-03-24T09:00:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 100,
            total_pages: 1,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries/histories') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 8,
                query_id: 1,
                source_id: 1,
                sql_query: 'SELECT count(*) FROM lesson_progress',
                status: 'success',
                execution_time_ms: 1200,
                executed_by: 'tester',
                executed_at: '2026-03-24T12:00:00Z',
                datasource_name: '教学 PostgreSQL',
                result_rows: 1,
                row_count: 1,
                result_size: 2048,
              },
            ],
            total: 1,
            page: 1,
            page_size: 50,
            total_pages: 1,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 1,
                query_code: 'q_lesson_progress',
                query_name: '课堂进度分析',
                source_id: 1,
                sql_query: 'SELECT * FROM lesson_progress LIMIT 100',
                folder_name: '教学分析',
                tags: [],
                description: '课堂进度和活跃度查询',
                is_favorite: true,
                execute_count: 8,
                created_by: 'tester',
                created_at: '2026-03-24T09:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
                last_executed_at: '2026-03-24T10:00:00Z',
              },
            ],
            total: 1,
            page: 1,
            page_size: 100,
            total_pages: 1,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/queries/1' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 1,
            query_code: 'q_lesson_progress',
            query_name: '课堂进度分析',
            source_id: 1,
            sql_query: 'SELECT * FROM lesson_progress LIMIT 100',
            folder_name: '教学分析',
            tags: [],
            description: '课堂进度和活跃度查询',
            is_favorite: true,
            execute_count: 8,
            created_by: 'tester',
            created_at: '2026-03-24T09:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
            last_executed_at: '2026-03-24T10:00:00Z',
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/extraction/tasks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            total: 1,
            items: [
              {
                id: 21,
                task_name: '按天同步课堂进度',
                task_type: 'scheduled',
                dataset_id: 9,
                dataset_name: '课堂进度',
                is_active: true,
                row_limit: 1000,
              },
            ],
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/conversations') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 1,
                title: '课堂进度分析',
                dataset_id: 9,
                dataset_name: '课堂进度',
                user_id: 'tester',
                context: {},
                created_at: '2026-03-24T09:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
                message_count: 2,
              },
            ],
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/conversations/1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 1,
            title: '课堂进度分析',
            dataset_id: 9,
            dataset_name: '课堂进度',
            user_id: 'tester',
            context: {},
            created_at: '2026-03-24T09:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
            message_count: 2,
            messages: [
              {
                id: 100,
                conversation_id: 1,
                role: 'assistant',
                content: '当前课堂进度稳定。',
                created_at: '2026-03-24T10:00:00Z',
              },
            ],
          },
        }),
      })
      return
    }

    await route.continue()
  })
})

test('查询中心主入口保留工作台，历史与列表入口恢复独立访问能力', async ({ page }) => {
  await page.goto('/queries', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/queries$/)
  await expect(page.getByTestId('query-center-dashboard-layout')).toBeVisible()
  await expect(page.getByRole('button', { name: '运行' })).toBeVisible()
  await expect(page.getByText('模版库')).toBeVisible()
  await expect(page.getByRole('button', { name: '展开模版库' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索模版...')).toHaveCount(0)

  await page.getByRole('button', { name: '展开模版库' }).click()
  await expectTemplatePanelExpanded(page)

  await page.goto('/queries/my', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/queries\/my$/)
  await expect(page.getByRole('heading', { name: '我的查询' })).toBeVisible()
  await expect(page.getByText('课堂进度分析')).toBeVisible()

  await page.goto('/queries/history?source_id=1&name=%E8%AF%BE%E5%A0%82%E8%BF%9B%E5%BA%A6%E5%88%86%E6%9E%90', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/queries\/history/)
  await expect(page.getByRole('heading', { name: '查询历史' })).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await page.getByRole('button', { name: '重新执行' }).click()
  await expect(page.getByTestId('query-center-dashboard-layout')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/queries')
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('editor')
  expect(new URL(page.url()).searchParams.get('source_id')).toBe('1')

  await page.goto('/queries/templates', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('query-center-dashboard-layout')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/queries')
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('templates')
  await expectTemplatePanelExpanded(page)
  await expect(page.getByText('课堂活跃度分析')).toBeVisible()

  await page.goto('/queries/scheduled', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/queries\/scheduled$/)
  await expect(page.getByRole('heading', { name: '定时查询' })).toBeVisible()
  await expect(page.getByText('由调度任务引擎承载')).toBeVisible()
  await expect(page.getByText('按天同步课堂进度')).toBeVisible()
})

test('查询构建入口与可视化工作区可独立访问，智能问数仍保留独立工作区', async ({ page }) => {
  await page.goto('/queries/editor', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('query-center-dashboard-layout')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/queries')
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('editor')
  await expect(page.getByRole('button', { name: '运行' })).toBeVisible()

  await page.goto('/queries/visual?source_id=2', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/queries\/visual(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '可视化查询构建器' })).toBeVisible()
  await expect(page.getByText('无需编写 SQL，通过可视化方式构建查询')).toBeVisible()
  await page.getByRole('button', { name: '切换到 SQL 编辑器' }).click()
  await expect(page.getByTestId('query-center-dashboard-layout')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/queries')
  expect(new URL(page.url()).searchParams.get('legacy')).toBe('editor')
  expect(new URL(page.url()).searchParams.get('sourceId')).toBe('2')
  expect(new URL(page.url()).searchParams.get('source_id')).toBe('2')

  await page.goto('/data-chat', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('data-chat-layout')).toBeVisible()
  await expect(page.getByText('对话列表')).toBeVisible()
  await expect(page.getByText('AI 语义驱动')).toBeVisible()
  await page.getByTestId('conversation-row-1').click()
  await expect(page.getByText('当前课堂进度稳定。')).toBeVisible()
  await expect(page.getByPlaceholder('输入您的数据问题...')).toBeVisible()
})
