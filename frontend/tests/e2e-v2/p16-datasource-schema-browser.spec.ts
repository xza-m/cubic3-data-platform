// frontend/tests/e2e-v2/p16-datasource-schema-browser.spec.ts
//
// P16 — 连接详情结构 Tab happy path. The schema browser fetches three
// flat list endpoints (databases / tables / columns); we mock all three so
// the page can render without errors.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }

const manyTables = Array.from({ length: 55 }, (_, index) => {
  const n = String(index + 1).padStart(3, '0')
  return {
    table_name: `public.table_${n}`,
    comment: `第 ${index + 1} 张表`,
    row_count: index + 1,
  }
})

const longColumnType =
  'array<struct<`level_tag`:string,`level_student_cnt`:bigint,`level_student_rate`:double>>'

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema',
    envelope({
      datasource_id: 1,
      databases: ['teaching'],
      fetched_at: '2026-04-21T10:00:00+08:00',
    }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema/teaching',
    envelope({
      datasource_id: 1,
      database: 'teaching',
      tables: manyTables,
      fetched_at: '2026-04-21T10:00:00+08:00',
    }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema/teaching/public.table_055',
    envelope({
      datasource_id: 1,
      database: 'teaching',
      table: 'public.table_055',
      row_count_estimate: 55,
      columns: [
        { name: 'id', type: 'int', nullable: false, comment: '主键' },
        { name: 'title', type: 'varchar', nullable: true, comment: '标题' },
        { name: 'level_distribution_arr', type: longColumnType, nullable: true, comment: '层级分布' },
      ],
      fetched_at: '2026-04-21T10:00:00+08:00',
    }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema/teaching/public.table_001',
    envelope({
      datasource_id: 1,
      database: 'teaching',
      table: 'public.table_001',
      row_count_estimate: null,
      columns: [{ name: 'id', type: 'int', nullable: false, comment: '主键' }],
      fetched_at: '2026-04-21T10:00:00+08:00',
    }),
  )
})

test('P16 连接详情渲染 @p16', async ({ page }) => {
  await gotoV2(page, '/data-center/connections/1')
  await expect(page).toHaveURL(/\/data-center\/connections\/1/)
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
})

test('P16 连接结构 表列表支持分页 @p16', async ({ page }) => {
  await gotoV2(page, '/data-center/connections/1')
  await page.getByRole('tab', { name: '结构' }).click()

  await expect(page.getByText('表（teaching）')).toBeVisible()
  await expect(page.getByText('public.table_001')).toBeVisible()
  await expect(page.getByText('public.table_020')).toBeVisible()
  await expect(page.getByText('public.table_021')).toHaveCount(0)
  await expect(page.getByText('1-20 / 55 张表')).toBeVisible()

  await page.getByRole('button', { name: '下一页表' }).click()
  await expect(page.getByText('21-40 / 55 张表')).toBeVisible()
  await expect(page.getByText('public.table_021')).toBeVisible()
  await expect(page.getByText('public.table_001')).toHaveCount(0)

  await page.getByRole('button', { name: '下一页表' }).click()
  await expect(page.getByText('41-55 / 55 张表')).toBeVisible()
  await expect(page.getByText('public.table_055')).toBeVisible()

  await page.getByText('public.table_055').click()
  await expect(page.getByText('字段（public.table_055）')).toBeVisible()
  await expect(page.getByText('title')).toBeVisible()

  const typeText = page.getByText(longColumnType, { exact: true }).first()
  await expect(typeText).toBeVisible()
  await expect.poll(() => typeText.evaluate((el) => el.scrollWidth > el.clientWidth)).toBeTruthy()
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await typeText.hover()
  await expect(page.getByRole('tooltip')).toContainText(longColumnType)
})

test('P16 连接结构 行数未知时不展示伪 0 @p16', async ({ page }) => {
  await gotoV2(page, '/data-center/connections/1')
  await page.getByRole('tab', { name: '结构' }).click()

  await page.getByText('public.table_001').click()

  await expect(page.getByText('字段（public.table_001）')).toBeVisible()
  await expect(page.getByText(/估算行数/)).toHaveCount(0)
})
