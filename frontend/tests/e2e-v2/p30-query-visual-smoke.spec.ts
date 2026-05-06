// frontend/tests/e2e-v2/p30-query-visual-smoke.spec.ts
//
// P30 — /queries/visual 可视化构建（Round 3 承接 QueryBuilder 后的新路由）。
//
// 覆盖（smoke + 操作回路）：
//   - 页面标题渲染
//   - 左侧字段树列出后端返回的字段
//   - 默认 SQL 预览含物理表
//   - 勾选字段后 SQL 预览切成具名列
//   - 添加筛选行（点 +）
//   - 回路 A：勾字段 + 添加 filter → SQL 预览含 WHERE
//   - 回路 B：勾字段 → 点「在查询控制台打开」→ 跳转 /queries 且 sessionStorage
//     `v2:queryVisual:pendingPrefill` 被 QueryConsole mount 时消费清空
//
// 文档参考：docs/archive/legacy-prototypes/QueryBuilder.tsx.txt （历史原型）

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'

const PREFILL_KEY = 'v2:queryVisual:pendingPrefill'

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

test('P30 回路A：勾字段 + 加 filter → SQL 预览含 WHERE @p30', async ({ page }) => {
  await gotoV2(page, '/queries/visual')

  // 勾 order_id
  await page
    .getByTestId('v2-field-tree-item-order_id')
    .locator('input[type=checkbox]')
    .check()

  // 加一行筛选
  const panel = page.getByTestId('v2-filter-panel')
  await panel.getByTestId('v2-filter-panel-add').click()

  // 取第一行，选择字段 order_id / 默认操作符 EQ / 输入值 123
  const firstRow = panel.locator('[data-testid^="v2-filter-row-"]').first()
  const rowTestId = await firstRow.getAttribute('data-testid')
  expect(rowTestId).toBeTruthy()

  await firstRow.locator(`[data-testid="${rowTestId}-field"]`).selectOption('order_id')
  // 默认 op 是 EQ，先显式 set 一次确保 value input 是 single 形态
  await firstRow.locator(`[data-testid="${rowTestId}-op"]`).selectOption('EQ')
  await firstRow.locator(`[data-testid="${rowTestId}-value"]`).fill('123')

  const preview = page.getByTestId('v2-sql-preview')
  await expect(preview).toContainText('WHERE')
  await expect(preview).toContainText('order_id')
  // bigint 类型 → 不带引号
  await expect(preview).toContainText('123')
})

test('P30 条件组支持组间 OR @p30', async ({ page }) => {
  await gotoV2(page, '/queries/visual')

  const panel = page.getByTestId('v2-filter-panel')
  await panel.getByTestId('v2-filter-panel-add').click()

  let rows = panel.locator('li[data-testid^="v2-filter-row-"]')
  const firstRow = rows.first()
  let rowTestId = await firstRow.getAttribute('data-testid')
  expect(rowTestId).toBeTruthy()
  await firstRow.locator(`[data-testid="${rowTestId}-field"]`).selectOption('order_id')
  await firstRow.locator(`[data-testid="${rowTestId}-value"]`).fill('1')

  await panel.getByTestId('v2-filter-panel-add-group').click()
  await panel.getByTestId('v2-filter-group-logic').selectOption('OR')

  rows = panel.locator('li[data-testid^="v2-filter-row-"]')
  const secondRow = rows.nth(1)
  rowTestId = await secondRow.getAttribute('data-testid')
  expect(rowTestId).toBeTruthy()
  await secondRow.locator(`[data-testid="${rowTestId}-field"]`).selectOption('ds')
  await secondRow.locator(`[data-testid="${rowTestId}-value"]`).fill('2026-05-05')

  const preview = page.getByTestId('v2-sql-preview')
  await expect(preview).toContainText('WHERE')
  await expect(preview).toContainText('OR')
  await expect(preview).toContainText("ds = '2026-05-05'")
})

test('P30 回路B：点"在查询控制台打开"跳 /queries 并消费 sessionStorage @p30', async ({ page }) => {
  // QueryConsole 侧栏依赖 datasources，先 mock 一份带 id=7 的数据源
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasources(\?.*)?$/,
    envelope({
      items: [
        {
          id: 7,
          name: '教学 PostgreSQL',
          source_type: 'postgresql',
          description: null,
          environment: 'prod',
          is_active: true,
          connection_config: {},
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    }),
  )

  await gotoV2(page, '/queries/visual')

  // 勾 order_id → 产生一条有内容的 SQL，具备跳转意义
  await page
    .getByTestId('v2-field-tree-item-order_id')
    .locator('input[type=checkbox]')
    .check()

  // 跳 /queries
  await page.getByTestId('v2-sql-preview-open-console').click()
  await expect(page).toHaveURL(/\/queries(?:\/|$|\?)/)

  // 阻塞到 QueryConsole 真的 mount（lazy route 有可见 paint 延迟），
  // 之后 useState lazy initializer 才会消费 sessionStorage。
  await expect(page.getByRole('button', { name: /执行/ }).first()).toBeVisible()

  // QueryConsole mount 时会 `sessionStorage.removeItem(PREFILL_KEY)`。
  // 所以 e2e 侧读取必为 null；这正是"接力成功"的最强证据。
  const leftover = await page.evaluate((key) => window.sessionStorage.getItem(key), PREFILL_KEY)
  expect(leftover).toBeNull()
})
