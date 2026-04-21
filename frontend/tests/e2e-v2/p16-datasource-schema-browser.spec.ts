// frontend/tests/e2e-v2/p16-datasource-schema-browser.spec.ts
//
// P16 — 数据源详情 结构 Tab happy path. The schema browser fetches three
// flat list endpoints (databases / tables / columns); we mock all three so
// the page can render without errors.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
  await mockJsonRoute(page, '**/api/v1/datasources/1', envelope(dsFx.detail))
  await mockJsonRoute(
    page,
    '**/api/v1/datasources/1/databases**',
    envelope({ databases: ['teaching'] }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/datasources/1/schema**',
    envelope({
      databases: [{ name: 'teaching', tables: [{ name: 'lesson_progress' }, { name: 'students' }] }],
    }),
  )
})

test('P16 数据源详情 渲染 @p16', async ({ page }) => {
  await gotoV2(page, '/data-center/datasources/1')
  await expect(page).toHaveURL(/\/data-center\/datasources\/1/)
  await expect(page.locator('body')).toBeVisible()
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
})
