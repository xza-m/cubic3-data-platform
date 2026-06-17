// frontend/tests/e2e-v2/p15-datasource-test-detail.spec.ts
//
// P15 — 连接测试结果详情（含耗时、tested_at）happy path.
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

test('P15 连接测试结果详情 含 latency_ms @p15', async ({ page }) => {
  await gotoV2(page, '/data-center/connections/1')
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await expect(page.getByText('PostgreSQL').first()).toBeVisible()
  await expect(page.getByText('王老师')).toBeVisible()
  await expect(page.getByText('feishu:tenant:on_teacher')).toHaveCount(0)

  const testBtn = page.getByRole('button', { name: /测试连接/ })
  await testBtn.click()

  await expect(page.getByText(/42|延迟|latency/i).first()).toBeVisible()
})

test('P15 连接详情 编辑按钮进入编辑页并保存 @p15', async ({ page }) => {
  let submittedPayload: unknown = null
  await page.route('**/api/v1/data-center/datasources/1', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback()
      return
    }
    submittedPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          ...dsFx.detail,
          name: '教学 PostgreSQL 编辑版',
        }),
      ),
    })
  })

  await gotoV2(page, '/data-center/connections/1')
  await page.getByRole('button', { name: '编辑' }).click()
  await expect(page).toHaveURL(/\/data-center\/connections\/1\/edit$/)
  await expect(page.getByRole('heading', { name: '编辑连接' })).toBeVisible()

  await page.locator('input[placeholder="如 prod-maxcompute"]').fill('教学 PostgreSQL 编辑版')
  await page.getByRole('button', { name: '保存修改' }).click()

  expect(submittedPayload).toMatchObject({
    name: '教学 PostgreSQL 编辑版',
    description: 'E2E v2 fixture',
  })
  expect(submittedPayload).not.toHaveProperty('connection_config')
  await expect(page).toHaveURL(/\/data-center\/connections\/1$/)
})
