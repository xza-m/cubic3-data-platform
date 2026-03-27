import { expect, test } from '@playwright/test'
import { prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
  await page.route('**/api/v1/data-center/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/data-center/datasources/statistics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            total: 1,
            active: 1,
            connected: 1,
            inactive: 0,
            by_type: { postgresql: 1 },
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources/types') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ type: 'postgresql', display_name: 'PostgreSQL' }],
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              {
                id: 1,
                name: '教学 PostgreSQL',
                source_type: 'postgresql',
                description: '主学习业务库',
                connection_config: { host: 'pg.internal', database: 'learning' },
                extra_config: {
                  catalog_sync: {
                    status: 'synced',
                    last_run_at: '2026-03-24T10:00:00Z',
                    last_error: null,
                    tracked_databases: ['learning'],
                    database_count: 1,
                  },
                },
                is_active: true,
                connection_status: 'connected',
                last_test_error: null,
                created_at: '2026-03-23T10:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
              },
            ],
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources/1/sync-catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            job_id: 'catalog-job-1',
            status: 'queued',
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasets/statistics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            total: 1,
            active: 1,
            syncing: 0,
            synced: 1,
            failed: 0,
            pending: 0,
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
                source_type: 'postgresql',
                physical_table: 'dwd_lesson_progress',
                description: '学生课程进度明细',
                owner: 'data-team',
                sync_status: 'synced',
                last_sync_at: '2026-03-24T10:00:00Z',
                field_count: 24,
                created_at: '2026-03-20T10:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
              },
              {
                id: 10,
                dataset_code: 'behavior_segment',
                dataset_name: '行为细分',
                dataset_type: 'virtual',
                source_type: 'maxcompute',
                description: 'SQL 虚拟数据集',
                owner: 'ops-team',
                sync_status: 'failed',
                sync_error: 'schema_fetch_failed',
                created_at: '2026-03-20T10:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
              },
              {
                id: 11,
                dataset_code: 'score_upload',
                dataset_name: '成绩上传',
                dataset_type: 'file',
                file_metadata: { file_name: 'scores.xlsx' },
                owner: 'teacher',
                sync_status: 'syncing',
                created_at: '2026-03-20T10:00:00Z',
                updated_at: '2026-03-24T10:00:00Z',
              },
            ],
            total: 3,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasets/9') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 9,
            dataset_code: 'lesson_progress',
            dataset_name: '课堂进度',
            dataset_type: 'physical',
            source_type: 'postgresql',
            physical_table: 'dwd_lesson_progress',
            description: '学生课程进度明细',
            owner: 'data-team',
            sync_status: 'synced',
            last_sync_at: '2026-03-24T10:00:00Z',
            field_count: 24,
            sample_columns: ['student_id', 'score'],
            sample_rows: [{ student_id: 's1', score: 95 }],
            fields: [
              {
                id: 1,
                physical_name: 'student_id',
                data_type: 'string',
                display_name: '学生ID',
                business_type: 'dimension',
                sensitivity_level: 'internal',
                comment: '学生唯一标识',
                field_order: 1,
              },
            ],
            created_at: '2026-03-20T10:00:00Z',
            updated_at: '2026-03-24T10:00:00Z',
          },
        }),
      })
      return
    }

    await route.continue()
  })
})

test('数据源页触发真实目录同步反馈，且不再显示历史摘要卡', async ({ page }) => {
  await page.goto('/data-center/datasources', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '数据源管理' })).toBeVisible()
  await expect(page.getByText('管理已接入的数据源与目录同步状态')).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL')).toBeVisible()
  await expect(page.getByText('总数据源')).not.toBeVisible()
  await expect(page.getByText('目录同步', { exact: true })).toBeVisible()
  await expect(page.getByText('目录已同步')).toBeVisible()
  await expect(page.getByRole('heading', { name: '质量治理' })).toBeVisible()
  await expect(page.getByText('当前阶段未接入后端能力')).toBeVisible()
  await expect(page.getByTitle('同步目录')).toBeVisible()
  const syncRequest = page.waitForRequest('**/api/v1/data-center/datasources/1/sync-catalog')
  await page.getByTitle('同步目录').click()
  await syncRequest
  await expect(page.getByTestId('async-task-notice').getByRole('heading', { name: '目录同步已触发' })).toBeVisible()
  await expect(page.getByTestId('async-task-notice').getByText('目录刷新任务已加入队列，请稍后查看同步摘要。')).toBeVisible()

  await page.goto('/data-center/datasets', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '数据集管理' })).toBeVisible()
  await expect(page.getByText('总数据集')).toBeVisible()
  await expect(page.getByText('课堂进度')).toBeVisible()
  await expect(page.getByText('行为细分')).toBeVisible()
  await expect(page.getByText('成绩上传')).toBeVisible()
  await expect(page.getByText('失败', { exact: true })).toBeVisible()
  await expect(page.getByText('schema_fetch_failed')).toBeVisible()
  await expect(page.getByText('视图')).toBeVisible()
  await expect(page.getByRole('heading', { name: '血缘分析' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '影响分析' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '质量评分' })).toBeVisible()
  await expect(page.getByText('当前阶段未接入后端能力')).toHaveCount(3)
  await page.getByRole('button', { name: '注册数据集' }).click()
  await expect(page.getByRole('menuitem', { name: /物理表数据集/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /SQL 虚拟数据集/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /CSV \/ Excel 文件数据集/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTitle('编辑').first().click()
  await expect(page.getByText('数据预览')).toBeVisible()
  await expect(page.getByText('s1')).toBeVisible()
  await expect(page.getByRole('heading', { name: '血缘分析' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '影响分析' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '质量评分' })).toBeVisible()
})
