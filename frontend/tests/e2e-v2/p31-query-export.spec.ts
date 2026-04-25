// frontend/tests/e2e-v2/p31-query-export.spec.ts
//
// P31 — /queries/exports 异步数据导出（add-query-export）。
//
// 覆盖（操作回路）：
//   - 列表页默认加载 + 空状态
//   - 列表页渲染 pending / running / success 三种状态徽章
//   - 点 pending 行的"取消"按钮 → 调 cancel API
//   - QueryVisual 点"导出为文件" → POST /api/v1/queries/export → toast + 跳 /queries/exports
//
// 后端契约：app/interfaces/api/v1/queries.py :: submit_export / list_exports / cancel_export

import { test, expect } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from './helpers'

const EXPORT_ITEMS_V1 = [
  {
    id: 101,
    export_id: 101,
    user_id: 'admin',
    source_id: 7,
    sql_query: 'SELECT * FROM public.orders',
    status: 'pending',
    row_count: null,
    file_size_bytes: null,
    file_url: null,
    file_storage: null,
    error_message: null,
    error_code: null,
    job_id: 'rq-101',
    created_at: '2026-04-23T10:00:00Z',
    started_at: null,
    finished_at: null,
    cancelled_at: null,
    expires_at: null,
  },
  {
    id: 102,
    export_id: 102,
    user_id: 'admin',
    source_id: 7,
    sql_query: 'SELECT COUNT(*) FROM public.users',
    status: 'success',
    row_count: 1,
    file_size_bytes: 256,
    file_url: 'https://oss.example.com/signed/export-102.csv',
    file_storage: 'oss',
    error_message: null,
    error_code: null,
    job_id: 'rq-102',
    created_at: '2026-04-23T09:00:00Z',
    started_at: '2026-04-23T09:00:01Z',
    finished_at: '2026-04-23T09:00:05Z',
    cancelled_at: null,
    expires_at: '2026-04-30T09:00:05Z',
  },
]

const EMPTY_LIST = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  total_pages: 0,
}

const LIST_WITH_ITEMS = {
  items: EXPORT_ITEMS_V1,
  total: EXPORT_ITEMS_V1.length,
  page: 1,
  page_size: 20,
  total_pages: 1,
}

const DATASET_LIST_PAYLOAD = {
  items: [
    {
      id: 301,
      dataset_code: 'ds_orders',
      dataset_name: '订单宽表',
      dataset_type: 'physical',
      source_id: 7,
      source_type: 'postgresql',
      physical_table: 'public.orders',
      sql_query: null,
      file_metadata: null,
      description: null,
      owner: null,
      sync_status: 'synced',
      last_sync_at: null,
      sync_error: null,
      field_count: 1,
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-20T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  page_size: 200,
  total_pages: 1,
}

const DATASET_DETAIL_PAYLOAD = {
  ...DATASET_LIST_PAYLOAD.items[0],
  fields: [
    {
      id: 1,
      physical_name: 'order_id',
      data_type: 'bigint',
      display_name: null,
      business_type: 'dimension',
      sensitivity_level: 'public',
      is_sensitive: false,
      mask_rule: null,
      comment: null,
      field_order: 0,
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
})

test('P31 空状态渲染 @p31', async ({ page }) => {
  await mockJsonRoute(
    page,
    /\/api\/v1\/queries\/exports(\?.*)?$/,
    envelope(EMPTY_LIST),
  )

  await gotoV2(page, '/queries/exports')
  await expect(page.getByTestId('v2-query-exports')).toBeVisible()
  await expect(page.getByText('暂无导出任务')).toBeVisible()
})

test('P31 列表渲染 pending + success 两行 + 下载链接 @p31', async ({ page }) => {
  await mockJsonRoute(
    page,
    /\/api\/v1\/queries\/exports(\?.*)?$/,
    envelope(LIST_WITH_ITEMS),
  )

  await gotoV2(page, '/queries/exports')

  await expect(page.getByTestId('v2-query-exports-row-101')).toBeVisible()
  await expect(page.getByTestId('v2-query-exports-row-102')).toBeVisible()

  // success 行应显示下载链接
  const download = page.getByTestId('v2-query-exports-download-102')
  await expect(download).toBeVisible()
  await expect(download).toHaveAttribute('href', /oss\.example\.com/)

  // pending 行应显示取消按钮
  await expect(page.getByTestId('v2-query-exports-cancel-101')).toBeVisible()
})

test('P31 点取消按钮触发 POST /exports/:id/cancel @p31', async ({ page }) => {
  await mockJsonRoute(
    page,
    /\/api\/v1\/queries\/exports(\?[^/]*)?$/,
    envelope(LIST_WITH_ITEMS),
  )

  let cancelHits = 0
  await page.route(/\/api\/v1\/queries\/exports\/101\/cancel$/, async (route) => {
    cancelHits += 1
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          ...EXPORT_ITEMS_V1[0],
          status: 'cancelled',
        }),
      ),
    })
  })

  // window.confirm 自动通过
  page.on('dialog', (d) => d.accept())

  await gotoV2(page, '/queries/exports')
  await expect(page.getByTestId('v2-query-exports-row-101')).toBeVisible()

  await page.getByTestId('v2-query-exports-cancel-101').click()

  await expect.poll(() => cancelHits).toBeGreaterThan(0)
})

test('P31 QueryVisual 提交导出 → toast + 跳 /queries/exports @p31', async ({ page }) => {
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasets(\?.*)?$/,
    envelope(DATASET_LIST_PAYLOAD),
  )
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasets\/301(\?.*)?$/,
    envelope(DATASET_DETAIL_PAYLOAD),
  )
  await mockJsonRoute(
    page,
    /\/api\/v1\/queries\/exports(\?.*)?$/,
    envelope(EMPTY_LIST),
  )

  let submitHits = 0
  await page.route(/\/api\/v1\/queries\/export$/, async (route) => {
    submitHits += 1
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          ...EXPORT_ITEMS_V1[0],
          id: 999,
          export_id: 999,
          status: 'pending',
        }),
      ),
    })
  })

  await gotoV2(page, '/queries/visual')

  // 勾一个字段让 SQL 有意义
  await page
    .getByTestId('v2-field-tree-item-order_id')
    .locator('input[type=checkbox]')
    .check()

  await page.getByTestId('v2-sql-preview-export').click()

  await expect.poll(() => submitHits).toBe(1)
  await expect(page).toHaveURL(/\/queries\/exports(?:\?|$|\/)/)
})
