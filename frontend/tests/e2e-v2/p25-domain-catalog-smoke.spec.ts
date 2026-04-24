// frontend/tests/e2e-v2/p25-domain-catalog-smoke.spec.ts
//
// P25 — Domain 目录首屏 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - /semantic/domains 列表页能打开
//   - fixture 里的 domain（教学域）可见
//   - 空态不发生（fixture 有 1 条数据）
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §3。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'
import semanticFx from './fixtures/semantic.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, /\/api\/v1\/semantic\/domains(\?.*)?$/, envelope(semanticFx.domains))
})

test('P25 Domain 目录首屏能打开并渲染 fixture 项 @p25', async ({ page }) => {
  await gotoV2(page, '/semantic/domains')
  await expect(page).toHaveURL(/\/semantic\/domains$/)

  // fixture 里的 domain 名称
  await expect(page.getByText('教学域').first()).toBeVisible()
})
