// frontend/tests/e2e-v2/p30-query-visual-smoke.spec.ts
//
// P30 — /queries/visual 可视化构建 smoke（Round 3 承接 QueryBuilder 后的新路由）。
//
// 覆盖：
//   - 页面标题渲染
//   - 左侧字段树列出后端返回的字段
//   - 默认 SQL 预览含物理表
//   - 勾选字段后 SQL 预览切成具名列
//
// 文档参考：docs/archive/legacy-prototypes/QueryBuilder.tsx.txt （历史原型）

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'

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
      field_count: 3,
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
      display_name: '订单 ID',
      business_type: 'dimension',
      sensitivity_level: 'public',
      is_sensitive: false,
      mask_rule: null,
      comment: null,
      field_order: 0,
    },
    {
      id: 2,
      physical_name: 'order_amount',
      data_type: 'decimal',
      display_name: '金额',
      business_type: 'metric',
      sensitivity_level: 'public',
      is_sensitive: false,
      mask_rule: null,
      comment: null,
      field_order: 1,
    },
    {
      id: 3,
      physical_name: 'ds',
      data_type: 'string',
      display_name: '分区日期',
      business_type: 'partition',
      sensitivity_level: 'public',
      is_sensitive: false,
      mask_rule: null,
      comment: null,
      field_order: 2,
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
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
})

test('P30 可视化构建页面加载 + 字段树 + SQL 预览 @p30', async ({ page }) => {
  await gotoV2(page, '/queries/visual')

  // 页面标题可见
  await expect(page.getByText('可视化构建', { exact: true }).first()).toBeVisible()

  // 左侧字段树列出字段
  const tree = page.getByTestId('v2-field-tree')
  await expect(tree).toBeVisible()
  await expect(tree.getByText('order_id')).toBeVisible()
  await expect(tree.getByText('order_amount')).toBeVisible()
  await expect(tree.getByText('ds')).toBeVisible()

  // SQL 预览默认 SELECT * FROM public.orders
  const preview = page.getByTestId('v2-sql-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('FROM public.orders')
  await expect(preview).toContainText('SELECT *')
})

test('P30 勾字段后 SQL 预览切换为具名列 @p30', async ({ page }) => {
  await gotoV2(page, '/queries/visual')

  const checkbox = page
    .getByTestId('v2-field-tree-item-order_id')
    .locator('input[type=checkbox]')
  await expect(checkbox).toBeVisible()
  await checkbox.check()

  const preview = page.getByTestId('v2-sql-preview')
  await expect(preview).toContainText('SELECT order_id')
  await expect(preview).not.toContainText('SELECT *')
})

test('P30 点"添加筛选"新增一行筛选器 @p30', async ({ page }) => {
  await gotoV2(page, '/queries/visual')

  const panel = page.getByTestId('v2-filter-panel')
  await expect(panel).toBeVisible()
  await panel.getByTestId('v2-filter-panel-add').click()

  // 至少出现一行筛选
  await expect(panel.locator('[data-testid^="v2-filter-row-"]').first()).toBeVisible()
})
