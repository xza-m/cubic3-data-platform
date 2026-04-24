// frontend/tests/e2e-v2/p29-legacy-redirect-smoke.spec.ts
//
// P29 — Legacy URL 重定向 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 背景：Round 3 cutover 阶段 routes.tsx 维护了一张 LEGACY_REDIRECTS 表，将 v1 时代的
//       旧路径统一重定向到 v2 新路径。原 e2e-node `devtools-browse.spec.ts` 就是这类
//       URL 兼容 smoke。这里用 v2 代 fixture + LegacyRedirect 行为做最轻量的回归保护。
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §7；routes.tsx §LEGACY_REDIRECTS。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import semanticFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, /\/api\/v1\/semantic\/cubes(\?.*)?$/, envelope(semanticFx.cubes))
  await mockJsonRoute(page, /\/api\/v1\/semantic\/domains(\?.*)?$/, envelope(semanticFx.domains))
})

test('P29 /semantic/tools 重定向到 /semantic/workbench @p29', async ({ page }) => {
  await gotoV2(page, '/semantic/tools')
  await expect(page).toHaveURL(/\/semantic\/workbench$/)
})

test('P29 /semantic/devtools 重定向到 /semantic/workbench @p29', async ({ page }) => {
  await gotoV2(page, '/semantic/devtools')
  await expect(page).toHaveURL(/\/semantic\/workbench$/)
})

test('P29 /semantic/playground 重定向到 /semantic/cubes @p29', async ({ page }) => {
  await gotoV2(page, '/semantic/playground')
  await expect(page).toHaveURL(/\/semantic\/cubes$/)
})

test('P29 /semantic/canvas 重定向到 /semantic/domains @p29', async ({ page }) => {
  await gotoV2(page, '/semantic/canvas')
  await expect(page).toHaveURL(/\/semantic\/domains$/)
})

test('P29 /queries/editor 重定向到 /queries @p29', async ({ page }) => {
  await gotoV2(page, '/queries/editor')
  await expect(page).toHaveURL(/\/queries$/)
})
