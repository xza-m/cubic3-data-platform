// frontend/tests/e2e-v2/smoke/interaction-contract.spec.ts
//
// C01-C06 — 前端交互契约 smoke。
//
// 这组用例专门约束人工 E2E 容易漏掉的“装配层”行为：
// - 列表行点击必须在当前上下文内打开 PeekPanel，而不是跳到空白页。
// - PeekPanel 的“查看详情”必须落到真实详情页，不允许 404。
// - 应用市场卡片必须保持网格对齐，避免多行卡片上下错位。
// - 访问网关必须用 access_* 契约加载成员权限。

import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

const appCategories = [
  { category: 'agent', display_name: 'Agent', app_count: 2 },
  { category: 'bi_integration', display_name: 'BI 集成', app_count: 1 },
  { category: 'data_alert', display_name: '数据告警', app_count: 1 },
  { category: 'data_notice', display_name: '数据通知', app_count: 3 },
  { category: 'system_maintenance', display_name: '系统维护', app_count: 2 },
]

const apps = [
  app('data_agent', 'DataAgent 智能问答', 'agent', '基于数仓知识体系的自然语言查询 Agent，支持飞书应用和 DataChat 双信道接入', 1),
  app('bi_panel_push', 'BI 看板推送', 'bi_integration', '调用 Superset 截图 API 获取看板截图并推送至飞书群聊', 0),
  app('anomaly_monitor', '异常数据监控', 'data_alert', '执行 SQL 查询并根据阈值判断是否告警', 0),
  app('extract_notice', '数据提取通知', 'data_notice', '监听数据提取完成事件并推送通知', 0),
  app('dataset_card_push', '数据集卡片推送', 'data_notice', '查询数据集元数据并生成飞书交互式卡片推送', 2),
  app('result_push', '查询结果推送', 'data_notice', '执行 SQL 查询并格式化结果推送到飞书', 0),
]

const instance101 = {
  id: 101,
  app_code: 'dataset_card_push',
  name: 'test_push',
  description: '每日推送核心数据集卡片',
  config: { dataset_code: 'ads_school_stats' },
  schedule_type: 'manual',
  schedule_config: null,
  enabled: true,
  owner: 'feishu:tenant:on_owner',
  owner_display_name: '轩志昂',
  created_at: '2026-05-01T10:00:00+08:00',
  updated_at: '2026-05-07T10:00:00+08:00',
  last_execution_at: '2026-05-07T09:30:00+08:00',
  last_execution_status: 'success',
  app: { code: 'dataset_card_push', name: '数据集卡片推送', category: 'data_notice', icon: null },
  stats: {
    total_executions: 3,
    success_count: 2,
    failed_count: 1,
    success_rate: 0.67,
    avg_duration_ms: 1200,
  },
}

const execution9001 = {
  id: 9001,
  instance_id: 101,
  trigger_type: 'manual',
  trigger_display_name: '手动触发',
  status: 'success',
  status_display_name: '成功',
  started_at: '2026-05-07T09:30:00+08:00',
  ended_at: '2026-05-07T09:30:02+08:00',
  duration_ms: 1800,
  duration_seconds: 1.8,
  input_params: { limit: 20 },
  output: { rows: 20, message: 'ok' },
  error_message: null,
  created_at: '2026-05-07T09:30:00+08:00',
  instance: { id: 101, name: 'test_push', app_code: 'dataset_card_push' },
  app: { code: 'dataset_card_push', name: '数据集卡片推送', icon: null },
}

const executions = Array.from({ length: 45 }, (_, index) => ({
  ...execution9001,
  id: 9001 + index,
  status: index % 5 === 0 ? 'failed' : index % 7 === 0 ? 'running' : 'success',
  status_display_name: index % 5 === 0 ? '失败' : index % 7 === 0 ? '运行中' : '成功',
  duration_ms: 1200 + index,
}))

