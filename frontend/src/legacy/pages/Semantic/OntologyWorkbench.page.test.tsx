import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OntologyWorkbench from './OntologyWorkbench'

const ontologyApiMocks = vi.hoisted(() => ({
  getOntologyWorkbenchObjects: vi.fn(),
  getOntologyWorkbenchObjectOverview: vi.fn(),
  getOntologyWorkbenchGovernance: vi.fn(),
  listBusinessMetrics: vi.fn(),
  listBusinessRelations: vi.fn(),
  getBusinessMetricLinks: vi.fn(),
  getExecutionCompilePreview: vi.fn(),
  getExecutionPlanPreview: vi.fn(),
  previewSemanticMapping: vi.fn(),
  getPolicyImpact: vi.fn(),
  getPolicyAudit: vi.fn(),
  saveBusinessObject: vi.fn(),
  publishOntologyEntity: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/ontology', () => ({
  getOntologyWorkbenchObjects: ontologyApiMocks.getOntologyWorkbenchObjects,
  getOntologyWorkbenchObjectOverview: ontologyApiMocks.getOntologyWorkbenchObjectOverview,
  getOntologyWorkbenchGovernance: ontologyApiMocks.getOntologyWorkbenchGovernance,
  listBusinessMetrics: ontologyApiMocks.listBusinessMetrics,
  listBusinessRelations: ontologyApiMocks.listBusinessRelations,
  getBusinessMetricLinks: ontologyApiMocks.getBusinessMetricLinks,
  getExecutionCompilePreview: ontologyApiMocks.getExecutionCompilePreview,
  getExecutionPlanPreview: ontologyApiMocks.getExecutionPlanPreview,
  previewSemanticMapping: ontologyApiMocks.previewSemanticMapping,
  getPolicyImpact: ontologyApiMocks.getPolicyImpact,
  getPolicyAudit: ontologyApiMocks.getPolicyAudit,
  saveBusinessObject: ontologyApiMocks.saveBusinessObject,
  publishOntologyEntity: ontologyApiMocks.publishOntologyEntity,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    useToast: () => ({ toast: ontologyApiMocks.toast }),
  }
})

