// frontend/tests/e2e-v2/p24-cube-browse-smoke.spec.ts
//
// P24 — Cube 浏览首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - /semantic/cubes 列表页能打开
//   - fixture 里的 cube（fct_lesson / 课程事实）出现在列表
//   - 新建 Cube CTA 存在
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §2。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import semanticFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, /\/api\/v1\/semantic\/cubes(\?.*)?$/, envelope(semanticFx.cubes))
})

test('P24 Cube 列表首屏能打开并渲染 fixture 项 @p24', async ({ page }) => {
  await gotoV2(page, '/semantic/cubes')
  await expect(page).toHaveURL(/\/semantic\/cubes$/)

  // fixture 里的 cube
  await expect(page.getByText('fct_lesson').first()).toBeVisible()
  await expect(page.getByText('课程事实').first()).toBeVisible()

  // 搜索框（aria-label="搜索 Cube"）
  const searchInput = page.getByRole('textbox', { name: /搜索 Cube/ }).first()
  await expect(searchInput).toBeVisible()

  // 新建 CTA
  const newBtn = page.getByRole('button', { name: /新建|New/ }).first()
  await expect(newBtn).toBeVisible()
})