const channel301 = {
  id: 301,
  name: '测试群',
  channel_type: 'webhook',
  description: '飞书测试群 Webhook',
  config: { url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test' },
  enabled: true,
  created_by: 'feishu:tenant:on_admin',
  created_by_display_name: '轩志昂',
  created_at: '2026-05-01T10:00:00+08:00',
  updated_at: '2026-05-07T10:00:00+08:00',
}

const subscription401 = {
  id: 401,
  name: 'Dify-损耗成本',
  description: '失败和完成事件推送',
  app_instance_id: 101,
  channel_id: 301,
  event_types: ['app.execution.completed', 'app.execution.failed'],
  filter_conditions: {},
  delivery_config: {},
  enabled: true,
  created_by: 'feishu:tenant:on_admin',
  created_by_display_name: '轩志昂',
  created_at: '2026-05-01T10:00:00+08:00',
  updated_at: '2026-05-07T10:00:00+08:00',
  app_instance: {
    id: 101,
    name: 'test_push',
    app_code: 'dataset_card_push',
    app_name: '数据集卡片推送',
  },
  channel: { id: 301, name: '测试群', channel_type: 'webhook' },
}

const extractionTask501 = {
  id: 501,
  task_code: 'school_daily_sync',
  task_name: '学校日表同步',
  task_type: 'scheduled',
  source_type: 'maxcompute',
  last_run_status: 'success',
  last_run_at: '2026-05-07T09:00:00+08:00',
  is_active: true,
  created_at: '2026-05-01T10:00:00+08:00',
}

function app(code: string, name: string, category: string, description: string, instanceCount: number) {
  return {
    id: Math.abs(Array.from(code).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)),
    code,
    name,
    category,
    description,
    config_schema: {},
    icon: null,
    author: 'System',
    version: '1.0.0',
    enabled: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-07T10:00:00+08:00',
    instance_count: instanceCount,
    active_instance_count: instanceCount,
    total_execution_count: instanceCount * 3,
  }
}

