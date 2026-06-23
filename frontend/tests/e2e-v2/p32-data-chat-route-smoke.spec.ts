// frontend/tests/e2e-v2/p32-data-chat-route-smoke.spec.ts
//
// P32 — Data Chat 顶级入口 smoke。
//
// 覆盖：
//   - /data-chat 直达时渲染真实页面，而不是空白或占位
//   - 从其它模块导航到 Data Chat 时主内容会跟随路由刷新

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import dsFx from './fixtures/datasets.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(
    page,
    /\/api\/v1\/data-center\/datasets(\?.*)?$/,
    envelope(dsFx.list),
  )
  await mockJsonRoute(
    page,
    /\/api\/v1\/conversations(\?.*)?$/,
    envelope({
      items: [
        {
          id: 101,
          title: '订单趋势分析',
          dataset_id: 11,
          dataset_name: '订单宽表',
          description: '查看本周订单趋势',
          message_count: 2,
          updated_at: '2026-04-25T08:00:00+08:00',
        },
      ],
      offset: 0,
      limit: 20,
      total: 1,
    }),
  )
})

test('P32 Data Chat 直达路由渲染对话工作台 @p32', async ({ page }) => {
  await gotoV2(page, '/data-chat')

  await expect(page).toHaveURL(/\/data-chat$/)
  await expect(page.getByTestId('v2-data-chat')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Data Chat' })).toBeVisible()
  await expect(page.getByLabel('数据集范围（可选）')).toContainText('订单宽表')
  await expect(page.getByPlaceholder(/输入你的数据问题/)).toBeVisible()
})

test('P32 从其它模块进入 Data Chat 会刷新主内容 @p32', async ({ page }) => {
  await gotoV2(page, '/dashboard')
  await page.getByRole('button', { name: 'Data Chat' }).click()

  await expect(page).toHaveURL(/\/data-chat$/)
  await expect(page.getByTestId('v2-data-chat')).toBeVisible()
  await expect(page.getByText('语义优先的数据工作台')).toHaveCount(0)
})
