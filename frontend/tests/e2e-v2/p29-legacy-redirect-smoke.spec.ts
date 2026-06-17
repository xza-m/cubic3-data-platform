// frontend/tests/e2e-v2/p29-legacy-redirect-smoke.spec.ts
//
// P29 — 路由入口面 smoke。
//
// 背景：当前只保留已上线查询深链的兼容重定向；语义中心处于新 IA 定版阶段，
//       旧语义入口不再注册，避免同一能力存在多套维护面。
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §7；routes.tsx §LEGACY_REDIRECTS。

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, prepareV2Page } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
})

test('P29 /queries/editor 重定向到 /queries @p29', async ({ page }) => {
  await gotoV2(page, '/queries/editor')
  await expect(page).toHaveURL(/\/queries$/)
})

// v1 顶级旧路径 → data-center 新 IA（F9：top 高频 legacy redirect）
const legacyDataRedirects = [
  ['/datasources', /\/data-center\/connections$/],
  ['/datasets', /\/data-center\/assets$/],
  ['/extraction', /\/data-center\/sync\/tasks$/],
] as const

for (const [from, to] of legacyDataRedirects) {
  test(`P29 ${from} 重定向到数据中心新 IA @p29`, async ({ page }) => {
    await gotoV2(page, from)
    await expect(page).toHaveURL(to)
  })
}

const retiredSemanticPaths = [
  '/semantic/tools',
  '/semantic/devtools',
  '/semantic/playground',
  '/semantic/canvas',
  '/semantic/overview',
  '/semantic/modeling',
  '/semantic/modeling-copilot/new',
  '/semantic/modeling-copilot/batch',
  '/semantic/modeling-copilot/session_agent_1',
] as const

for (const path of retiredSemanticPaths) {
  test(`P29 ${path} 不再注册语义兼容重定向 @p29`, async ({ page }) => {
    await gotoV2(page, path)
    expect(new URL(page.url()).pathname).toBe(path)
    await expect(page.getByText('404')).toBeVisible()
  })
}

const retiredDataCenterPaths = [
  '/data-center/datasources',
  '/data-center/datasets',
  '/extraction/tasks',
  '/extraction/runs',
  '/extraction/config',
  '/extraction-tasks/201',
] as const

for (const path of retiredDataCenterPaths) {
  test(`P29 ${path} 不再注册数据中心兼容重定向 @p29`, async ({ page }) => {
    await gotoV2(page, path)
    expect(new URL(page.url()).pathname).toBe(path)
    await expect(page.getByText('404')).toBeVisible()
  })
}