async function setupInteractionMocks(page: Page): Promise<void> {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))

  await mockJsonRoute(page, /\/api\/v1\/apps\/categories$/, envelope(appCategories))
  await mockJsonRoute(page, /\/api\/v1\/apps(\?.*)?$/, envelope(apps))
  await mockJsonRoute(page, '**/api/v1/apps/dataset_card_push', envelope(apps[4]))
  await mockJsonRoute(page, /\/api\/v1\/app-instances(\?.*)?$/, envelope({
    items: [instance101],
    total: 1,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }))
  await mockJsonRoute(page, '**/api/v1/app-instances/101', envelope(instance101))
  await mockJsonRoute(page, '**/api/v1/app-instances/101/subscriptions', envelope([subscription401]))
  await page.route(/\/api\/v1\/app-executions(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const pageNo = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '20')
    const appCode = url.searchParams.get('app_code')
    const instanceId = url.searchParams.get('instance_id')
    const status = url.searchParams.get('status')
    const filtered = executions.filter((item) => {
      if (appCode && item.app?.code !== appCode && item.instance?.app_code !== appCode) return false
      if (instanceId && String(item.instance_id) !== instanceId) return false
      if (status && item.status !== status) return false
      return true
    })
    const start = (pageNo - 1) * pageSize
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page: pageNo,
        page_size: pageSize,
        total_pages: Math.ceil(filtered.length / pageSize),
      })),
    })
  })
  await mockJsonRoute(page, '**/api/v1/app-executions/9001', envelope(execution9001))
  await mockJsonRoute(page, /\/api\/v1\/channels(\?.*)?$/, envelope({
    items: [channel301],
    total: 1,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }))
  await mockJsonRoute(page, '**/api/v1/channels/301', envelope(channel301))
  await mockJsonRoute(page, '**/api/v1/channels/301/test', envelope({
    ok: true,
    channel_type: 'webhook',
    latency_ms: 21,
    status_code: 200,
    detail: 'ok',
    error: null,
    dry_run: true,
  }))
  await mockJsonRoute(page, /\/api\/v1\/subscriptions(\?.*)?$/, envelope({
    items: [subscription401],
    total: 1,
    page: 1,
    page_size: 50,
    total_pages: 1,
  }))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401', envelope(subscription401))
  await mockJsonRoute(page, '**/api/v1/subscriptions/401/history**', envelope({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  }))
  await mockJsonRoute(page, /\/api\/v1\/extraction\/tasks(\?.*)?$/, envelope({
    items: [extractionTask501],
    total: 1,
    page: 1,
    page_size: 100,
    total_pages: 1,
  }))
  await mockJsonRoute(page, /\/api\/v1\/access\/role-catalog(\?.*)?$/, envelope({
    platform_roles: [
      { role_code: 'governance_admin', name: '管理员', description: '' },
      { role_code: 'product_manager', name: '产品经理', description: '' },
      { role_code: 'semantic_modeler', name: '数据开发', description: '' },
      { role_code: 'viewer', name: '普通用户', description: '' },
    ],
    data_roles: [
      { role_code: 'data_m0_reader', name: '基础数据读取', description: '' },
      { role_code: 'data_m1_reader', name: '汇总数据读取', description: '' },
      { role_code: 'data_m2_detail_reader', name: '明细数据读取', description: '' },
    ],
    api_key_scopes: ['agent.semantic.plan', 'delegation.feishu_user'],
  }))
  await mockJsonRoute(page, /\/api\/v1\/access\/permission-packages(\?.*)?$/, envelope({
    items: [
      {
        package_code: 'admin',
        name: '管理员',
        description: '可管理权限配置',
        role_codes: ['governance_admin', 'auditor'],
        role_type: 'platform',
        data_level: null,
      },
      {
        package_code: 'data_developer',
        name: '数据开发',
        description: '可维护语义模型',
        role_codes: ['semantic_modeler'],
        role_type: 'platform',
        data_level: null,
      },
      {
        package_code: 'data_m1_reader',
        name: '汇总数据读取',
        description: '可访问 M1 汇总数据',
        role_codes: ['data_m0_reader', 'data_m1_reader'],
        role_type: 'data',
        data_level: 'M1',
      },
    ],
    total: 3,
  }))
  await mockJsonRoute(page, /\/api\/v1\/access\/principals(\?.*)?$/, envelope({
    items: [
      {
        principal_id: 'feishu:tenant:on_admin',
        principal_type: 'human',
        idp: 'feishu',
        tenant_key: 'tenant',
        display_name: '轩志昂',
        email: 'xuan@example.com',
        employee_no: '7193',
        status: 'active',
        last_seen_at: '2026-05-07T10:00:00+08:00',
        created_at: '2026-05-01T10:00:00+08:00',
        updated_at: '2026-05-07T10:00:00+08:00',
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
  }))
  await mockJsonRoute(page, '**/api/v1/access/principals/feishu%3Atenant%3Aon_admin', envelope({
    principal_id: 'feishu:tenant:on_admin',
    principal_type: 'human',
    idp: 'feishu',
    tenant_key: 'tenant',
    display_name: '轩志昂',
    email: 'xuan@example.com',
    employee_no: '7193',
    status: 'active',
    last_seen_at: '2026-05-07T10:00:00+08:00',
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-07T10:00:00+08:00',
    platform_roles: ['governance_admin', 'auditor'],
    data_roles: ['data_m0_reader', 'data_m1_reader'],
    role_bindings: [
      {
        id: 1,
        subject_type: 'principal',
        subject_key: 'principal:feishu:tenant:on_admin',
        role_code: 'governance_admin',
        role_type: 'platform',
        source: 'permission_package',
        effective_from: null,
        effective_to: null,
        status: 'active',
        created_by: 'internal:local:admin',
        created_by_display_name: 'admin',
        created_at: '2026-05-07T10:00:00+08:00',
      },
    ],
    aliases: [],
  }))
  await mockJsonRoute(page, /\/api\/v1\/access\/service-principals(\?.*)?$/, envelope([]))
  await mockJsonRoute(page, /\/api\/v1\/governance\/data-policies(\?.*)?$/, envelope({
    items: [
      {
        policy_code: 'm3_raw_block',
        name: 'M3 原始高敏数据阻断',
        description: '',
        status: 'active',
        priority: 10,
        subject_roles: [],
        resource_scope: {
          data_levels: ['M3'],
          table_layers: ['ods', 'raw'],
          table_prefixes: ['ods_', 'raw_'],
          resource_tags: ['sensitive'],
        },
        actions: ['query'],
        effect: 'deny',
        execution_profile_code: null,
        reason: null,
        policy_version: 'v1',
        policy_epoch: 1,
      },
    ],
    total: 1,
  }))
  await mockJsonRoute(page, /\/api\/v1\/governance\/execution-profiles(\?.*)?$/, envelope({
    items: [
      {
        profile_code: 'inline_m0',
        name: 'M0 公开语义内联访问',
        credential_mode: 'inline_policy_decision',
        data_level: 'M0',
        allowed_operations: ['query'],
        max_rows: 1000,
        timeout_seconds: 10,
        export_allowed: false,
        requires_strong_audit: false,
        status: 'active',
      },
    ],
    total: 1,
  }))
  await mockJsonRoute(page, /\/api\/v1\/governance\/policy-decisions(\?.*)?$/, envelope({
    items: [
      {
        decision_id: 'decision_allow_1',
        principal_id: 'feishu:tenant:on_admin',
        principal_display_name: '轩志昂',
        actor_id: null,
        actor_display_name: null,
        decision: 'allow',
        reason_code: 'inline_execution_allowed',
        reason: null,
        data_level: 'M0',
        resource_set: {},
        sql_hashes: ['hash_allow_1'],
        matched_policies: [],
        execution_profile_code: 'inline_m0',
        policy_version: 'v1',
        policy_epoch: 1,
        decision_type: 'query',
        governance_required: false,
        created_at: '2026-05-07T13:51:00+08:00',
      },
      {
        decision_id: 'decision_governance_1',
        principal_id: 'feishu:tenant:on_admin',
        principal_display_name: '轩志昂',
        actor_id: null,
        actor_display_name: null,
        decision: 'deny',
        reason_code: 'governance_required',
        reason: '明细数据需要审批',
        data_level: 'M2',
        resource_set: {},
        sql_hashes: ['hash_governance_1'],
        matched_policies: [],
        execution_profile_code: null,
        policy_version: 'v1',
        policy_epoch: 1,
        decision_type: 'query',
        governance_required: true,
        created_at: '2026-05-07T13:55:00+08:00',
      },
    ],
    total: 2,
  }))
}

async function expectNoNotFound(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /^404$/ })).toHaveCount(0)
  await expect(page.getByText('页面不存在')).toHaveCount(0)
}

