// frontend/tests/e2e-v2/smoke/routes-smoke.spec.ts
//
// 路由与页面"可达性/非空白"冒烟（R01~R06）。
//
// 触发背景：2026-04-22 人工验证发现 5 个基础功能问题（见会话记录）：
//   - 总览数据空（res.data vs res.data.data）
//   - 数据源 /new 被 :id 吃掉 → 空白页 + 非法 ID
//   - 数据集 /new 进空白 + SQL 列过长
//   - 提取任务 /new 不可达
//   - 查询中心 t.find is not a function（React Query cache key 冲突 + API 前缀错）
//
// 这些都属于"组件内部逻辑对但装配层有缝"的一类 bug，单测不易覆盖。
// 本 spec 专门以最短路径复现这些场景，阻止同类回归。所有 case tag 为 @smoke，
// 与 cutover-smoke 一起被 `npm run e2e:smoke` / `make local-smoke` 选中。

import { test, expect } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import dsFx from '../fixtures/datasources.json' with { type: 'json' }
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

// Dashboard 直接消费 res.data.data（backend envelope 解包后的真实 payload）。
// 若业务代码把 unwrap 弄反，KPI 会是 '—'；这个 fixture 故意给可辨识的整数值，
// 让断言能判定"拿到了 data 而不是整个 envelope"。
const dashboardOverview = {
  stats: {
    datasource_total: 42,
    dataset_total: 137,
    semantic_model_total: 18,
    today_query_count: 231,
  },
  trends: {
    datasource_month_delta: 3,
    dataset_week_delta: 5,
    query_count_week: 1240,
  },
  health: {
    datasource_connectivity: 96,
    semantic_coverage: 84,
    query_success_rate: 99,
  },
  recent_queries: [],
}

// ── R01  /dashboard KPI 非空（res.data.data 解包）────────────────────────────
test('R01 /dashboard KPI 渲染真实数字（res.data.data 对齐）@smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/dashboard/overview', envelope(dashboardOverview))

  await gotoV2(page, '/dashboard')

  // 如果 envelope 未正确解包，stats 会是 undefined，KPI 渲染占位 '—'。
  // 断言至少两个 stat 数字（42 / 137）出现在页面上。
  await expect(page.getByText('42').first()).toBeVisible()
  await expect(page.getByText('137').first()).toBeVisible()
})

// ── R02  /data-center/datasources/new 可达且渲染表单（不被 :id 捕获）──────────
test('R02 /data-center/datasources/new 表单可达 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))

  await gotoV2(page, '/data-center/datasources/new')

  // 若 :id 误吃了 new，会触发 "非法数据源 ID" 的错误态，看不到创建表单标题。
  await expect(page.getByRole('heading', { name: /新建数据源/ })).toBeVisible()
})

// ── R03  /data-center/datasets/register 可达 + /new → /register 兼容跳转 ─────
test('R03 /data-center/datasets/register 注册表单可达 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources', envelope(dsFx.list))

  // 注册页先渲染一个 mode 选择器（库表 / 文件），这就足以证明路由没被 :id 吃掉、
  // 组件正常挂载。后续步骤属于业务流，交给 p03 专项覆盖。
  await gotoV2(page, '/data-center/datasets/register')
  await expect(page.getByText(/从已接入的库表注册/).first()).toBeVisible()
  await expect(page.getByText(/从文件上传注册/).first()).toBeVisible()

  // Legacy 兼容：/datasets/new 应 redirect 到 /register。
  await gotoV2(page, '/data-center/datasets/new')
  await page.waitForURL(/\/data-center\/datasets\/register/, { timeout: 5000 })
  await expect(page.getByText(/从已接入的库表注册/).first()).toBeVisible()
})

// ── R04  /extraction/tasks/new 可达（提取任务新建入口）──────────────────────
test('R04 /extraction/tasks/new 提取任务表单可达 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))

  await gotoV2(page, '/extraction/tasks/new')

  await expect(page.getByText('新建提取任务').first()).toBeVisible()
})

// ── R05  /queries 查询中心不崩溃（t.find 回归防线）──────────────────────────
//
// 关键点：同一浏览器上下文里先访问 /data-center/datasources（让 useDatasources
// 以分页对象形状落入 react-query 缓存），再跳到 /queries（useDatasourcesForConsole
// 期望数组形状）。修复后两者的 cache key 应该是独立的，不应出现
// "sources.data.find is not a function" 报错。
test('R05 /queries QueryConsole 不报 t.find @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))
  // 列表分页形状（useDatasources 用）
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  // QueryConsole 用同一路径但以 source_type 简表形式返回数组
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources',
    envelope(
      dsFx.list.items.map((d) => ({ id: d.id, name: d.name, source_type: d.source_type })),
    ),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema',
    envelope({
      datasource_id: 1,
      databases: ['teaching'],
      fetched_at: '2026-04-26T10:00:00+08:00',
    }),
  )
  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasources/1/schema/teaching',
    envelope({
      datasource_id: 1,
      database: 'teaching',
      tables: [{ table_name: 'lesson_progress', comment: '课程进度', row_count: 120 }],
      fetched_at: '2026-04-26T10:00:01+08:00',
    }),
  )

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  // 先经过列表（触发 useDatasources 落 cache）。
  await gotoV2(page, '/data-center/datasources')
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()

  // 再进 QueryConsole。若 cache key 冲突，这里会 t.find is not a function。
  await gotoV2(page, '/queries')

  // 数据目录可见且能加载底层表 ⇒ 没有落到 RouteErrorBoundary 的"页面渲染出错"。
  await expect(page.getByText('数据目录').first()).toBeVisible()
  await expect(page.getByText('lesson_progress').first()).toBeVisible()

  // 捕获到任何 t.find 或 "is not a function" 类型错误都视为回归。
  const fatal = errors.filter((m) => /is not a function|\bt\.find\b/.test(m))
  expect(fatal, `pageerror:\n${errors.join('\n')}`).toEqual([])
})

// ── R06  /data-center/datasets 虚拟表行显示"查看 SQL"按钮 ─────────────────
//
// 修复前：虚拟表行直接把完整 SQL 文本铺在列里。修复后应显示一个可点的
// "查看 SQL" 按钮，点击后弹出 SqlViewerDialog。
test('R06 /data-center/datasets 虚拟表行显示查看 SQL 按钮 @smoke', async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/users/me/preferences', envelope(prefFx.default))

  const virtualDataset = {
    id: 999,
    dataset_code: 'ds_virtual_999',
    dataset_name: 'virtual_kpi_view',
    dataset_type: 'view',
    physical_table: null,
    sql_query:
      'SELECT order_id, SUM(amount) AS total_amount FROM public.orders GROUP BY order_id',
    datasource_id: 1,
    datasource_name: '教学 PostgreSQL',
    row_count: 0,
    column_count: 2,
    sync_status: 'synced',
    last_synced_at: '2026-04-20T08:00:00+08:00',
    created_at: '2026-04-01T08:00:00+08:00',
    updated_at: '2026-04-20T08:00:00+08:00',
  }

  await mockJsonRoute(
    page,
    '**/api/v1/data-center/datasets?**',
    envelope({
      items: [virtualDataset],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    }),
  )

  await gotoV2(page, '/data-center/datasets')

  await expect(page.getByText('virtual_kpi_view').first()).toBeVisible()
  // 查看 SQL 按钮可见且可点（不直接展示 SQL 全文）。
  const viewSqlBtn = page.getByRole('button', { name: /查看\s*SQL/ }).first()
  await expect(viewSqlBtn).toBeVisible()
  await expect(viewSqlBtn).toBeEnabled()
})