function renderPage(initialEntry = '/semantic/ontology') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <OntologyWorkbench />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function mockBaseApis() {
  ontologyApiMocks.getOntologyWorkbenchObjects.mockResolvedValue({
    data: {
      items: [
        {
          name: 'order',
          title: '订单',
          description: '记录交易全生命周期',
          aliases: ['交易'],
          status: 'active',
          stats: { property_count: 2, metric_count: 1, relation_count: 2, action_count: 1, rule_count: 1 },
          risk_summary: { stale_count: 0, consistency_count: 1 },
          last_activity: {
            id: 'history-1',
            entity_type: 'object',
            entity_name: 'order',
            action: 'saved',
            status: 'active',
            summary: '保存业务对象 订单',
            timestamp: '2026-04-16T09:00:00',
          },
        },
        {
          name: 'customer',
          title: '用户',
          description: '用户对象',
          aliases: [],
          status: 'draft',
          stats: { property_count: 1, metric_count: 0, relation_count: 1, action_count: 0, rule_count: 0 },
          risk_summary: { stale_count: 0, consistency_count: 0 },
          last_activity: null,
        },
      ],
      total: 2,
    },
  })
  ontologyApiMocks.getOntologyWorkbenchObjectOverview.mockResolvedValue({
    data: {
      object: {
        name: 'order',
        title: '订单',
        description: '记录交易全生命周期',
        aliases: ['交易订单'],
        status: 'active',
      },
      stats: { property_count: 2, metric_count: 1, relation_count: 2, action_count: 1, rule_count: 1 },
      capabilities: {
        properties: [
          {
            name: 'order_amount',
            title: '订单金额',
            object_name: 'order',
            property_type: 'number',
            description: '订单金额',
            aliases: [],
            status: 'active',
          },
        ],
        actions: [
          {
            name: 'pay',
            title: '支付',
            object_name: 'order',
            trigger_time_property: 'pay_time',
            description: '订单支付动作',
            event_cube_refs: ['payment_events'],
            aliases: [],
            status: 'active',
          },
        ],
      },
      associations: {
        metrics: [
          {
            name: 'gmv',
            title: 'GMV',
            object_name: 'order',
            semantic_formula: '已支付订单金额之和',
            description: '核心成交指标',
            semantic_labels: ['经营分析'],
            measure_refs: ['orders.gmv'],
            aliases: ['成交额'],
            status: 'active',
          },
        ],
        relations: [
          {
            name: 'order_customer',
            title: '订单归属用户',
            source_object_name: 'order',
            target_object_name: 'customer',
            relation_type: 'belongs_to',
            description: '订单归属用户',
            aliases: [],
            status: 'active',
          },
        ],
        rules: [
          {
            name: 'order_visibility',
            target_type: 'object',
            target_name: 'order',
            visibility: 'restricted',
            allowed_roles: ['finance'],
            description: '订单对象受限可见',
            status: 'active',
          },
        ],
      },
      governance: {
        stale_items: [],
        consistency_items: [{ entity_name: 'order', reason: '对象口径不一致' }],
        audit_total: 1,
        recent_audits: [],
      },
      lifecycle: {
        history_items: [
          {
            id: 'history-1',
            entity_type: 'object',
            entity_name: 'order',
            action: 'saved',
            status: 'active',
            summary: '保存业务对象 订单',
            timestamp: '2026-04-16T09:00:00',
          },
        ],
        history_total: 1,
        last_activity: {
          id: 'history-1',
          entity_type: 'object',
          entity_name: 'order',
          action: 'saved',
          status: 'active',
          summary: '保存业务对象 订单',
          timestamp: '2026-04-16T09:00:00',
        },
      },
    },
  })
  ontologyApiMocks.getOntologyWorkbenchGovernance.mockResolvedValue({
    data: {
      summary: { policy_total: 1, stale_count: 1, consistency_count: 1, audit_total: 1 },
      items: [
        {
          name: 'gmv_policy',
          target_type: 'metric',
          target_name: 'gmv',
          visibility: 'restricted',
          allowed_roles: ['finance'],
          description: 'GMV 受限可见',
          status: 'active',
          issue_count: 1,
          issues: ['存在投影风险'],
          projection_status: 'warning',
          audit_total: 1,
          last_audit: {
            id: 'audit-1',
            target_type: 'metric',
            target_name: 'gmv',
            viewer_roles: ['finance'],
            route_type: 'cube',
            execution_target: 'orders',
            decision: 'allow',
            timestamp: '2026-04-16T10:00:00',
          },
        },
      ],
      stale_items: [{ entity_name: 'gmv', reason: 'stale metric' }],
      consistency_items: [{ entity_name: 'gmv', reason: 'consistency issue' }],
      recent_audits: [],
    },
  })
  ontologyApiMocks.listBusinessMetrics.mockResolvedValue({
    data: {
      items: [
        {
          name: 'gmv',
          title: 'GMV',
          object_name: 'order',
          semantic_formula: '已支付订单金额之和',
          description: '核心成交指标',
          semantic_labels: ['经营分析'],
          measure_refs: ['orders.gmv'],
          aliases: [],
          status: 'active',
        },
        {
          name: 'refund_amount',
          title: '退款金额',
          object_name: 'order',
          semantic_formula: '退款金额之和',
          description: '退款指标',
          semantic_labels: [],
          measure_refs: [],
          aliases: [],
          status: 'draft',
        },
      ],
      total: 2,
    },
  })
  ontologyApiMocks.listBusinessRelations.mockResolvedValue({
    data: {
      items: [
        {
          name: 'order_customer',
          title: '订单归属用户',
          source_object_name: 'order',
          target_object_name: 'customer',
          relation_type: 'belongs_to',
          description: '订单归属用户',
          aliases: [],
          status: 'active',
        },
      ],
      total: 1,
    },
  })
  ontologyApiMocks.getBusinessMetricLinks.mockResolvedValue({
    data: {
      metric_name: 'gmv',
      metric_title: 'GMV',
      object_name: 'order',
      semantic_formula: '已支付订单金额之和',
      linked_measures: [{ measure_ref: 'orders.gmv' }],
      linked_cubes: [{ cube_name: 'orders' }],
      consistency: { status: 'ok', issues: [] },
    },
  })
  ontologyApiMocks.getExecutionCompilePreview.mockResolvedValue({
    data: {
      status: 'ready',
      target_type: 'sql',
      pseudo_sql: 'select sum(amount) from orders',
      bindings: {},
    },
  })
  ontologyApiMocks.getExecutionPlanPreview.mockResolvedValue({
    data: {
      target_type: 'sql',
      status: 'ready',
      steps: [{ step_type: 'sql', title: '执行 SQL 查询', status: 'ready' }],
    },
  })
  ontologyApiMocks.previewSemanticMapping.mockResolvedValue({
    data: {
      entity: {},
      projection: { targets: [{ target_name: 'orders.customers', match_reason: '命中 join path' }] },
      consistency: { status: 'ok', issues: [] },
    },
  })
  ontologyApiMocks.getPolicyImpact.mockResolvedValue({
    data: {
      target_type: 'metric',
      target_name: 'gmv',
      visibility: 'restricted',
      allowed_roles: ['finance'],
      projection_status: 'warning',
      linked_entity_count: 1,
      analysis_links: { cubes: [], measures: [], join_paths: [], event_cubes: [] },
      governance_hooks: [],
      issues: ['存在投影风险'],
    },
  })
  ontologyApiMocks.getPolicyAudit.mockResolvedValue({
    data: {
      policy_name: 'gmv_policy',
      items: [
        {
          id: 'audit-1',
          target_type: 'metric',
          target_name: 'gmv',
          viewer_roles: ['finance'],
          route_type: 'cube',
          execution_target: 'orders',
          decision: 'allow',
          timestamp: '2026-04-16T10:00:00',
        },
      ],
      total: 1,
    },
  })
  ontologyApiMocks.saveBusinessObject.mockResolvedValue({
    data: {
      name: 'order',
      title: '订单',
      description: '记录交易全生命周期',
      aliases: ['交易订单'],
      status: 'active',
    },
  })
  ontologyApiMocks.publishOntologyEntity.mockResolvedValue({
    data: {
      entity: { status: 'active' },
      validation: { preview_status: 'ok', issues: [] },
    },
  })
}

