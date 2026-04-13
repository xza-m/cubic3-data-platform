import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OntologyWorkbench from './OntologyWorkbench'

const ontologyApiMocks = vi.hoisted(() => ({
  listBusinessObjects: vi.fn(),
  saveBusinessObject: vi.fn(),
  listBusinessProperties: vi.fn(),
  saveBusinessProperty: vi.fn(),
  listBusinessMetrics: vi.fn(),
  saveBusinessMetric: vi.fn(),
  listBusinessRelations: vi.fn(),
  saveBusinessRelation: vi.fn(),
  listBusinessActions: vi.fn(),
  saveBusinessAction: vi.fn(),
  listGlossaryEntries: vi.fn(),
  saveGlossaryEntry: vi.fn(),
  listPolicyMetadata: vi.fn(),
  getOntologyTemplate: vi.fn(),
  applyOntologyTemplate: vi.fn(),
  getPolicyImpact: vi.fn(),
  getPolicyAudit: vi.fn(),
  getOntologyEntityImpact: vi.fn(),
  getOntologyEntityHistory: vi.fn(),
  publishOntologyEntity: vi.fn(),
  savePolicyMetadata: vi.fn(),
  previewSemanticMapping: vi.fn(),
  getCubeBacklinks: vi.fn(),
  getBusinessMetricLinks: vi.fn(),
  getMeasureBacklinks: vi.fn(),
  getExecutionCompilePreview: vi.fn(),
  getExecutionExecute: vi.fn(),
  getExecutionPlanPreview: vi.fn(),
  getSemanticPlanPreview: vi.fn(),
  getSemanticRoutePreview: vi.fn(),
  getSemanticExecutePlanPreview: vi.fn(),
  getSemanticExecutePlan: vi.fn(),
  getSemanticStaleCheck: vi.fn(),
  getSemanticConsistencyReport: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/ontology', () => ({
  listBusinessObjects: ontologyApiMocks.listBusinessObjects,
  saveBusinessObject: ontologyApiMocks.saveBusinessObject,
  listBusinessProperties: ontologyApiMocks.listBusinessProperties,
  saveBusinessProperty: ontologyApiMocks.saveBusinessProperty,
  listBusinessMetrics: ontologyApiMocks.listBusinessMetrics,
  saveBusinessMetric: ontologyApiMocks.saveBusinessMetric,
  listBusinessRelations: ontologyApiMocks.listBusinessRelations,
  saveBusinessRelation: ontologyApiMocks.saveBusinessRelation,
  listBusinessActions: ontologyApiMocks.listBusinessActions,
  saveBusinessAction: ontologyApiMocks.saveBusinessAction,
  listGlossaryEntries: ontologyApiMocks.listGlossaryEntries,
  saveGlossaryEntry: ontologyApiMocks.saveGlossaryEntry,
  listPolicyMetadata: ontologyApiMocks.listPolicyMetadata,
  getOntologyTemplate: ontologyApiMocks.getOntologyTemplate,
  applyOntologyTemplate: ontologyApiMocks.applyOntologyTemplate,
  getPolicyImpact: ontologyApiMocks.getPolicyImpact,
  getPolicyAudit: ontologyApiMocks.getPolicyAudit,
  getOntologyEntityImpact: ontologyApiMocks.getOntologyEntityImpact,
  getOntologyEntityHistory: ontologyApiMocks.getOntologyEntityHistory,
  publishOntologyEntity: ontologyApiMocks.publishOntologyEntity,
  savePolicyMetadata: ontologyApiMocks.savePolicyMetadata,
  previewSemanticMapping: ontologyApiMocks.previewSemanticMapping,
  getCubeBacklinks: ontologyApiMocks.getCubeBacklinks,
  getBusinessMetricLinks: ontologyApiMocks.getBusinessMetricLinks,
  getMeasureBacklinks: ontologyApiMocks.getMeasureBacklinks,
  getExecutionCompilePreview: ontologyApiMocks.getExecutionCompilePreview,
  getExecutionExecute: ontologyApiMocks.getExecutionExecute,
  getExecutionPlanPreview: ontologyApiMocks.getExecutionPlanPreview,
  getSemanticPlanPreview: ontologyApiMocks.getSemanticPlanPreview,
  getSemanticRoutePreview: ontologyApiMocks.getSemanticRoutePreview,
  getSemanticExecutePlanPreview: ontologyApiMocks.getSemanticExecutePlanPreview,
  getSemanticExecutePlan: ontologyApiMocks.getSemanticExecutePlan,
  getSemanticStaleCheck: ontologyApiMocks.getSemanticStaleCheck,
  getSemanticConsistencyReport: ontologyApiMocks.getSemanticConsistencyReport,
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

describe('OntologyWorkbench page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ontologyApiMocks.listBusinessObjects.mockResolvedValue({
      data: {
        items: [
          { name: 'order', title: '订单', description: '订单对象', aliases: ['交易'], status: 'active' },
          { name: 'customer', title: '客户', description: '客户对象', aliases: [], status: 'draft' },
        ],
        total: 2,
      },
    })
    ontologyApiMocks.listBusinessProperties.mockResolvedValue({
      data: {
        items: [
          {
            name: 'order_amount',
            title: '支付金额',
            object_name: 'order',
            property_type: 'number',
            description: '订单支付金额',
            aliases: [],
            status: 'active',
          },
        ],
        total: 1,
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
            aliases: ['成交额'],
            status: 'active',
          },
        ],
        total: 1,
      },
    })
    ontologyApiMocks.listGlossaryEntries.mockResolvedValue({
      data: {
        items: [{ term: '成交额', canonical_name: 'gmv', entry_type: 'metric', aliases: ['GMV'], description: '业务术语' }],
        total: 1,
      },
    })
    ontologyApiMocks.listBusinessRelations.mockResolvedValue({
      data: {
        items: [
          {
            name: 'customer_submits_order',
            title: '客户下单',
            source_object_name: 'customer',
            target_object_name: 'order',
            relation_type: 'submits',
            description: '客户向订单提交下单行为',
            aliases: ['下单关系'],
            status: 'active',
          },
        ],
        total: 1,
      },
    })
    ontologyApiMocks.listBusinessActions.mockResolvedValue({
      data: {
        items: [
          {
            name: 'pay',
            title: '支付',
            object_name: 'order',
            trigger_time_property: 'pay_time',
            description: '订单完成支付',
            event_cube_refs: ['orders'],
            aliases: ['完成支付'],
            status: 'active',
          },
        ],
        total: 1,
      },
    })
    ontologyApiMocks.listPolicyMetadata.mockResolvedValue({
      data: {
        items: [
          {
            name: 'gmv_policy',
            target_type: 'metric',
            target_name: 'gmv',
            visibility: 'restricted',
            allowed_roles: ['finance'],
            description: 'GMV 仅财务可见',
          },
        ],
        total: 1,
      },
    })
    ontologyApiMocks.getOntologyTemplate.mockResolvedValue({
      data: {
        name: 'order-domain',
        title: '订单域模板',
        summary: {
          objects: 2,
          properties: 3,
          metrics: 1,
          relations: 1,
          actions: 1,
          glossary: 1,
          policies: 1,
        },
        items: {
          objects: [{ name: 'order', title: '订单' }],
          properties: [],
          metrics: [],
          relations: [],
          actions: [],
          glossary: [],
          policies: [],
        },
      },
    })
    ontologyApiMocks.applyOntologyTemplate.mockResolvedValue({
      data: {
        template: 'order-domain',
        title: '订单域模板',
        created: { objects: ['order'] },
        skipped: {},
        summary: { created: 10, skipped: 0 },
      },
    })
    ontologyApiMocks.getPolicyImpact.mockResolvedValue({
      data: {
        target_type: 'metric',
        target_name: 'gmv',
        visibility: 'restricted',
        allowed_roles: ['finance'],
        projection_status: 'ok',
        linked_entity_count: 2,
        analysis_links: {
          cubes: [{ cube_name: 'orders' }],
          measures: [{ measure_ref: 'orders.gmv' }],
          join_paths: [],
          event_cubes: [],
        },
        governance_hooks: [
          { hook: 'semantic-router', status: 'active', effect: 'route-block' },
          { hook: 'execution-compiler', status: 'active', effect: 'execute-block' },
        ],
        issues: [],
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
            execution_target: 'sql',
            decision: 'allow',
            policy: 'gmv_policy',
            timestamp: '2026-04-08T12:00:00.000000',
          },
        ],
        total: 1,
      },
    })
    ontologyApiMocks.getOntologyEntityImpact.mockImplementation(async (entityType: string, entityName: string) => ({
      data: {
        entity_type: entityType,
        entity_name: entityName,
        projection: { targets: [{ target_type: 'cube', target_name: 'orders' }] },
        consistency: { status: 'ok', issues: [] },
        traceability: { ontology: { name: entityName }, analysis: { cube_name: 'orders' } },
      },
    }))
    ontologyApiMocks.getOntologyEntityHistory.mockImplementation(async (entityType: string, entityName: string) => ({
      data: {
        entity_type: entityType,
        entity_name: entityName,
        items: [
          {
            id: `${entityType}-${entityName}-saved`,
            entity_type: entityType,
            entity_name: entityName,
            action: 'saved',
            status: 'draft',
            summary: `保存 ${entityName}`,
            timestamp: '2026-04-08T11:00:00.000000',
          },
        ],
        total: 1,
      },
    }))
    ontologyApiMocks.publishOntologyEntity.mockResolvedValue({
      data: {
        entity: { name: 'gmv', status: 'active' },
        validation: { preview_status: 'ok', issues: [] },
      },
    })
    ontologyApiMocks.getSemanticStaleCheck.mockResolvedValue({
      data: { summary: { stale_count: 1 }, items: [] },
    })
    ontologyApiMocks.getSemanticConsistencyReport.mockResolvedValue({
      data: { summary: { issue_count: 2 }, items: [] },
    })
    ontologyApiMocks.getExecutionExecute.mockImplementation(async (_metricName: string, viewerRoles?: string[]) => ({
      data: {
        status: viewerRoles?.includes('finance') ? 'executed' : 'blocked',
        target_type: 'sql',
        governance_trace: {
          status: viewerRoles?.includes('finance') ? 'allow' : 'blocked',
          execution_status: viewerRoles?.includes('finance') ? 'executed' : 'blocked',
          matched_policy: {
            name: 'gmv_policy',
            visibility: 'restricted',
          },
          viewer_roles: viewerRoles || [],
          target_type: 'metric',
          target_name: 'gmv',
        },
      },
    }))
    ontologyApiMocks.saveBusinessObject.mockResolvedValue({
      data: { name: 'store', title: '门店', description: '门店对象', aliases: [], status: 'draft' },
    })
    ontologyApiMocks.saveBusinessRelation.mockResolvedValue({
      data: {
        name: 'store_belongs_region',
        title: '门店归属区域',
        source_object_name: 'store',
        target_object_name: 'region',
        relation_type: 'belongs_to',
        description: '门店归属区域',
        aliases: [],
        status: 'draft',
      },
    })
    ontologyApiMocks.saveBusinessAction.mockResolvedValue({
      data: {
        name: 'refund',
        title: '退款',
        object_name: 'order',
        trigger_time_property: 'refund_time',
        description: '订单触发退款',
        event_cube_refs: ['refund_orders'],
        aliases: [],
        status: 'draft',
      },
    })
    ontologyApiMocks.savePolicyMetadata.mockResolvedValue({
      data: {
        name: 'order_policy',
        target_type: 'object',
        target_name: 'order',
        visibility: 'private',
        allowed_roles: ['admin'],
        description: '订单对象仅管理员可见',
      },
    })
    ontologyApiMocks.previewSemanticMapping.mockImplementation(async ({ entity_type, entity_name }) => {
      if (entity_type === 'object') {
        return {
          data: {
            entity: { name: entity_name, title: '订单' },
            projection: {
              targets: [
                {
                  target_type: 'cube',
                  target_name: 'orders',
                  title: '订单分析',
                  score: 100,
                  match_reason: '名称/标题/别名匹配',
                },
              ],
            },
            consistency: { status: 'ok', issues: [] },
            traceability: {
              object_name: entity_name,
              object_title: '订单',
              aliases: ['交易'],
              cube_candidates: [{ target_name: 'orders' }],
            },
          },
        }
      }
      if (entity_type === 'relation') {
        return {
          data: {
            entity: { name: entity_name },
            projection: {
              targets: [
                {
                  target_type: 'join_path',
                  target_name: 'orders',
                  join_path: 'orders.customers',
                  source_cube: 'orders',
                  target_cube: 'customers',
                  relationship: 'N:1',
                  match_reason: '对象候选 Cube 与 Join 目标匹配',
                },
              ],
            },
            consistency: { status: 'ok', issues: [] },
            traceability: {
              source_candidates: [{ target_name: 'orders' }],
              target_candidates: [{ target_name: 'customers' }],
            },
          },
        }
      }
      if (entity_type === 'action') {
        return {
          data: {
            entity: { name: entity_name },
            projection: {
              targets: [{ target_type: 'event_cube', target_name: 'orders', match_reason: '显式 event_cube_refs 映射' }],
            },
            consistency: { status: 'ok', issues: [] },
            traceability: {
              object_candidates: [{ target_name: 'orders' }],
              event_cube_refs: ['orders'],
            },
          },
        }
      }
      return {
        data: {
          entity: { name: entity_name },
          projection: {
            targets: [{ target_type: 'measure', target_name: 'orders.gmv', match_reason: '显式 measure_refs 映射' }],
          },
          consistency: { status: 'ok', issues: [] },
        },
      }
    })
    ontologyApiMocks.getBusinessMetricLinks.mockResolvedValue({
      data: {
        metric_name: 'gmv',
        linked_measures: [{ measure_ref: 'orders.gmv', cube_title: '订单分析' }],
        linked_cubes: [],
        consistency: { status: 'ok', issues: [] },
      },
    })
    ontologyApiMocks.getMeasureBacklinks.mockResolvedValue({
      data: {
        measure_ref: 'orders.gmv',
        cube_name: 'orders',
        measure_name: 'gmv',
        cube_title: '订单分析',
        linked_metrics: [{ metric_name: 'gmv', metric_title: 'GMV' }],
        status: 'ok',
      },
    })
    ontologyApiMocks.getExecutionCompilePreview.mockResolvedValue({
      data: {
        status: 'ready',
        target_type: 'sql',
        pseudo_sql: 'SELECT sum(amount) AS gmv FROM orders LIMIT 100',
        bindings: { cube: 'orders', measure: 'gmv' },
        traceability: { ontology: { metric_name: 'gmv' }, analysis: { cube_name: 'orders' } },
        policy: { status: 'allow', visibility: 'restricted', required_roles: ['finance'] },
      },
    })
    ontologyApiMocks.getExecutionPlanPreview.mockResolvedValue({
      data: {
        metric_name: 'gmv',
        target_type: 'sql',
        steps: [
          { step_type: 'resolve_metric', title: '定位分析指标', status: 'ready' },
          { step_type: 'compile_sql', title: 'SQL 预览', status: 'ready' },
        ],
        traceability: {
          ontology: { metric_name: 'gmv' },
          analysis: { cube_name: 'orders', measure_ref: 'orders.gmv' },
        },
      },
    })
    ontologyApiMocks.getSemanticRoutePreview.mockImplementation(async (_question: string, viewerRoles?: string[]) => {
      const roles = viewerRoles || []
      const allowed = roles.includes('finance')
      return {
        data: {
          route_type: allowed ? 'cube' : 'blocked',
          targets: allowed ? ['cube'] : [],
          policy: {
            status: allowed ? 'allow' : 'blocked',
            visibility: 'restricted',
            reason: allowed ? undefined : '当前目标受限，需要匹配授权角色后才能访问',
            required_roles: ['finance'],
          },
          traceability: {
            ontology: { metric_name: 'gmv', object_name: 'order' },
          },
        },
      }
    })
    ontologyApiMocks.getSemanticPlanPreview.mockImplementation(async (question: string, viewerRoles?: string[]) => {
      const roles = viewerRoles || []
      const allowed = roles.includes('finance') || roles.length === 0
      const isMetricQuestion = question.includes('GMV')
      return {
        data: {
          question,
          route: {
            route_type: isMetricQuestion ? 'hybrid' : allowed ? 'cube' : 'blocked',
          },
          steps: [
            { step_type: 'semantic_match', title: '识别业务语义', status: 'ready', details: {} },
            ...(isMetricQuestion
              ? [{ step_type: 'analysis_preview', title: '预览分析执行链路', status: 'ready', details: {} }]
              : []),
            ...(isMetricQuestion
              ? [{ step_type: 'knowledge_explain', title: '补充业务语义解释', status: 'ready', details: {} }]
              : []),
            { step_type: 'traceability', title: '保留语义与执行回溯', status: 'ready', details: {} },
          ],
          traceability: {
            ontology: isMetricQuestion ? { metric_name: 'gmv' } : { object_name: 'order' },
            analysis: {},
          },
        },
      }
    })
    ontologyApiMocks.getSemanticExecutePlanPreview.mockResolvedValue({
      data: {
        question: '解释 GMV 口径并查看趋势',
        route: { route_type: 'hybrid', targets: ['cube', 'knowledge'] },
        plan: { question: '解释 GMV 口径并查看趋势', route: { route_type: 'hybrid', targets: ['cube', 'knowledge'] }, steps: [] },
        execution_targets: [
          { target_type: 'sql', target_name: 'orders.gmv', compile_preview: { status: 'ready' } },
          { target_type: 'retrieval', target_name: 'knowledge/orders.md', compile_preview: { status: 'ready' } },
        ],
      },
    })
    ontologyApiMocks.getSemanticExecutePlan.mockResolvedValue({
      data: {
        question: '解释 GMV 口径并查看趋势',
        planning_mode: 'multi_step',
        execution_results: [
          {
            status: 'executed',
            target_type: 'sql',
            governance_trace: { status: 'allow', execution_status: 'executed' },
            result: {
              columns: [{ name: 'gmv', type: 'number' }],
              data: [{ gmv: 100 }],
              row_count: 1,
            },
          },
        ],
        traceability: {
          ontology: { metric_name: 'gmv' },
          analysis: { cube_name: 'orders' },
          execution: { targets: ['sql'] },
        },
      },
    })
  })

  it('渲染业务语义工作台并展示核心语义资产', async () => {
    renderPage()

    await waitFor(() => {
      expect(ontologyApiMocks.listBusinessObjects).toHaveBeenCalled()
    })
    expect(screen.getByText('业务语义工作台')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '对象' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '属性' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '业务指标' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '关系' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '动作' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '术语' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '权限' })).toBeInTheDocument()
    expect((await screen.findAllByText('订单')).length).toBeGreaterThan(0)
    expect(screen.getByText('客户')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /待处理告警/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /一致性问题/ })).toBeInTheDocument()
  })

  it('支持对象投影视图与深链接定位', async () => {
    renderPage('/semantic/ontology?tab=objects&entity=order')

    expect(await screen.findByDisplayValue('订单')).toBeInTheDocument()
    expect(await screen.findByText('对象投影视图')).toBeInTheDocument()
    expect(screen.getByText('命中的分析实体')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '在语义工作台打开' })).toHaveAttribute(
      'href',
      '/semantic/workbench?cube=orders&tab=modeling',
    )
    expect(screen.getByRole('link', { name: '在 Cube 管理查看' })).toHaveAttribute(
      'href',
      '/semantic/cubes?name=orders',
    )
  })

  it('支持发布资产并展示影响分析与历史记录', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=metrics&entity=gmv')

    expect(await screen.findByText('发布 / 影响 / 历史')).toBeInTheDocument()
    expect(await screen.findByText('最近变更')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '发布资产' }))

    await waitFor(() => {
      expect(ontologyApiMocks.publishOntologyEntity).toHaveBeenCalledWith('metrics', 'gmv')
    })
    expect(await screen.findByText('最近一次发布校验')).toBeInTheDocument()
  })

  it('发布失败时在生命周期面板内展示阻断原因', async () => {
    const user = userEvent.setup()
    ontologyApiMocks.publishOntologyEntity.mockRejectedValueOnce(new Error('发布校验未通过: 业务对象尚未发布'))
    renderPage('/semantic/ontology?tab=metrics&entity=gmv')

    expect(await screen.findByText('发布 / 影响 / 历史')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '发布资产' }))

    await waitFor(() => {
      expect(ontologyApiMocks.publishOntologyEntity).toHaveBeenCalledWith('metrics', 'gmv')
    })
    expect(await screen.findByText('最近一次发布失败')).toBeInTheDocument()
    expect(screen.getByText('发布校验未通过: 业务对象尚未发布')).toBeInTheDocument()
  })

  it('支持应用订单域模板', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=objects&entity=order')

    expect(await screen.findByText('订单域模板')).toBeInTheDocument()
    expect(screen.getByText('对象 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '应用订单域模板' }))

    await waitFor(() => {
      expect(ontologyApiMocks.applyOntologyTemplate).toHaveBeenCalledWith('order-domain')
    })
    expect(ontologyApiMocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '订单域模板已应用',
      }),
    )
  })

  it('支持新建业务对象并保存', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByDisplayValue('订单')
    await user.click(screen.getByRole('button', { name: '新建 对象' }))
    await user.type(screen.getByPlaceholderText('对象标题，例如 订单'), '门店')
    await user.type(screen.getByPlaceholderText('对象标识，例如 order'), 'store')
    await user.type(screen.getByPlaceholderText('描述这个对象在业务世界中的含义。'), '线下门店对象')
    await user.click(screen.getByRole('button', { name: /保存定义/ }))

    await waitFor(() => {
      expect(ontologyApiMocks.saveBusinessObject).toHaveBeenCalled()
      expect(ontologyApiMocks.saveBusinessObject.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          title: '门店',
          name: 'store',
          description: '线下门店对象',
        }),
      )
    })
  })

  it('支持关系建模并保存', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=relations&entity=customer_submits_order')

    expect(await screen.findByRole('heading', { name: '业务关系定义' })).toBeInTheDocument()
    await screen.findByDisplayValue('客户下单')
    await user.click(screen.getByRole('button', { name: '新建 关系' }))
    const relationTypeInput = screen.getByPlaceholderText('关系类型，例如 submits / belongs_to') as HTMLInputElement
    await waitFor(() => {
      expect(relationTypeInput).toHaveValue('')
    })
    fireEvent.change(screen.getByPlaceholderText('关系标题，例如 客户下单'), { target: { value: '门店归属区域' } })
    fireEvent.change(screen.getByPlaceholderText('关系标识，例如 customer_submits_order'), { target: { value: 'store_belongs_region' } })
    fireEvent.change(screen.getByPlaceholderText('起始对象，例如 customer'), { target: { value: 'store' } })
    fireEvent.change(screen.getByPlaceholderText('目标对象，例如 order'), { target: { value: 'region' } })
    fireEvent.change(relationTypeInput, { target: { value: 'belongs_to' } })
    fireEvent.change(screen.getByPlaceholderText('说明该关系在业务上的成立条件和方向。'), { target: { value: '门店归属区域' } })
    await user.click(screen.getByRole('button', { name: /保存定义/ }))

    await waitFor(() => {
      expect(ontologyApiMocks.saveBusinessRelation.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          title: '门店归属区域',
          name: 'store_belongs_region',
          source_object_name: 'store',
          target_object_name: 'region',
          relation_type: 'belongs_to',
        }),
      )
    })
    expect(await screen.findByText('关系投影视图')).toBeInTheDocument()
  })

  it('支持动作建模并保存', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=actions&entity=pay')

    expect(await screen.findByRole('heading', { name: '业务动作定义' })).toBeInTheDocument()
    await screen.findByDisplayValue('支付')
    await user.click(screen.getByRole('button', { name: '新建 动作' }))
    fireEvent.change(screen.getByPlaceholderText('动作标题，例如 支付'), { target: { value: '退款' } })
    fireEvent.change(screen.getByPlaceholderText('动作标识，例如 pay'), { target: { value: 'refund' } })
    fireEvent.change(screen.getByPlaceholderText('归属对象，例如 order'), { target: { value: 'order' } })
    fireEvent.change(screen.getByPlaceholderText('触发时间属性，例如 pay_time'), { target: { value: 'refund_time' } })
    fireEvent.change(screen.getByPlaceholderText('说明该动作何时发生、作用于什么对象。'), { target: { value: '订单触发退款' } })
    fireEvent.change(screen.getByPlaceholderText('关联事件 Cube，例如 refund_orders'), { target: { value: 'refund_orders' } })
    await user.click(screen.getByRole('button', { name: /保存定义/ }))

    await waitFor(() => {
      expect(ontologyApiMocks.saveBusinessAction.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          title: '退款',
          name: 'refund',
          object_name: 'order',
          trigger_time_property: 'refund_time',
          event_cube_refs: ['refund_orders'],
        }),
      )
    })
    expect(await screen.findByText('动作投影视图')).toBeInTheDocument()
  })

  it('支持业务指标联邦追踪', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=metrics&entity=gmv')

    expect(await screen.findByRole('heading', { name: '业务指标定义' })).toBeInTheDocument()
    await screen.findByDisplayValue('GMV')

    expect(await screen.findByText('联邦追踪')).toBeInTheDocument()
    expect(screen.getByText('下游 Measure / Cube')).toBeInTheDocument()
    expect(screen.getByText('反向引用与一致性')).toBeInTheDocument()
    expect(screen.getByText(/来自 订单分析 · 被 1 个业务指标引用/)).toBeInTheDocument()
    expect(await screen.findByText('执行验证')).toBeInTheDocument()
    expect(
      screen.getByText((content) => content.includes('SELECT sum(amount) AS gmv FROM orders LIMIT 100')),
    ).toBeInTheDocument()
    expect(screen.getByText('执行计划')).toBeInTheDocument()
    expect(screen.getByText('SQL 预览')).toBeInTheDocument()
    expect(await screen.findByText('运行路径验证')).toBeInTheDocument()
    expect(await screen.findByText('当前问题会先补充业务语义解释，再进入分析执行链。')).toBeInTheDocument()
    expect(screen.getAllByText(/路径：混合路径/).length).toBeGreaterThan(0)
    expect(screen.getByText('补充业务语义解释')).toBeInTheDocument()
    expect(screen.getByText('保留语义与执行回溯')).toBeInTheDocument()
    expect(ontologyApiMocks.getBusinessMetricLinks).toHaveBeenCalledWith('gmv')
    expect(ontologyApiMocks.getMeasureBacklinks).toHaveBeenCalledWith('orders.gmv')
    expect(ontologyApiMocks.getExecutionPlanPreview).toHaveBeenCalledWith('gmv')
    expect(ontologyApiMocks.getSemanticRoutePreview).toHaveBeenCalledWith('解释 GMV 口径并查看趋势', [])
    expect(ontologyApiMocks.getSemanticPlanPreview).toHaveBeenCalledWith('解释 GMV 口径并查看趋势', [])

    await user.click(screen.getByRole('button', { name: '运行验证' }))
    expect(await screen.findByText('最近执行结果')).toBeInTheDocument()
    expect(screen.getByText(/类型：sql/)).toBeInTheDocument()
    expect(screen.getByText(/目标 1：executed/)).toBeInTheDocument()
    expect(ontologyApiMocks.getSemanticExecutePlan).toHaveBeenCalledWith('解释 GMV 口径并查看趋势', [])
  })

  it('支持关系投影预览', async () => {
    const user = userEvent.setup()
    ontologyApiMocks.previewSemanticMapping.mockResolvedValueOnce({
      data: {
        entity: { name: 'customer_submits_order' },
        projection: {
          targets: [{ target_type: 'join_path', target_name: 'orders', join_path: 'customers.orders', match_reason: '对象候选 Cube 与 Join 目标匹配' }],
        },
        consistency: { status: 'ok', issues: [] },
      },
    })
    renderPage('/semantic/ontology?tab=relations&entity=customer_submits_order')

    expect(await screen.findByRole('heading', { name: '业务关系定义' })).toBeInTheDocument()
    await screen.findByDisplayValue('客户下单')
    await user.click(screen.getByRole('button', { name: '查看投影预览' }))
    expect(await screen.findByText('只读投影')).toBeInTheDocument()
    expect(screen.getByText('orders')).toBeInTheDocument()
    expect(screen.getAllByText(/对象候选 Cube 与 Join 目标匹配/).length).toBeGreaterThan(0)
  })

  it('支持动作投影预览', async () => {
    const user = userEvent.setup()
    ontologyApiMocks.previewSemanticMapping.mockResolvedValueOnce({
      data: {
        entity: { name: 'pay' },
        projection: {
          targets: [{ target_type: 'event_cube', target_name: 'orders', match_reason: '显式 event_cube_refs 映射' }],
        },
        consistency: { status: 'ok', issues: [] },
      },
    })
    renderPage('/semantic/ontology?tab=actions&entity=pay')

    expect(await screen.findByRole('heading', { name: '业务动作定义' })).toBeInTheDocument()
    await screen.findByDisplayValue('支付')
    await user.click(screen.getByRole('button', { name: '查看投影预览' }))
    expect(await screen.findByText('只读投影')).toBeInTheDocument()
    expect(screen.getAllByText(/显式 event_cube_refs 映射/).length).toBeGreaterThan(0)
  })

  it('支持语义权限建模', async () => {
    const user = userEvent.setup()
    renderPage('/semantic/ontology?tab=policies&entity=gmv_policy')

    expect(await screen.findByRole('heading', { name: '语义权限' })).toBeInTheDocument()
    await screen.findByDisplayValue('gmv_policy')
    expect(screen.getByText('权限影响与治理验证')).toBeInTheDocument()
    expect(screen.getByText('目标标题：GMV')).toBeInTheDocument()
    expect(screen.getByText('影响范围说明')).toBeInTheDocument()
    expect(screen.getByText(/该权限会影响 业务指标 GMV/)).toBeInTheDocument()
    expect(await screen.findByText('真实治理验证')).toBeInTheDocument()
    expect(screen.getByText('治理影响总览')).toBeInTheDocument()
    expect(screen.getByText('关联分析实体')).toBeInTheDocument()
    expect(screen.getByText('治理挂点状态')).toBeInTheDocument()
    expect(screen.getByText('semantic-router')).toBeInTheDocument()
    expect(screen.getByText('最近治理执行结果')).toBeInTheDocument()
    expect(screen.getByText('最近审计记录')).toBeInTheDocument()
    expect(screen.getByText('决策')).toBeInTheDocument()
    expect(screen.getByText('路由')).toBeInTheDocument()
    expect(screen.getByText('统一执行预览')).toBeInTheDocument()
    expect(screen.getAllByText('命中授权角色').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未授权角色').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已放行').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已阻断').length).toBeGreaterThan(0)
    expect(screen.getByText('当前目标受限，需要匹配授权角色后才能访问')).toBeInTheDocument()
    expect(screen.getByText('最近一次真实执行会在这里展示治理留痕、命中策略和执行结果。')).toBeInTheDocument()
    expect(ontologyApiMocks.getSemanticRoutePreview).toHaveBeenCalled()
    expect(ontologyApiMocks.getPolicyImpact).toHaveBeenCalledWith('gmv_policy')
    expect(ontologyApiMocks.getPolicyAudit).toHaveBeenCalledWith('gmv_policy', {
      decision: undefined,
      route_type: undefined,
    })
    expect(ontologyApiMocks.getExecutionCompilePreview).toHaveBeenCalledWith('gmv', ['finance'])
    expect(ontologyApiMocks.getExecutionCompilePreview).toHaveBeenCalledWith('gmv', ['guest'])
    expect(ontologyApiMocks.getExecutionExecute).toHaveBeenCalledWith('gmv', ['finance'])
    expect(ontologyApiMocks.getExecutionExecute).toHaveBeenCalledWith('gmv', ['guest'])

    await user.selectOptions(screen.getByLabelText('决策'), 'allow')
    await user.selectOptions(screen.getByLabelText('路由'), 'direct')
    await waitFor(() => {
      expect(ontologyApiMocks.getPolicyAudit).toHaveBeenCalledWith('gmv_policy', {
        decision: 'allow',
        route_type: 'direct',
      })
    })

    await user.click(screen.getByRole('button', { name: '新建 权限' }))
    fireEvent.change(screen.getByPlaceholderText('权限标识，例如 gmv_policy'), { target: { value: 'order_policy' } })
    fireEvent.change(screen.getByPlaceholderText('目标名称，例如 gmv / order'), { target: { value: 'order' } })
    fireEvent.change(screen.getByPlaceholderText('授权角色，多个用逗号分隔，例如 finance, admin'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByPlaceholderText('说明该语义权限影响的范围和业务原因。'), { target: { value: '订单对象仅管理员可见' } })
    await user.click(screen.getByRole('button', { name: /保存定义/ }))

    await waitFor(() => {
      expect(ontologyApiMocks.savePolicyMetadata.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          name: 'order_policy',
          target_type: 'object',
          target_name: 'order',
          visibility: 'restricted',
          allowed_roles: ['admin'],
          description: '订单对象仅管理员可见',
        }),
      )
    })
  })
})
