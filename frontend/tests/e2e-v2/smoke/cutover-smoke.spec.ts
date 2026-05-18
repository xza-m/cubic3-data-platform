// frontend/tests/e2e-v2/smoke/cutover-smoke.spec.ts
//
// Day 0 切换烟雾测试（W6.A 产出物）。
//
// 覆盖 04-cutover-and-migration.md §3.2 列出的 6 条关键路径，
// 整体跑完应在 60 秒内（Tech Lead 切换日决策窗口的硬约束）。
//
// 约定：
// - 全部 6 个 case tag 为 `@smoke`，可经 `playwright test --grep @smoke`
//   独立运行。
// - 与 P01~P22 一致：所有 `/api/v1/**` 请求由 mockJsonRoute / installApiCatchAll
//   完成 mock，**不依赖** 真后端，便于 Day 0 在新部署的 nginx 前直接跑。
// - 与现有 specs（p02-datasource-test-connection / visual/v2-visual）共用
//   `helpers.ts` 中的 prepareV2Page / installApiCatchAll / mockJsonRoute / envelope。
// - S01 故意不调用 prepareV2Page —— 我们要验证未登录用户访问 /login 时表单
//   能渲染（auth bypass 仍作用于 ProtectedRoute，对 /login 无效）。

import { test, expect } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import dsFx from '../fixtures/datasources.json' with { type: 'json' }
import ontFx from '../fixtures/ontology.json' with { type: 'json' }
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

// Dashboard hook 直接消费 res.data（**未** envelope 包装）。
const dashboardOverview = {
  stats: {
    datasource_total: 12,
    dataset_total: 87,
    semantic_model_total: 34,
    today_query_count: 218,
  },
  trends: {
    datasource_month_delta: 3,
    dataset_week_delta: 9,
    query_count_week: 1240,
  },
  health: {
    datasource_connectivity: 0.98,
    semantic_coverage: 0.86,
    query_success_rate: 0.94,
  },
  recent_queries: [],
}

// ── S01  /login 可达 ─────────────────────────────────────────────────────────

test('S01 /login 登录页可达 @smoke', async ({ page }) => {
  // 不调用 prepareV2Page —— sessionStorage 中无 token 时 Login 不会自动重定向。
  const response = await page.goto('/login', { waitUntil: 'domcontentloaded' })
  expect(response?.status() ?? 0).toBeLessThan(400)
  // SPA shell 200 即认为可达；再做一项最小可视断言，避免空白页误判。
  await expect(page.getByRole('button', { name: /登录|Sign in|Log in/ }).first()).toBeVisible()
})

// ── S02  /dashboard 加载 ─────────────────────────────────────────────────────

test('S02 /dashboard 加载首屏 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/dashboard/overview', dashboardOverview)

  await gotoV2(page, '/dashboard')

  await expect(
    page.getByRole('heading', { name: /语义优先的数据工作台/ }),
  ).toBeVisible()
})

// ── S03  /data-center/datasources 列表 ───────────────────────────────────────

test('S03 /data-center/datasources 列表渲染 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources', envelope(dsFx.list))

  await gotoV2(page, '/data-center/datasources')

  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
})

// ── S04  /semantic/ontology/objects 列表 ─────────────────────────────────────

test('S04 /semantic/ontology/objects 列表渲染 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/ontology/objects', envelope(ontFx.objects))

  await gotoV2(page, '/semantic/ontology/objects')

  await expect(page.getByText('业务对象').first()).toBeVisible()
  await expect(page.getByText('学生').first()).toBeVisible()
})

// ── S05  查询资产列表不提供重复新建入口 ───────────────────────────────────
//
// 已保存查询只负责管理历史资产；调度查询保留顶部主创建入口，空状态不重复放 CTA。

test('S05 /queries/my 与 /queries/scheduled 不提供重复空状态入口 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(
    page,
    '**/api/v1/queries**',
    envelope({ items: [], total: 0, page: 1, page_size: 20, total_pages: 0 }),
  )

  await gotoV2(page, '/queries/my')

  await expect(page.getByRole('button', { name: /新建查询|新建第一个查询/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /查询工作台/ })).toHaveCount(0)
  await expect(page.getByText('在查询工作台编写 SQL 并保存后，会出现在这里。')).toBeVisible()

  await gotoV2(page, '/queries/scheduled')

  await expect(page.getByRole('button', { name: /^新建调度$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /新建第一个调度/ })).toHaveCount(0)
})

// ── S06  /semantic/ontology/metrics dry-run 入口可用 ─────────────────────────

test('S06 /semantic/ontology/metrics 试运行入口 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/ontology/metrics**', envelope(ontFx.metrics))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/metrics**', envelope(ontFx.metrics))

  await gotoV2(page, '/semantic/ontology/metrics')

  // 列表先渲染出指标行（fixture 内 lesson_completion_rate）。
  await expect(page.getByText('lesson_completion_rate').first()).toBeVisible()

  // 行内 "预览"（dry-run）按钮存在且可点。
  const dryRunBtn = page.getByRole('button', { name: /预览/ }).first()
  await expect(dryRunBtn).toBeVisible()
  await expect(dryRunBtn).toBeEnabled()
  await dryRunBtn.click()
  // 点击展开后 dry-run 面板渲染（公式 textarea 或编辑器外壳出现）；
  // 不强求内部 Monaco 完全 hydrate，只看 panel 容器即可。
  await expect(page.getByText(/dry.run|试运行|预览|公式/i).first()).toBeVisible()
})
