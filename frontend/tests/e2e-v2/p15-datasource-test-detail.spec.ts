// frontend/tests/e2e-v2/p15-datasource-test-detail.spec.ts
//
// P15 — 数据源测试连接结果详情（含耗时、tested_at）happy path.
// 与 P2 的差异：P2 只验"成功"提示；P15 验完整字段渲染。

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import dsFx from './fixtures/datasources.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1/test', envelope(dsFx.test_connection_ok))
})

test('P15 数据源 测试连接结果详情 含 latency_ms @p15', async ({ page }) => {
  await gotoV2(page, '/data-center/datasources/1')
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  const testBtn = page.getByRole('button', { name: /测试连接/ })
  await testBtn.click()

  await expect(page.getByText(/42|延迟|latency/i).first()).toBeVisible()
})