function appCardByName(page: Page, name: string): Locator {
  return page.getByText(name, { exact: true }).locator('xpath=ancestor::button[1]')
}

async function boundingBox(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

async function openPeekAndFollowDetail(page: Page, rowText: string, expectedUrl: RegExp, detailText: string) {
  await page.getByText(rowText).first().click()
  await expect(page.getByRole('complementary', { name: '行预览' })).toBeVisible()
  await page.getByRole('button', { name: '查看详情' }).last().click()
  await expect(page).toHaveURL(expectedUrl)
  await expect(page.getByText(detailText).first()).toBeVisible()
  await expectNoNotFound(page)
}

async function expectAppsSecondarySidebar(page: Page) {
  await expect(page.getByText('语义应用上架与发布')).toBeVisible()
  await expect(page.getByRole('link', { name: '应用列表' })).toBeVisible()
  await expect(page.getByRole('link', { name: '应用实例' })).toBeVisible()
  await expect(page.getByRole('link', { name: '执行监控' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await setupInteractionMocks(page)
})

test('C01 应用市场卡片网格保持跨行跨列对齐 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/apps')

  const boxes = await Promise.all(
    apps.map((item) => boundingBox(appCardByName(page, item.name))),
  )
  const firstRowBoxes = boxes.slice(0, 3)
  const secondRowBoxes = boxes.slice(3, 6)
  const topSpread = Math.max(...firstRowBoxes.map((b) => b.y)) - Math.min(...firstRowBoxes.map((b) => b.y))
  const widthSpread = Math.max(...boxes.map((b) => b.width)) - Math.min(...boxes.map((b) => b.width))
  const columnXSpread = Math.max(...firstRowBoxes.map((b, i) => Math.abs(b.x - secondRowBoxes[i].x)))
  const rowGapSpread = Math.max(...secondRowBoxes.map((b) => b.y - firstRowBoxes[0].y)) -
    Math.min(...secondRowBoxes.map((b) => b.y - firstRowBoxes[0].y))

  expect(topSpread).toBeLessThanOrEqual(2)
  expect(widthSpread).toBeLessThanOrEqual(2)
  expect(columnXSpread).toBeLessThanOrEqual(2)
  expect(rowGapSpread).toBeLessThanOrEqual(2)
  await expectNoNotFound(page)
})

test('C02 应用实例列表行点击打开 PeekPanel，查看详情不落 404 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/apps/instances')
  await openPeekAndFollowDetail(page, 'test_push', /\/apps\/instances\/101$/, 'test_push')
})