describe('OntologyWorkbench page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBaseApis()
  })

  it('默认进入壳层总览视图并显示空态提示', async () => {
    renderPage()

    expect(await screen.findByText('壳层总览')).toBeInTheDocument()
    expect(screen.getByText('本体工作台 · 对象聚合组架构')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择对象' })).toBeInTheDocument()
    expect(screen.getByText('请从左侧选择一个对象')).toBeInTheDocument()

    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('本体工作台 / 壳层总览')).toBeInTheDocument()
  })

  it('侧栏展示业务对象分组并可通过六边形 icon 进入对象详情', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('业务对象')).toBeInTheDocument()
    expect(screen.getByText('专项索引')).toBeInTheDocument()

    const orderButton = await screen.findByRole('button', { name: /订单/ })
    await user.click(orderButton)

    expect(await screen.findByText('聚合根配置')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '对象定义' })).toBeInTheDocument()
  })

  it('对象列表改造为卡片网格并展示字段/关系/规则大数字', async () => {
    renderPage('/semantic/ontology?tab=objects')

    const card = await screen.findByRole('button', { name: /订单 卡片/ })
    expect(within(card).getByText('订单')).toBeInTheDocument()
    expect(within(card).getByText('order')).toBeInTheDocument()
    expect(within(card).getByText('字段数')).toBeInTheDocument()
    expect(within(card).getByText('关系数')).toBeInTheDocument()
    expect(within(card).getByText('规则数')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: '+ 新建对象' })).toBeInTheDocument()
  })

  it('进入对象详情后展示对象定义表单与聚合根 toggle', async () => {
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=definition')

    expect(await screen.findByText('聚合根配置')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByText('已启用')).toBeInTheDocument()
    expect(screen.getByLabelText('对象名称')).toBeInTheDocument()
    expect(screen.getByLabelText('英文标识符')).toBeInTheDocument()
    expect(screen.getByLabelText('所属域')).toBeInTheDocument()
    expect(screen.getByLabelText('负责人')).toBeInTheDocument()
  })

  it('字段列表面板展示属性与动作能力', async () => {
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=fields')

    expect((await screen.findAllByText('订单金额')).length).toBeGreaterThan(0)
    expect(screen.getByText('number')).toBeInTheDocument()
    expect(screen.getByText('对象动作')).toBeInTheDocument()
    expect(screen.getByText('支付')).toBeInTheDocument()
    expect(screen.getByText(/事件 Cube/)).toBeInTheDocument()
  })

  it('关系图面板展示关系、指标与分析模型绑定', async () => {
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=relations')

    expect((await screen.findAllByText('订单归属用户')).length).toBeGreaterThan(0)
    expect(screen.getByText('关联业务指标')).toBeInTheDocument()
    expect(screen.getByText('GMV')).toBeInTheDocument()
    expect(screen.getByText(/Measure：orders.gmv/)).toBeInTheDocument()
    expect(screen.getByText('关联分析模型')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
    expect(screen.getByText('payment_events')).toBeInTheDocument()
  })

  it('业务指标索引展示 info bar 与绑定状态 badge', async () => {
    renderPage('/semantic/ontology?tab=metrics')

    expect(await screen.findByRole('heading', { level: 1, name: '业务指标索引' })).toBeInTheDocument()
    expect(screen.getByText(/业务指标是对象下的语义能力声明/)).toBeInTheDocument()

    await screen.findByText(/measure: gmv/)
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('已绑定').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('未绑定').length).toBeGreaterThan(0)
    expect(screen.queryByText('执行预览')).not.toBeInTheDocument()
  })

  it('关系索引展示彩色 code badge 且不渲染右侧检查器', async () => {
    renderPage('/semantic/ontology?tab=relations')

    expect(await screen.findByRole('heading', { level: 1, name: '关系索引' })).toBeInTheDocument()
    await waitFor(() => expect(ontologyApiMocks.listBusinessRelations).toHaveBeenCalled())
    const relationBadges = await screen.findAllByText('belongs_to')
    expect(relationBadges.length).toBeGreaterThan(0)
    expect(screen.queryByText('检查器')).not.toBeInTheDocument()
    expect(screen.queryByText('关系详情')).not.toBeInTheDocument()
  })

  it('规则与治理展示单条规则卡片与平台级治理信号', async () => {
    renderPage('/semantic/ontology?tab=policies')

    expect(await screen.findByRole('heading', { level: 1, name: '规则与治理' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /规则 gmv_policy/ })).toBeInTheDocument()
    expect(screen.getByText('规则摘要')).toBeInTheDocument()
    expect(screen.getByText('风险与审计')).toBeInTheDocument()
    expect(screen.getByText('平台级治理信号')).toBeInTheDocument()
    expect(screen.getByText('存在投影风险')).toBeInTheDocument()
    expect(screen.queryByText('检查器')).not.toBeInTheDocument()
  })

  it('支持保存对象与发布对象', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=definition')

    const saveButton = await screen.findByRole('button', { name: '保存' })
    await user.click(saveButton)
    await waitFor(() => expect(ontologyApiMocks.saveBusinessObject).toHaveBeenCalledTimes(1))

    const publishButton = screen.getByRole('button', { name: '发布' })
    await user.click(publishButton)
    await waitFor(() => expect(ontologyApiMocks.publishOntologyEntity).toHaveBeenCalledWith('objects', 'order'))
  })

  it('对象详情接口失败时展示降级提示', async () => {
    ontologyApiMocks.getOntologyWorkbenchObjectOverview.mockRejectedValueOnce(new Error('overview failed'))
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=definition')

    expect(await screen.findByText('对象详情加载失败')).toBeInTheDocument()
    expect(screen.getByText('请稍后重试，或检查后端 OWV2 工作台聚合接口是否可用。')).toBeInTheDocument()
  })

  it('对象列表支持按关键字与风险筛选', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=objects')

    const searchInput = await screen.findByPlaceholderText('按名称筛选...')
    await user.type(searchInput, '用户')
    expect(screen.getByRole('button', { name: /用户 卡片/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /订单 卡片/ })).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.selectOptions(screen.getByRole('combobox'), 'warning')
    expect(screen.getByRole('button', { name: /订单 卡片/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /用户 卡片/ })).not.toBeInTheDocument()
  })

  it('空对象列表时展示 OWV2 空态', async () => {
    ontologyApiMocks.getOntologyWorkbenchObjects.mockResolvedValueOnce({
      data: { items: [], total: 0 },
    })

    renderPage('/semantic/ontology?tab=objects')

    expect(await screen.findByText('暂无对象，可通过新建对象开始建模。')).toBeInTheDocument()
  })

  it('业务指标索引支持未绑定筛选', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=metrics')

    expect(await screen.findByRole('heading', { level: 1, name: '业务指标索引' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('绑定状态'), 'unbound')

    const table = screen.getByRole('table')
    expect(within(table).getByText('退款金额')).toBeInTheDocument()
    expect(within(table).queryByText('GMV')).not.toBeInTheDocument()
  })

  it('规则与治理在无风险项时展示空提示', async () => {
    ontologyApiMocks.getPolicyImpact.mockResolvedValueOnce({
      data: {
        target_type: 'metric',
        target_name: 'gmv',
        visibility: 'restricted',
        allowed_roles: ['finance'],
        projection_status: 'ok',
        linked_entity_count: 0,
        analysis_links: { cubes: [], measures: [], join_paths: [], event_cubes: [] },
        governance_hooks: [],
        issues: [],
      },
    })

    renderPage('/semantic/ontology?tab=policies&entity=gmv_policy')

    expect(await screen.findByRole('heading', { level: 1, name: '规则与治理' })).toBeInTheDocument()
    expect(await screen.findByText('当前规则暂无额外风险项。')).toBeInTheDocument()
  })

  it('保存失败时展示 destructive toast', async () => {
    const user = userEvent.setup()
    ontologyApiMocks.saveBusinessObject.mockRejectedValueOnce(new Error('save failed'))
    renderPage('/semantic/ontology?tab=objects&entity=__new__&panel=definition')

    await user.type(await screen.findByLabelText('英文标识符'), 'lesson')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(ontologyApiMocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '保存失败',
          description: 'save failed',
          variant: 'destructive',
        }),
      ),
    )
  })

  it('发布失败时展示 destructive toast', async () => {
    const user = userEvent.setup()
    ontologyApiMocks.publishOntologyEntity.mockRejectedValueOnce(new Error('publish failed'))
    renderPage('/semantic/ontology?tab=objects&entity=order&panel=definition')

    await user.click(await screen.findByRole('button', { name: '发布' }))

    await waitFor(() =>
      expect(ontologyApiMocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '发布失败',
          description: 'publish failed',
          variant: 'destructive',
        }),
      ),
    )
  })
})