test('C03 执行监控列表行点击打开 PeekPanel，查看详情不落 404 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/executions')
  await expect(page).toHaveURL(/\/apps\/executions$/)
  await expectAppsSecondarySidebar(page)
  await openPeekAndFollowDetail(page, '#9001', /\/apps\/executions\/9001$/, '#9001')
  await expectAppsSecondarySidebar(page)
})

test('C04 渠道列表行点击打开 PeekPanel，查看详情不落 404 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/config/channels')
  await openPeekAndFollowDetail(page, '测试群', /\/config\/channels\/301$/, '基础信息')
})

test('C05 订阅列表行点击打开 PeekPanel，查看详情不落 404 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/config/subscriptions')
  await openPeekAndFollowDetail(page, 'Dify-损耗成本', /\/config\/subscriptions\/401$/, 'Dify-损耗成本')
})

test('C06 访问网关使用 access 成员权限契约加载 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/config/access')

  await expect(page.getByRole('heading', { name: '权限管理' })).toBeVisible()
  await expect(page.getByRole('link', { name: '权限管理' })).toBeVisible()
  await expect(page.getByRole('link', { name: '权限审计' })).toBeVisible()
  await expect(page.getByRole('link', { name: '网关观测' })).toBeVisible()
  await expect(page.getByRole('button', { name: '权限配置' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '执行与审计' })).toHaveCount(0)
  await expect(page.getByText('成员权限加载失败')).toHaveCount(0)
  await expect(page.getByText('轩志昂').first()).toBeVisible()
  await expect(page.getByText('飞书同步').first()).toBeVisible()
  await page.getByText('轩志昂').first().click()
  await expect(page.getByRole('complementary', { name: '成员权限配置' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('轩志昂')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByRole('heading', { name: '平台角色' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByRole('heading', { name: '数据访问权限' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('汇总数据读取')).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('邮箱')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('工号')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('principal:feishu:tenant:on_admin')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByText('权限配置', { exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '成员权限配置' }).getByRole('button', { name: '保存权限配置' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '调整权限' })).toBeVisible()
  await page.getByRole('button', { name: '调整权限' }).click()
  await expect(page.getByRole('dialog').getByText('调整成员权限')).toBeVisible()
  await expect(page.getByRole('dialog').getByLabel('平台角色')).toBeVisible()
  await expect(page.getByRole('dialog').getByLabel('数据访问权限')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: '保存权限配置' })).toBeVisible()
  const updateRequestPromise = page.waitForRequest((request) => (
    request.method() === 'PUT'
    && request.url().includes('/api/v1/access/principals/feishu%3Atenant%3Aon_admin/permission-packages')
  ))
  await page.getByRole('dialog').getByLabel('平台角色').selectOption('data_developer')
  await page.getByRole('dialog').getByLabel('数据访问权限').selectOption('')
  await page.getByRole('dialog').getByRole('button', { name: '保存权限配置' }).click()
  const updateRequest = await updateRequestPromise
  expect(updateRequest.postDataJSON()).toEqual({ package_codes: ['data_developer'] })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '展开上下文面板' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: '行预览' })).toHaveCount(0)

  await page.getByRole('button', { name: '机器人接入' }).click()
  await page.getByRole('button', { name: '新建机器人' }).click()
  await expect(page.getByRole('dialog').getByText('负责人')).toBeVisible()
  await expect(page.getByPlaceholder('搜索姓名 / 邮箱 / Principal ID')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: '创建机器人' })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('button', { name: '数据访问规则' }).click()
  await expect(page.getByRole('button', { name: '展开剩余 3 项' })).toBeVisible()
  await page.getByRole('button', { name: '展开剩余 3 项' }).click()
  await expect(page.getByText('资源标签 sensitive')).toBeVisible()
  await expect(page.getByRole('button', { name: '收起', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新建访问规则' }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: '创建访问规则' })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await page.getByRole('link', { name: '权限审计' }).click()
  await expect(page).toHaveURL(/\/config\/access\/audit$/)
  await expect(page.getByRole('heading', { name: '权限审计' })).toBeVisible()
  await expect(page.getByText('权限审批记录').first()).toBeVisible()
  await expect(page.getByText('明细数据需要审批')).toBeVisible()
  await expect(page.getByText('最近权限判定')).toBeVisible()

  await page.getByRole('link', { name: '网关观测' }).click()
  await expect(page).toHaveURL(/\/config\/access\/observability$/)
  await expect(page.getByRole('heading', { name: '网关观测' })).toBeVisible()
  await expect(page.getByText('权限审批记录')).toHaveCount(0)
  await expect(page.getByText('执行身份')).toHaveCount(0)
  await expect(page.getByText('查询次数', { exact: true })).toBeVisible()
  await expect(page.getByText('稳定性', { exact: true })).toBeVisible()
  await expect(page.getByText('网关拦截', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('访问趋势', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '全平台访问记录' })).toBeVisible()
  await expect(page.getByText('访问等级分布')).toBeVisible()
  await expect(page.getByText('物理权限检查')).toBeVisible()
  const traceButtons = page.getByRole('button', { name: '查看' })
  if (await traceButtons.count() > 0) {
    await traceButtons.first().click()
    await expect(page.getByRole('dialog').getByText('Principal 解析')).toBeVisible()
    await expect(page.getByRole('dialog').getByText('MaxCompute 兜底')).toBeVisible()
  } else {
    await expect(page.getByText('暂无网关执行记录')).toBeVisible()
  }
  await expectNoNotFound(page)
})

test('C07 执行记录列表有 20 条分页契约，翻页后仍保持应用侧边栏 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/apps/executions')

  await expect(page.getByText('1-20 / 45 条')).toBeVisible()
  await expect(page.getByText('#9001').first()).toBeVisible()
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('21-40 / 45 条')).toBeVisible()
  await expect(page.getByText('#9021').first()).toBeVisible()
  await expectAppsSecondarySidebar(page)
  await expectNoNotFound(page)
})

test('C08 共性工具栏控件使用统一语义 @smoke @interaction-contract', async ({ page }) => {
  await gotoV2(page, '/apps')
  await expect(page.getByRole('searchbox', { name: '搜索应用' })).toBeVisible()
  const viewModeGroup = page.getByRole('group', { name: '切换视图' })
  await expect(viewModeGroup).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新应用列表' })).toBeVisible()
  await expect(viewModeGroup.getByRole('button', { name: '卡片' })).toHaveAttribute('aria-pressed', 'true')

  await gotoV2(page, '/apps/instances')
  await expect(page.getByRole('searchbox', { name: '搜索应用实例' })).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新应用实例' })).toBeVisible()
  await expect(page.getByRole('button', { name: '创建实例' })).toBeVisible()

  await gotoV2(page, '/apps/executions')
  await expect(page.getByRole('searchbox', { name: '搜索执行记录' })).toBeVisible()
  await expect(page.getByLabel('筛选执行状态')).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新执行记录' })).toBeVisible()

  await gotoV2(page, '/extraction/tasks')
  await expect(page.getByRole('searchbox', { name: '搜索提取任务' })).toBeVisible()
  await expect(page.getByLabel('筛选任务状态')).toBeVisible()
  await expect(page.getByLabel('筛选任务类型')).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新提取任务' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建任务' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '提取任务' })).toHaveCount(0)

  await gotoV2(page, '/config/access')
  await expect(page.getByRole('searchbox', { name: '搜索成员权限' })).toBeVisible()
  await expect(page.getByLabel('筛选成员来源')).toBeVisible()
  await expect(page.getByRole('button', { name: '刷新成员权限' })).toBeVisible()
  await expectNoNotFound(page)
})
