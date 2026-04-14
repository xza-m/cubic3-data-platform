import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DevTools, {
  buildCubeUpdatePayload,
  buildEditableState,
  DevToolsSkeleton,
  ExpressionModeToggle,
  LandingCubeList,
  TagInput,
  buildMeasureExpression,
  buildStateLabel,
  classifyFieldCategory,
  ensureUniqueKey,
  extractSourceField,
  inferDimensionType,
  inferMeasureAggregation,
  mapSourceFieldsFromDataset,
  mapSourceFieldsFromPreview,
  normalizeDimensionSql,
  normalizeMeasureSql,
  parseFilterExpression,
  parseLabelList,
  parsePhysicalTable,
  parseWorkspaceTab,
  renderExpressionModeLabel,
  serializeDraftState,
  stringifyLabelList,
  toTitleCase,
} from './DevTools'

const semanticApiMocks = vi.hoisted(() => ({
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
  listCubes: vi.fn(),
  listViews: vi.fn(),
  listRecipes: vi.fn(),
  describeCube: vi.fn(),
  createCubeDraftFromSource: vi.fn(),
  createCube: vi.fn(),
  updateCube: vi.fn(),
  activateCube: vi.fn(),
  compileDsl: vi.fn(),
  querySemantic: vi.fn(),
}))

const dataSourceApiMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
}))

const datasetApiMocks = vi.hoisted(() => ({
  getDatasets: vi.fn(),
  getDatasetFields: vi.fn(),
  previewDataset: vi.fn(),
}))

const ontologyApiMocks = vi.hoisted(() => ({
  getCubeBacklinks: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    listRecipes: semanticApiMocks.listRecipes,
    describeCube: semanticApiMocks.describeCube,
    createCubeDraftFromSource: semanticApiMocks.createCubeDraftFromSource,
    createCube: semanticApiMocks.createCube,
    updateCube: semanticApiMocks.updateCube,
    activateCube: semanticApiMocks.activateCube,
    compileDsl: semanticApiMocks.compileDsl,
    querySemantic: semanticApiMocks.querySemantic,
  }
})

vi.mock('@/api/datasources', () => ({
  getDataSources: dataSourceApiMocks.getDataSources,
}))

vi.mock('@/api/datasets', () => ({
  getDatasets: datasetApiMocks.getDatasets,
  getDatasetFields: datasetApiMocks.getDatasetFields,
  previewDataset: datasetApiMocks.previewDataset,
}))

vi.mock('@/api/ontology', () => ({
  getCubeBacklinks: ontologyApiMocks.getCubeBacklinks,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    SchemaBrowser: ({ onSelect }: { onSelect?: (node: Record<string, unknown>) => void }) => (
      <div data-testid="mock-schema-browser">
        <button
          type="button"
          onClick={() =>
            onSelect?.({
              key: 'datasource:1/schema:public/table:orders_table',
              type: 'table',
              name: 'orders_table',
              parentKey: null,
              children: [],
              loaded: true,
              loading: false,
              expanded: false,
              metadata: {
                database: 'dw',
                schema: 'public',
                table: 'orders_table',
                comment: '订单事实表',
              },
            })}
        >
          选择 orders_table
        </button>
      </div>
    ),
    useToast: () => ({
      toast: toastMock,
    }),
  }
})

vi.mock('@/components/Semantic/DevTools/YamlEditorTab', () => ({
  YamlEditorTab: ({ fileName }: { fileName?: string }) => (
    <div data-testid={`mock-yaml-editor-${fileName || 'empty'}`}>YAML {fileName}</div>
  ),
}))

vi.mock('@/components/Semantic/DevTools/PlaygroundTab', () => ({
  PlaygroundTab: ({ preferredCube }: { preferredCube?: string }) => (
    <div data-testid="mock-playground-tab">DSL Playground {preferredCube || 'none'}</div>
  ),
}))

vi.mock('@/components/Semantic/DevTools/PythonPreviewTab', () => ({
  PythonPreviewTab: ({ cube }: { cube?: { name?: string } }) => (
    <div data-testid="mock-python-tab">Python Preview {cube?.name || 'none'}</div>
  ),
}))

function renderPage(initialEntry = '/semantic/workbench') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <DevTools />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function mockResourceApis() {
  dataSourceApiMocks.getDataSources.mockResolvedValue({
    data: {
      items: [
        {
          id: 1,
          name: '学习行为仓',
          source_type: 'postgres',
          description: '',
          connection_config: {},
          is_active: true,
          connection_status: 'connected',
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
    },
  })

  datasetApiMocks.getDatasets.mockResolvedValue({
    data: {
      items: [
        {
          id: 7,
          dataset_code: 'orders_dataset',
          dataset_name: '订单数据集',
          dataset_type: 'physical',
          source_id: 1,
          source_type: 'postgres',
          physical_table: 'dw.public.orders',
          description: '订单分析用数据集',
          sync_status: 'synced',
          field_count: 3,
          created_at: '2026-04-01T00:00:00Z',
          updated_at: '2026-04-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    },
  })

  datasetApiMocks.getDatasetFields.mockResolvedValue({
    data: [
      {
        id: 1,
        physical_name: 'customer_id',
        data_type: 'varchar',
        display_name: '客户',
        business_type: 'dimension',
        sensitivity_level: 'internal',
        is_sensitive: false,
        comment: '客户唯一标识',
      },
      {
        id: 2,
        physical_name: 'total_amount',
        data_type: 'decimal(18,2)',
        display_name: '总金额',
        business_type: 'measure',
        sensitivity_level: 'internal',
        is_sensitive: false,
        comment: '订单总金额',
      },
    ],
  })

  datasetApiMocks.previewDataset.mockResolvedValue({
    data: {
      preview_limit: 50,
      table_info: {
        database: 'dw',
        table: 'orders_table',
        comment: '订单事实表',
        row_count: 1280,
        size: 1024,
      },
      fields: [
        {
          physical_name: 'customer_id',
          data_type: 'varchar',
          business_type: 'dimension',
          sensitivity_level: 'internal',
          confidence_score: 0.96,
          matched_rules: [],
          display_name: '客户',
          comment: '客户唯一标识',
          is_partition: false,
          is_measure: false,
          is_sensitive: false,
        },
        {
          physical_name: 'total_amount',
          data_type: 'decimal(18,2)',
          business_type: 'measure',
          sensitivity_level: 'internal',
          confidence_score: 0.94,
          matched_rules: [],
          display_name: '总金额',
          comment: '订单总金额',
          is_partition: false,
          is_measure: true,
          is_sensitive: false,
        },
        {
          physical_name: 'created_at',
          data_type: 'timestamp',
          business_type: 'dimension',
          sensitivity_level: 'internal',
          confidence_score: 0.92,
          matched_rules: [],
          display_name: '创建时间',
          comment: '订单创建时间',
          is_partition: false,
          is_measure: false,
          is_sensitive: false,
        },
      ],
      sample_rows: [
        { customer_id: 'C001', total_amount: 1250.0, created_at: '2026-04-01 09:00:00' },
      ],
      sample_columns: ['customer_id', 'total_amount', 'created_at'],
      statistics: {
        total_fields: 3,
        partition_fields: 0,
        measure_fields: 1,
        sensitive_fields: 0,
      },
    },
  })
}

function mockSemanticLists() {
  semanticApiMocks.listDomainCatalogs.mockResolvedValue({
    data: { catalogs: [], total: 0 },
  })
  semanticApiMocks.listDomains.mockResolvedValue({
    data: { domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }], total: 1 },
  })
  semanticApiMocks.listCubes.mockResolvedValue({
    data: {
      cubes: [
        {
          name: 'orders_cube',
          title: '订单分析',
          description: '订单事实表',
          table: 'public.orders',
          dimensions: [],
          measures: [],
          dimension_count: 2,
          measure_count: 1,
          status: 'active',
          source_id: 1,
          source_database: 'dw',
          source_schema: 'public',
          domain_ids: [],
          domains: [],
          domain_count: 0,
          state_summary: { sync_status: 'ok' },
        },
      ],
      total: 1,
    },
  })
  semanticApiMocks.listViews.mockResolvedValue({
    data: { views: [], total: 0 },
  })
  semanticApiMocks.listRecipes.mockResolvedValue({
    data: { recipes: [], total: 0 },
  })
  ontologyApiMocks.getCubeBacklinks.mockResolvedValue({
    data: {
      cube_name: 'orders_cube',
      cube_title: '订单分析',
      linked_objects: [],
      linked_metrics: [],
      status: 'linked',
    },
  })
}

function mockCubeDetail(name: string, status: 'active' | 'draft' = 'draft') {
  semanticApiMocks.describeCube.mockImplementation(async (cubeName: string) => ({
    data: {
      name: cubeName,
      title: cubeName === 'orders_cube__revision_draft' ? '订单分析修订草稿' : '订单分析',
      description: cubeName === 'orders_cube__revision_draft' ? '待发布新版本' : '订单事实表',
      table: 'public.orders',
      domain_id: 'sales',
      domain_name: '销售域',
      domain_ids: ['sales'],
      domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
      domain_count: 1,
      status: cubeName === name ? status : 'active',
      source_id: 1,
      source_database: 'dw',
      source_schema: 'public',
      source_binding_summary: {
        source_id: 1,
        source_name: '学习行为仓',
        database: 'dw',
        schema: 'public',
        display: '学习行为仓 / dw.public',
      },
      dimensions: {
        customer_id: {
          title: '客户',
          type: 'string',
          description: '客户唯一标识',
          source_data_type: 'varchar',
          sql: 'source.customer_id',
          format: 'string',
          synonyms: ['客户ID', '用户ID'],
          tags: ['主键', '客户'],
        },
        created_at: {
          title: '创建时间',
          type: 'time',
          description: '订单创建时间',
          source_data_type: 'timestamp',
          sql: 'source.created_at',
          format: 'datetime',
          synonyms: ['下单时间'],
          tags: ['时间'],
        },
      },
      measures: {
        total_amount: {
          name: 'total_amount',
          title: '总金额',
          type: 'sum',
          description: '订单总金额',
          source_data_type: 'decimal(18,2)',
          format: 'currency',
          sql: 'SUM(source.total_amount)',
          synonyms: ['GMV', '成交金额'],
          tags: ['核心指标', '营收'],
        },
      },
      segments: {},
      joins: {
        users: {
          target_cube: 'users_cube',
          type: 'left',
          relationship: 'N:1',
          sql: 'source.user_id = users_cube.id',
        },
      },
      default_filters: [
        { sql: "source.status <> 'deleted'", description: '排除删除订单' },
      ],
      grain: 'customer_id',
      entity_key: 'customer_id',
      state_summary: {
        status: cubeName === name ? status : 'active',
      },
    },
  }))
}

describe('DevTools page', () => {
  it('纯函数工具链能覆盖 tab、表名、标签和字段类型推断', () => {
    expect(parseWorkspaceTab('dsl', 'draft')).toBe('dsl')
    expect(parseWorkspaceTab('yaml', 'draft')).toBe('yaml')
    expect(parseWorkspaceTab('python', 'draft')).toBe('python')
    expect(parseWorkspaceTab('modeling', 'draft')).toBe('modeling')
    expect(parseWorkspaceTab('unknown', 'active')).toBe('dsl')
    expect(parseWorkspaceTab(null, 'draft')).toBe('modeling')

    expect(parsePhysicalTable('dw.public.orders')).toEqual({
      database: 'dw',
      schema: 'public',
      table: 'orders',
    })
    expect(parsePhysicalTable('dw.orders')).toEqual({
      database: 'dw',
      schema: undefined,
      table: 'orders',
    })
    expect(parsePhysicalTable('orders')).toEqual({
      database: '',
      schema: undefined,
      table: 'orders',
    })
    expect(parsePhysicalTable('')).toEqual({
      database: '',
      schema: undefined,
      table: '',
    })

    expect(classifyFieldCategory('decimal(18,2)')).toBe('numeric')
    expect(classifyFieldCategory('timestamp')).toBe('temporal')
    expect(classifyFieldCategory('boolean')).toBe('boolean')
    expect(classifyFieldCategory('varchar')).toBe('text')
    expect(classifyFieldCategory('json')).toBe('other')

    expect(inferDimensionType('bigint')).toBe('number')
    expect(inferDimensionType('datetime')).toBe('time')
    expect(inferDimensionType('bool')).toBe('boolean')
    expect(inferDimensionType('varchar')).toBe('string')

    expect(inferMeasureAggregation(null)).toBe('sum')
    expect(inferMeasureAggregation({ category: 'numeric' } as never)).toBe('sum')
    expect(inferMeasureAggregation({ category: 'text' } as never)).toBe('count')

    expect(toTitleCase('order_total-amount')).toBe('Order Total Amount')
    expect(stringifyLabelList(['客户', '', '订单'])).toBe('客户, 订单')
    expect(parseLabelList('客户,订单\n金额，日期')).toEqual(['客户', '订单', '金额', '日期'])
    expect(ensureUniqueKey(' Order Total ', ['order_total', 'order_total_1'])).toBe('order_total_2')
    expect(ensureUniqueKey('***', [])).toBe('untitled')
  })

  it('表达式辅助函数能处理 builder/custom 两类输入', () => {
    expect(buildMeasureExpression('amount', 'sum')).toBe('SUM(`amount`)')
    expect(buildMeasureExpression('amount', 'count')).toBe('COUNT(`amount`)')
    expect(buildMeasureExpression('user_id', 'count_distinct')).toBe('COUNT(DISTINCT `user_id`)')
    expect(buildMeasureExpression('', 'sum')).toBe('')

    expect(extractSourceField('{CUBE}.customer_id')).toBe('customer_id')
    expect(extractSourceField('source.order_id')).toBe('order_id')
    expect(extractSourceField('SUM(`total_amount`)')).toBe('total_amount')
    expect(extractSourceField('CURRENT_DATE')).toBe('')

    expect(normalizeMeasureSql('source.total_amount', 'avg')).toBe('AVG(`total_amount`)')
    expect(normalizeMeasureSql('SUM(source.total_amount)', 'sum')).toBe('SUM(source.total_amount)')
    expect(normalizeMeasureSql('custom_sql()', 'sum')).toBe('custom_sql()')
    expect(normalizeMeasureSql('', 'sum')).toBe('')

    expect(normalizeDimensionSql('source.created_at')).toBe('`created_at`')
    expect(normalizeDimensionSql('DATE_TRUNC(created_at)')).toBe('DATE_TRUNC(created_at)')
    expect(normalizeDimensionSql('')).toBe('')

    expect(parseFilterExpression("source.status <> 'deleted'")).toEqual({
      field: 'status',
      operator: '<>',
      value: 'deleted',
      mode: 'form',
    })
    expect(parseFilterExpression('custom_sql()')).toEqual({
      field: '',
      operator: '=',
      value: '',
      mode: 'custom',
    })
  })

  it('资源字段映射与草稿序列化逻辑保持稳定', () => {
    expect(
      mapSourceFieldsFromPreview({
        fields: [
          {
            physical_name: 'customer_id',
            display_name: '客户',
            data_type: 'varchar',
            comment: '客户主键',
            is_measure: false,
          },
          {
            physical_name: 'customer_id',
            display_name: '客户',
            data_type: 'varchar',
            comment: '重复字段',
            is_measure: false,
          },
          {
            physical_name: 'total_amount',
            field_name: 'total_amount',
            display_name: '总金额',
            data_type: 'decimal(18,2)',
            comment: '金额',
            is_measure: true,
          },
        ],
      } as never),
    ).toEqual([
      {
        name: 'customer_id',
        label: '客户',
        dataType: 'varchar',
        comment: '客户主键',
        category: 'text',
        recommendedRole: 'dimension',
        sourceRef: 'source.customer_id',
      },
      {
        name: 'total_amount',
        label: '总金额',
        dataType: 'decimal(18,2)',
        comment: '金额',
        category: 'numeric',
        recommendedRole: 'measure',
        sourceRef: 'source.total_amount',
      },
    ])

    expect(
      mapSourceFieldsFromDataset([
        {
          physical_name: 'order_date',
          display_name: '下单日期',
          data_type: 'timestamp',
          business_type: 'dimension',
          comment: '订单时间',
        },
        {
          physical_name: 'total_amount',
          display_name: '',
          data_type: 'decimal(18,2)',
          business_type: 'metric',
          comment: '',
        },
      ] as never),
    ).toEqual([
      {
        name: 'order_date',
        label: '下单日期',
        dataType: 'timestamp',
        comment: '订单时间',
        category: 'temporal',
        recommendedRole: 'dimension',
        sourceRef: 'source.order_date',
      },
      {
        name: 'total_amount',
        label: 'total_amount',
        dataType: 'decimal(18,2)',
        comment: '',
        category: 'numeric',
        recommendedRole: 'measure',
        sourceRef: 'source.total_amount',
      },
    ])
  })

  it('草稿状态构建、更新载荷和状态标签符合当前约定', () => {
    const state = buildEditableState({
      name: 'orders_cube__revision_draft',
      title: '订单分析',
      description: '订单事实表',
      domain_id: 'sales',
      grain: 'customer_id',
      entity_key: 'customer_id',
      dimensions: {
        customer_id: {
          title: '客户',
          type: 'string',
          description: '客户唯一标识',
          source_data_type: 'varchar',
          sql: 'source.customer_id',
          format: 'string',
          synonyms: ['客户ID', '用户ID'],
          tags: ['主键', '客户'],
        },
        custom_flag: {
          title: '自定义标记',
          type: 'string',
          description: '自定义表达式',
          source_data_type: 'json',
          sql: 'CASE WHEN flag = 1 THEN 1 END',
          format: '',
          synonyms: [],
          tags: [],
        },
      },
      measures: {
        total_amount: {
          title: '总金额',
          type: 'sum',
          description: '订单总金额',
          source_data_type: 'decimal(18,2)',
          sql: 'source.total_amount',
          format: 'currency',
          synonyms: ['GMV'],
          tags: ['核心指标'],
        },
      },
      default_filters: [
        { sql: "source.status = 'paid'", description: '仅支付订单' },
      ],
      joins: {
        users: {
          target_cube: 'users_cube',
          type: 'left',
          relationship: 'N:N',
          sql: 'source.user_id = users_cube.id',
        },
      },
    } as never)

    expect(state.dimensions[0]).toMatchObject({
      name: 'customer_id',
      expression: '`customer_id`',
      expressionMode: 'builder',
      synonyms: '客户ID, 用户ID',
      tags: '主键, 客户',
      type: 'string',
    })
    expect(state.dimensions[1]).toMatchObject({
      name: 'custom_flag',
      expression: 'CASE WHEN flag = 1 THEN 1 END',
      expressionMode: 'custom',
      field: 'custom_flag',
    })
    expect(state.measures[0]).toMatchObject({
      name: 'total_amount',
      expression: 'SUM(`total_amount`)',
      aggregation: 'sum',
      expressionMode: 'builder',
    })
    expect(state.filters[0]).toMatchObject({
      field: 'status',
      operator: '=',
      value: 'paid',
      mode: 'form',
    })
    expect(state.joins[0]).toMatchObject({
      name: 'users',
      targetCube: 'users_cube',
      relationship: 'many_to_many',
      expression: 'source.user_id = users_cube.id',
    })

    const nextState: Parameters<typeof serializeDraftState>[0] = {
      ...state,
      dimensions: [
        ...state.dimensions,
        {
          id: 'dimension:region',
          name: 'region',
          displayName: '',
          expression: '`region`',
          expressionMode: 'builder',
          field: 'region',
          comment: '',
          synonyms: '区域',
          format: '',
          tags: '',
          type: 'string',
          sourceDataType: 'varchar',
        },
      ],
      measures: [
        ...state.measures,
        {
          id: 'measure:order_count',
          name: 'order_count',
          displayName: '',
          expression: 'COUNT(`order_id`)',
          expressionMode: 'builder',
          field: 'order_id',
          aggregation: 'count',
          comment: '',
          synonyms: '',
          format: '',
          tags: '',
          sourceDataType: 'bigint',
        },
      ],
      filters: [
        ...state.filters,
        {
          id: 'filter:custom',
          name: '自定义过滤',
          mode: 'custom',
          field: '',
          operator: '=',
          value: '',
          required: false,
          expression: 'source.amount > 0',
          comment: '',
        },
      ],
      joins: [
        {
          ...state.joins[0],
          conditions: [{ sourceField: 'user_id', targetField: 'id' }],
        },
        {
          id: 'join:orders',
          name: 'orders_ext',
          mode: 'custom',
          targetCube: '',
          targetTable: 'orders_ext',
          joinType: 'inner',
          relationship: 'one_to_many',
          sourceField: '',
          targetField: '',
          conditions: [],
          expression: 'source.order_id = orders_ext.id',
          description: '',
        },
      ],
    }

    expect(serializeDraftState(nextState)).toContain('"cubeName":"orders_cube__revision_draft"')

    expect(buildCubeUpdatePayload(nextState, 1, 'dw', 'public', 'orders')).toEqual({
      name: 'orders_cube__revision_draft',
      title: '订单分析',
      description: '订单事实表',
      domain_id: 'sales',
      source_id: 1,
      source_database: 'dw',
      source_schema: 'public',
      table: 'orders',
      grain: 'customer_id',
      entity_key: 'customer_id',
      dimensions: {
        customer_id: {
          title: '客户',
          type: 'string',
          sql: '`customer_id`',
          description: '客户唯一标识',
          source_data_type: 'varchar',
          format: 'string',
          synonyms: ['客户ID', '用户ID'],
          tags: ['主键', '客户'],
          primary_key: true,
        },
        custom_flag: {
          title: '自定义标记',
          type: 'string',
          sql: 'CASE WHEN flag = 1 THEN 1 END',
          description: '自定义表达式',
          source_data_type: 'json',
          format: undefined,
          synonyms: [],
          tags: [],
          primary_key: false,
        },
        region: {
          title: 'Region',
          type: 'string',
          sql: '`region`',
          description: undefined,
          source_data_type: 'varchar',
          format: undefined,
          synonyms: ['区域'],
          tags: [],
          primary_key: false,
        },
      },
      measures: {
        total_amount: {
          title: '总金额',
          type: 'sum',
          sql: 'SUM(`total_amount`)',
          description: '订单总金额',
          source_data_type: 'decimal(18,2)',
          synonyms: ['GMV'],
          tags: ['核心指标'],
          format: 'currency',
        },
        order_count: {
          title: 'Order Count',
          type: 'count',
          sql: 'COUNT(`order_id`)',
          description: undefined,
          source_data_type: 'bigint',
          synonyms: [],
          tags: [],
          format: undefined,
        },
      },
      joins: {
        users: {
          cube: 'users_cube',
          type: 'left',
          relationship: 'many_to_many',
          sql: '`user_id` = users_cube.`id`',
          target_table: 'users_cube',
          conditions: [{ sourceField: 'user_id', targetField: 'id' }],
        },
        orders_ext: {
          cube: 'orders_ext',
          type: 'inner',
          relationship: 'one_to_many',
          sql: 'source.order_id = orders_ext.id',
          target_table: 'orders_ext',
          conditions: undefined,
        },
      },
      default_filters: [
        { sql: "source.status = 'paid'", description: '仅支付订单' },
        { sql: 'source.amount > 0', description: '自定义过滤' },
      ],
    })

    expect(buildStateLabel('active', 'orders_cube')).toBe('已发布')
    expect(buildStateLabel('draft', 'orders_cube__revision_draft')).toBe('修订草稿')
    expect(buildStateLabel('draft', 'orders_cube')).toBe('草稿中')
    expect(buildStateLabel(undefined, undefined)).toBe('未开始')
  })

  it('标签输入组件支持添加、去重和删除标签', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<TagInput value="核心指标, 营收" onChange={onChange} ariaLabel="标签输入" />)

    expect(screen.getByText('核心指标')).toBeInTheDocument()
    expect(screen.getByText('营收')).toBeInTheDocument()

    await user.type(screen.getByLabelText('标签输入'), '新增标签{enter}')
    expect(onChange).toHaveBeenCalledWith('核心指标, 营收, 新增标签')

    await user.type(screen.getByLabelText('标签输入'), '营收{enter}')
    expect(onChange).not.toHaveBeenCalledWith('核心指标, 营收, 营收')

    await user.click(screen.getByRole('button', { name: '删除 核心指标' }))
    expect(onChange).toHaveBeenCalledWith('营收')
  })

  it('资源落地列表会按数据源过滤并触发选择回调', async () => {
    const user = userEvent.setup()
    const onSelectCube = vi.fn()

    render(
      <LandingCubeList
        selectedSource="1"
        onSelectCube={onSelectCube}
        cubes={[
          {
            name: 'orders_cube',
            title: '订单分析',
            status: 'active',
            source_id: 1,
          },
          {
            name: 'draft_cube',
            title: '草稿模型',
            status: 'draft',
            source_id: 1,
          },
          {
            name: 'other_cube',
            title: '其他模型',
            status: 'active',
            source_id: 2,
          },
        ] as never}
      />,
    )

    expect(screen.getByText('当前数据源已有 Cube (2)')).toBeInTheDocument()
    expect(screen.getByText('订单分析')).toBeInTheDocument()
    expect(screen.getByText('草稿模型')).toBeInTheDocument()
    expect(screen.queryByText('其他模型')).not.toBeInTheDocument()
    expect(screen.getByText('已发布')).toBeInTheDocument()
    expect(screen.getByText('草稿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /订单分析/ }))
    expect(onSelectCube).toHaveBeenCalledWith('orders_cube')
  })

  it('表达式模式切换组件和标签文案符合预期', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<ExpressionModeToggle mode="builder" onChange={onChange} />)

    expect(screen.getByRole('button', { name: '表单模式' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '自定义模式' }))
    expect(onChange).toHaveBeenCalledWith('custom')

    expect(renderExpressionModeLabel('form')).toBe('表单模式')
    expect(renderExpressionModeLabel('custom')).toBe('自定义模式')
    expect(renderExpressionModeLabel('canvas')).toBe('关系画布')
  })

  it('骨架屏保持三栏占位布局', () => {
    render(<DevToolsSkeleton />)

    expect(screen.getByTestId('devtools-screen')).toBeInTheDocument()
    expect(document.querySelectorAll('.h-\\[42rem\\]')).toHaveLength(3)
  })

  it('无当前 Cube 时展示真实资源汇总并允许从数据集发起 AI 建模', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube')
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: {
        name: 'orders_cube',
        title: '订单分析',
        description: '订单事实表',
        table: 'public.orders',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        status: 'draft',
        dimensions: {
          customer_id: { title: '客户', type: 'string', sql: 'source.customer_id' },
        },
        measures: {
          total_amount: { title: '总金额', type: 'sum', sql: 'SUM(source.total_amount)' },
        },
      },
    })
    semanticApiMocks.createCube.mockResolvedValue({
      data: {
        name: 'orders_cube',
        title: '订单分析',
        description: '订单事实表',
        table: 'public.orders',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        status: 'draft',
        dimensions: {
          customer_id: { title: '客户', type: 'string', sql: 'source.customer_id' },
        },
        measures: {
          total_amount: { title: '总金额', type: 'sum', sql: 'SUM(source.total_amount)' },
        },
      },
    })

    renderPage()

    expect(await screen.findByTestId('devtools-screen')).toBeInTheDocument()
    expect(screen.getByTestId('semantic-resource-pane')).toBeInTheDocument()
    expect(screen.getByTestId('semantic-main-pane')).toBeInTheDocument()
    expect(screen.queryByTestId('semantic-inspector-pane')).not.toBeInTheDocument()
    expect(await screen.findByText('选择物理表开始建模')).toBeInTheDocument()
  })

  it('选中物理表后展示资源概览，并支持从物理表发起 AI 建模', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: {
        name: 'orders_cube',
        title: '订单分析',
        description: '订单事实表',
        table: 'orders_table',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        status: 'draft',
        dimensions: {
          customer_id: { title: '客户', type: 'string', sql: 'source.customer_id' },
        },
        measures: {
          total_amount: { title: '总金额', type: 'sum', sql: 'SUM(source.total_amount)' },
        },
      },
    })
    semanticApiMocks.createCube.mockResolvedValue({
      data: {
        name: 'orders_cube',
      },
    })

    renderPage()

    await screen.findByTestId('devtools-screen')
    await user.click(screen.getByRole('button', { name: '选择 orders_table' }))

    expect(await screen.findByText('资源概览')).toBeInTheDocument()
    expect(screen.getByText('orders_table')).toBeInTheDocument()
    expect(screen.getByText('字段预览')).toBeInTheDocument()
    expect(screen.getByText('customer_id')).toBeInTheDocument()
    expect(screen.getByText('订单总金额')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'AI 建模' }))

    await waitFor(() => {
      expect(semanticApiMocks.createCubeDraftFromSource).toHaveBeenCalledWith({
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        schema: 'public',
        table: 'orders_table',
      })
      expect(semanticApiMocks.createCube).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?cube=orders_cube&tab=modeling')
    })
  })

  it('无默认数据源时会从物理节点 key 中回填 datasource_id', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    dataSourceApiMocks.getDataSources.mockResolvedValueOnce({ data: { items: [] } })
    datasetApiMocks.previewDataset.mockClear()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '选择 orders_table' }))

    await waitFor(() => {
      expect(datasetApiMocks.previewDataset).toHaveBeenCalledWith({
        datasource_id: 1,
        database: 'dw',
        table: 'orders_table',
      })
    })
  })

  it('dataset-modeling 意图下支持按 dataset_id 发起 AI 建模', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockRejectedValueOnce(new Error('cube not found'))
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValue({
      data: {
        name: 'orders_cube',
        title: '订单分析',
        description: '订单事实表',
        table: 'dw.public.orders',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        status: 'draft',
        dimensions: {
          customer_id: { title: '客户', type: 'string', sql: 'source.customer_id' },
        },
        measures: {
          total_amount: { title: '总金额', type: 'sum', sql: 'SUM(source.total_amount)' },
        },
      },
    })
    semanticApiMocks.createCube.mockResolvedValue({ data: { name: 'orders_cube' } })

    renderPage('/semantic/workbench?cube=ghost_draft&tab=modeling&intent=dataset-modeling&datasetId=7')

    await screen.findByText('订单数据集')
    await user.click(screen.getByRole('button', { name: 'AI 建模' }))

    await waitFor(() => {
      expect(semanticApiMocks.createCubeDraftFromSource).toHaveBeenCalledWith({
        source_kind: 'dataset',
        dataset_id: 7,
      })
      expect(semanticApiMocks.createCube).toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?cube=orders_cube&tab=modeling')
    })
  })

  it('dataset-modeling 命中文件数据集时会阻止 AI 建模并给出错误提示', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockRejectedValueOnce(new Error('cube not found'))
    datasetApiMocks.getDatasets.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 9,
            dataset_code: 'file_orders',
            dataset_name: '附件数据集',
            dataset_type: 'file',
            source_id: 1,
            source_type: 'postgres',
            physical_table: 'dw.public.file_orders',
            description: '文件导入数据集',
            sync_status: 'synced',
            field_count: 2,
            created_at: '2026-04-01T00:00:00Z',
            updated_at: '2026-04-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      },
    })

    renderPage('/semantic/workbench?cube=ghost_draft&tab=modeling&intent=dataset-modeling&datasetId=9')

    await screen.findByText('附件数据集')
    await user.click(screen.getByRole('button', { name: 'AI 建模' }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'AI 建模失败',
        description: '当前暂不支持从 file 数据集生成 Cube，请改选物理表、physical Dataset 或 virtual Dataset。',
        variant: 'destructive',
      })
    })
  })

  it('已在 Cube 上下文时切换到新资源会提示重新建模，并在 AI 建模失败时展示错误', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    datasetApiMocks.previewDataset.mockResolvedValue({
      data: {
        preview_limit: 50,
        table_info: {
          database: 'dw',
          table: 'orders_table',
          comment: '订单事实表',
          row_count: 0,
          size: 128,
        },
        fields: [],
        sample_rows: [],
        sample_columns: [],
      },
    })
    semanticApiMocks.createCubeDraftFromSource.mockRejectedValueOnce(new Error('建模服务暂不可用'))

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await screen.findByText('订单分析修订草稿')
    await user.click(screen.getByRole('button', { name: '选择 orders_table' }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: '已切换到新资源',
        description: '当前为新建草稿态，请重新发起 AI 建模。',
      })
    })

    expect(await screen.findByText('资源概览')).toBeInTheDocument()
    expect(screen.getByText('暂无字段数据')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'AI 建模' }))
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: 'AI 建模失败',
        description: '建模服务暂不可用',
        variant: 'destructive',
      })
    })
  })

  it('单资源命中已有 Cube 时展示关联 Cube 面板并允许切换到已有模型', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.listCubes.mockResolvedValue({
      data: {
        cubes: [
          {
            name: 'orders_cube',
            title: '订单分析',
            description: '订单事实表',
            table: 'orders_table',
            dimensions: [],
            measures: [],
            dimension_count: 2,
            measure_count: 1,
            status: 'active',
            source_id: 1,
            source_database: 'dw',
            source_schema: 'public',
            domain_ids: [],
            domains: [],
            domain_count: 0,
            state_summary: { sync_status: 'ok' },
          },
          {
            name: 'orders_cube__revision_draft',
            title: '订单分析修订草稿',
            description: '待发布新版本',
            table: 'orders_table',
            dimensions: [],
            measures: [],
            dimension_count: 2,
            measure_count: 1,
            status: 'draft',
            source_id: 1,
            source_database: 'dw',
            source_schema: 'public',
            domain_ids: [],
            domains: [],
            domain_count: 0,
            state_summary: { sync_status: 'ok' },
          },
        ],
        total: 2,
      },
    })
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage()

    await screen.findByTestId('devtools-screen')
    await user.click(screen.getByRole('button', { name: '选择 orders_table' }))

    const relatedPane = await screen.findByTestId('related-cubes-pane')
    expect(within(relatedPane).getByText('关联 Cube (2)')).toBeInTheDocument()
    expect(within(relatedPane).getByText('订单分析')).toBeInTheDocument()
    expect(within(relatedPane).getByText('订单分析修订草稿')).toBeInTheDocument()

    await user.click(within(relatedPane).getByRole('button', { name: /订单分析修订草稿/ }))
    await waitFor(() => {
      expect(semanticApiMocks.describeCube).toHaveBeenCalledWith('orders_cube__revision_draft')
    })
  })

  it('通过工具栏新增维度并切到 Dimensions 编辑态', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Dimensions' }))

    expect(screen.queryByTestId('semantic-inspector-pane')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByRole('button', { name: 'Dimensions' })).toHaveAttribute('aria-current', 'true')
    expect(await screen.findByText('untitled_dimension')).toBeInTheDocument()
    await user.click(screen.getByText('untitled_dimension'))
    expect(await screen.findByTestId('semantic-inspector-pane')).toBeInTheDocument()
    expect(screen.getByText(/未命名 Dimension/)).toBeInTheDocument()
    expect(screen.getByLabelText('Dimension name')).toHaveValue('untitled_dimension')
  })

  it('通过工具栏新增指标并预填聚合方式', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Measures' }))
    await user.click(screen.getByRole('button', { name: '新增' }))

    expect(await screen.findByRole('button', { name: 'Measures' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('未命名 Measure')).toBeInTheDocument()
    expect(screen.getByLabelText('Measure name')).toHaveValue('untitled_measure')
    expect(screen.getByLabelText('Aggregation')).toHaveTextContent('sum')
  })

  it('Measures + Add 支持直接创建 builder 草稿并填写字段与聚合方式', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Measures' }))
    await user.click(screen.getByRole('button', { name: '新增' }))

    expect(screen.getByLabelText('Measure name')).toHaveValue('untitled_measure')
    expect(screen.getByLabelText('Field')).toHaveTextContent('选择字段')
    expect(screen.getByLabelText('Aggregation')).toHaveTextContent('sum')

    // Radix Select: click trigger then option
    await user.click(screen.getByLabelText('Field'))
    await user.click(await screen.findByRole('option', { name: 'total_amount' }))
    await user.click(screen.getByLabelText('Aggregation'))
    await user.click(await screen.findByRole('option', { name: 'avg' }))

    expect(screen.getByLabelText('Expression')).toHaveValue('AVG(`total_amount`)')
  })

  it('Add Join 按钮打开对话框并可添加 Join 草稿', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Joins' }))
    await user.click(screen.getByRole('button', { name: /新增/ }))
    expect(await screen.findByPlaceholderText('搜索物理表或数据集…')).toBeInTheDocument()
  })

  it('保存会回填并提交维度指标的同义词和标签', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    semanticApiMocks.updateCube.mockResolvedValue({
      data: {
        name: 'orders_cube__revision_draft',
      },
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Measures' }))
    await user.click(await screen.findByText('总金额'))
    expect(screen.getByText('GMV')).toBeInTheDocument()
    expect(screen.getByText('成交金额')).toBeInTheDocument()
    expect(screen.getByText('核心指标')).toBeInTheDocument()
    expect(screen.getByText('营收')).toBeInTheDocument()
    // Remove existing synonyms and add new ones
    const synRemoveButtons = screen.getAllByLabelText(/^删除 /)
    for (const btn of synRemoveButtons) await user.click(btn)
    await user.type(screen.getByLabelText('Synonyms'), '客单价{enter}')
    await user.type(screen.getByLabelText('Synonyms'), '平均金额{enter}')
    await user.type(screen.getByLabelText('Tags'), '分析指标{enter}')
    await user.type(screen.getByLabelText('Tags'), '金额{enter}')

    await user.click(screen.getByRole('button', { name: 'Dimensions' }))
    await user.click(await screen.findByText('customer_id'))
    expect(screen.getByLabelText('删除 客户ID')).toBeInTheDocument()
    expect(screen.getByLabelText('删除 用户ID')).toBeInTheDocument()
    expect(screen.getByLabelText('删除 主键')).toBeInTheDocument()
    expect(screen.getByLabelText('删除 客户')).toBeInTheDocument()
    expect(screen.getByLabelText('Format')).toHaveValue('string')
    const dimRemoveButtons = screen.getAllByLabelText(/^删除 /)
    for (const btn of dimRemoveButtons) await user.click(btn)
    await user.type(screen.getByLabelText('Synonyms'), '会员ID{enter}')
    await user.type(screen.getByLabelText('Synonyms'), '顾客ID{enter}')
    await user.type(screen.getByLabelText('Tags'), '维度{enter}')
    await user.type(screen.getByLabelText('Tags'), '标识{enter}')
    await user.clear(screen.getByLabelText('Format'))
    await user.type(screen.getByLabelText('Format'), 'identity')

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(semanticApiMocks.updateCube).toHaveBeenCalledWith(
        'orders_cube__revision_draft',
        expect.objectContaining({
          grain: 'customer_id',
          entity_key: 'customer_id',
          default_filters: expect.any(Array),
          joins: expect.any(Object),
          measures: expect.objectContaining({
            total_amount: expect.objectContaining({
              synonyms: ['客单价', '平均金额'],
              tags: ['分析指标', '金额'],
            }),
          }),
          dimensions: expect.objectContaining({
            customer_id: expect.objectContaining({
              format: 'identity',
              synonyms: ['会员ID', '顾客ID'],
              tags: ['维度', '标识'],
            }),
          }),
        }),
      )
    })
  })

  it('保存失败时展示 destructive 提示', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    semanticApiMocks.updateCube.mockRejectedValueOnce(new Error('save failed'))

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Dimensions' }))
    await user.click(await screen.findByText('customer_id'))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '客户主键' } })
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        title: '保存失败',
        description: 'save failed',
        variant: 'destructive',
      })
    })
  })

  it('维度编辑器支持切换模式并更新表单字段', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Dimensions' }))
    await user.click(await screen.findByText('customer_id'))

    expect(await screen.findByTestId('semantic-inspector-pane')).toBeInTheDocument()
    expect(screen.getByLabelText('Field')).toHaveTextContent('customer_id')

    await user.click(screen.getByRole('button', { name: '自定义模式' }))
    expect(screen.getByLabelText('Expression')).not.toHaveAttribute('readonly')
    await user.clear(screen.getByLabelText('Expression'))
    await user.type(screen.getByLabelText('Expression'), 'DATE_TRUNC(day, source.created_at)')

    await user.click(screen.getByRole('button', { name: '表单模式' }))
    expect(screen.getByLabelText('Field')).toHaveTextContent('customer_id')

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '下单日期' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '订单创建时间维度' } })
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'date' } })
    fireEvent.change(screen.getByLabelText('Synonyms'), { target: { value: '订单日期' } })
    fireEvent.keyDown(screen.getByLabelText('Synonyms'), { key: 'Enter', code: 'Enter' })
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: '时间维度' } })
    fireEvent.keyDown(screen.getByLabelText('Tags'), { key: 'Enter', code: 'Enter' })
    expect(screen.getByLabelText('Display name')).toHaveValue('下单日期')
    expect(screen.getByLabelText('Description')).toHaveValue('订单创建时间维度')
    expect(screen.getByLabelText('Format')).toHaveValue('date')

    await user.click(screen.getByLabelText('Field'))
    await user.click(await screen.findByRole('option', { name: 'total_amount (decimal(18,2))' }))
    expect(screen.getByLabelText('Expression')).toHaveValue('`total_amount`')
  })

  it('Filters 工作流支持选中已有 Filter、新建草稿并切换模式', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Filters' }))
    await user.click(await screen.findByText('排除删除订单'))

    expect(await screen.findByTestId('semantic-inspector-pane')).toBeInTheDocument()
    expect(screen.getByText('Filter · 排除删除订单')).toBeInTheDocument()
    expect(screen.getByLabelText('Operator')).toHaveValue('<>')
    expect(screen.getByLabelText('Default value')).toHaveValue('deleted')

    await user.click(screen.getByRole('button', { name: '自定义模式' }))
    const expression = screen.getByLabelText('Filter expression')
    expect(expression).toHaveValue("source.status <> 'deleted'")
    await user.clear(expression)
    await user.type(expression, "source.status = 'paid'")

    await user.click(screen.getByRole('button', { name: '表单模式' }))
    await user.click(screen.getByLabelText('Field'))
    await user.click(await screen.findByRole('option', { name: 'customer_id' }))
    await user.clear(screen.getByLabelText('Operator'))
    await user.type(screen.getByLabelText('Operator'), 'in')
    await user.clear(screen.getByLabelText('Default value'))
    await user.type(screen.getByLabelText('Default value'), 'vip')

    await user.click(screen.getByRole('button', { name: '新建 Filter' }))
    expect(await screen.findByText('filter_2')).toBeInTheDocument()
    expect(screen.getByText('Filter · filter_2')).toBeInTheDocument()
    expect(screen.getByLabelText('Field')).toHaveTextContent('customer_id')
    expect(screen.getByLabelText('Operator')).toHaveValue('=')
  })

  it('Join 编辑器支持切换 SQL/表单模式并维护多组 Join Key', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'orders_cube__revision_draft',
        title: '订单分析修订草稿',
        description: '待发布新版本',
        table: 'public.orders',
        domain_id: 'sales',
        domain_name: '销售域',
        domain_ids: ['sales'],
        domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
        domain_count: 1,
        status: 'draft',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        source_binding_summary: {
          source_id: 1,
          source_name: '学习行为仓',
          database: 'dw',
          schema: 'public',
          display: '学习行为仓 / dw.public',
        },
        dimensions: {
          customer_id: {
            title: '客户',
            type: 'string',
            description: '客户唯一标识',
            source_data_type: 'varchar',
            sql: 'source.customer_id',
            format: 'string',
            synonyms: ['客户ID', '用户ID'],
            tags: ['主键', '客户'],
          },
        },
        measures: {
          total_amount: {
            name: 'total_amount',
            title: '总金额',
            type: 'sum',
            description: '订单总金额',
            source_data_type: 'decimal(18,2)',
            format: 'currency',
            sql: 'SUM(source.total_amount)',
            synonyms: ['GMV', '成交金额'],
            tags: ['核心指标', '营收'],
          },
        },
        segments: {},
        joins: {
          users: {
            target_cube: 'users_cube',
            type: 'left',
            relationship: 'N:1',
            sql: 'source.user_id = users_cube.id AND source.org_id = users_cube.org_id',
          },
        },
        default_filters: [
          { sql: "source.status <> 'deleted'", description: '排除删除订单' },
        ],
        grain: 'customer_id',
        entity_key: 'customer_id',
        state_summary: {
          status: 'draft',
        },
      },
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Joins' }))
    await user.click(await screen.findByText('users'))

    expect(await screen.findByText('Join · users')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'SQL' }))
    await user.clear(screen.getByLabelText('Join expression'))
    await user.type(screen.getByLabelText('Join expression'), 'source.user_id = users_cube.id AND source.org_id = users_cube.org_id')

    await user.click(screen.getByRole('button', { name: '表单' }))
    await user.clear(screen.getByLabelText('Join name'))
    await user.type(screen.getByLabelText('Join name'), 'users_enriched')

    await user.click(screen.getByLabelText('Relationship'))
    await user.click(await screen.findByRole('option', { name: '1:N' }))
    await user.click(screen.getByLabelText('Join Type'))
    await user.click(await screen.findByRole('option', { name: 'INNER' }))
    expect(screen.getByLabelText('Relationship')).toHaveTextContent('1:N')
    expect(screen.getByLabelText('Join Type')).toHaveTextContent('INNER')
    expect(screen.getAllByText('users_cube').length).toBeGreaterThan(0)
    const joinFieldSelectors = within(screen.getByTestId('semantic-inspector-pane')).getAllByRole('combobox')
    await user.click(joinFieldSelectors[2])
    await user.click(await screen.findByRole('option', { name: 'customer_id' }))
    await user.click(within(screen.getByTestId('semantic-inspector-pane')).getAllByRole('combobox')[3])
    await user.click(await screen.findByRole('option', { name: 'customer_id' }))
    await user.click(screen.getByRole('button', { name: 'Join Key' }))
    await user.click(screen.getByRole('button', { name: 'Join Key' }))
    expect(screen.getByText('Join key 2')).toBeInTheDocument()
    expect(screen.getAllByText(/Join key \d+/)).toHaveLength(3)
    await user.click(screen.getAllByRole('button').find((button) => button.className.includes('hover:text-red-500'))!)
    await waitFor(() => {
      expect(screen.getAllByText(/Join key \d+/)).toHaveLength(2)
    })
  })

  it('Filters 空状态支持从列表直接创建新 Filter', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'orders_cube__revision_draft',
        title: '订单分析修订草稿',
        description: '待发布新版本',
        table: 'public.orders',
        domain_id: 'sales',
        domain_name: '销售域',
        domain_ids: ['sales'],
        domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
        domain_count: 1,
        status: 'draft',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        source_binding_summary: {
          source_id: 1,
          source_name: '学习行为仓',
          database: 'dw',
          schema: 'public',
          display: '学习行为仓 / dw.public',
        },
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
        default_filters: [],
        grain: 'customer_id',
        entity_key: 'customer_id',
        state_summary: {
          status: 'draft',
        },
      },
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Filters' }))
    expect(await screen.findByText('暂无自定义 Filter')).toBeInTheDocument()
    expect(screen.getByText('点击「新建 Filter」以创建筛选条件')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建 Filter' }))
    expect(await screen.findByText('filter_1')).toBeInTheDocument()
  })

  it('Join 对话框支持从数据集列表直接创建草稿 Join', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Joins' }))
    await user.click(screen.getByRole('button', { name: /新增/ }))
    await user.click(await screen.findByRole('button', { name: /订单数据集/ }))

    expect(screen.queryByPlaceholderText('搜索物理表或数据集…')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无 Join 关系')).not.toBeInTheDocument()
  })

  it('Measure 格式面板支持配置格式细节并写入保存载荷', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    semanticApiMocks.updateCube.mockResolvedValue({
      data: {
        name: 'orders_cube__revision_draft',
      },
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Measures' }))
    await user.click(await screen.findByText('总金额'))
    await user.click(screen.getByRole('button', { name: 'currency' }))

    await user.click(screen.getByRole('button', { name: 'Format type $' }))
    await user.click(screen.getByRole('button', { name: 'Format abbreviation Compact' }))
    await user.click(screen.getByRole('button', { name: '(123.45)' }))
    await user.click(screen.getByLabelText('Decimal places'))
    await user.click(await screen.findByRole('option', { name: '1' }))
    await user.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('button', { name: '$, Compact' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(semanticApiMocks.updateCube).toHaveBeenCalledWith(
        'orders_cube__revision_draft',
        expect.objectContaining({
          measures: expect.objectContaining({
            total_amount: expect.objectContaining({
              format: '$:Compact:1:false:(123.45)',
            }),
          }),
        }),
      )
    })
  })

  it('保留 DSL / 代码 / Python 路由链路', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube', 'active')

    renderPage('/semantic/workbench?cube=orders_cube&tab=dsl')

    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('DSL Playground orders_cube')

    await user.click(screen.getByRole('button', { name: 'YAML' }))
    expect(await screen.findByTestId('mock-yaml-editor-orders_cube')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Debug' }))
    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('DSL Playground orders_cube')
    await user.click(screen.getByRole('button', { name: 'UI Preview' }))
    expect(await screen.findByRole('button', { name: 'Preview' })).toBeInTheDocument()
  })

  it('保留 Python 预览路由', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube', 'active')

    renderPage('/semantic/workbench?cube=orders_cube&tab=python')

    expect(await screen.findByTestId('mock-python-tab')).toHaveTextContent('Python Preview orders_cube')
  })

  it('字段已加载但样本预览返回降级信息时展示提示', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    datasetApiMocks.previewDataset.mockImplementation(async () => ({
      data: {
        preview_limit: 50,
        table_info: {
          database: 'dw',
          table: 'orders_table',
          comment: '订单事实表',
          row_count: 1280,
          size: 1024,
        },
        fields: [
          {
            physical_name: 'customer_id',
            data_type: 'varchar',
            business_type: 'dimension',
            sensitivity_level: 'internal',
            confidence_score: 0.96,
            matched_rules: [],
            display_name: '客户',
            comment: '客户唯一标识',
            is_partition: false,
            is_measure: false,
            is_sensitive: false,
          },
          {
            physical_name: 'total_amount',
            data_type: 'decimal(18,2)',
            business_type: 'measure',
            sensitivity_level: 'internal',
            confidence_score: 0.94,
            matched_rules: [],
            display_name: '总金额',
            comment: '订单总金额',
            is_partition: false,
            is_measure: true,
            is_sensitive: false,
          },
        ],
        sample_rows: [],
        sample_columns: [],
        preview_error: 'preview unavailable',
      },
    }))

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    expect(await screen.findByText('数据预览失败（字段信息已加载）：preview unavailable')).toBeInTheDocument()
    expect(screen.getByText('数据预览不可用，但字段定义已就绪')).toBeInTheDocument()
  })

  it('临时草稿名会展示保存前重命名提醒', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__draft_tmp', 'draft')

    renderPage('/semantic/workbench?cube=orders_cube__draft_tmp&tab=modeling')

    expect(await screen.findByText('当前为临时草稿名，建议在保存前修改为正式的 Cube 名称和标题。')).toBeInTheDocument()
  })

  it('预览请求失败时展示错误空态', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube__revision_draft', 'draft')
    datasetApiMocks.previewDataset.mockImplementation(async () => {
      throw new Error('preview unavailable')
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    expect(await screen.findByText('加载失败：preview unavailable')).toBeInTheDocument()
  })

  it('无当前 Cube 时资源字段加载失败会展示错误态', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    datasetApiMocks.previewDataset.mockRejectedValueOnce(new Error('resource preview unavailable'))

    renderPage('/semantic/workbench')

    await user.click(await screen.findByRole('button', { name: '选择 orders_table' }))
    expect(await screen.findByText('加载字段失败：resource preview unavailable')).toBeInTheDocument()
  })

  it('dataset-modeling 意图会自动选中目标数据集并改走字段接口', async () => {
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockRejectedValueOnce(new Error('cube not found'))
    datasetApiMocks.getDatasetFields.mockClear()
    datasetApiMocks.previewDataset.mockClear()

    renderPage('/semantic/workbench?cube=ghost_draft&tab=modeling&intent=dataset-modeling&datasetId=7')

    await waitFor(() => {
      expect(datasetApiMocks.getDatasetFields).toHaveBeenCalledWith(7)
    })
    expect(await screen.findByText('订单数据集')).toBeInTheDocument()
    expect(screen.getByText('Dataset · 3 字段 · physical')).toBeInTheDocument()
  })

  it('左侧资源栏支持拖拽调整宽度', async () => {
    mockResourceApis()
    mockSemanticLists()

    renderPage('/semantic/workbench')

    const separator = await screen.findByRole('separator')
    fireEvent.mouseDown(separator, { clientX: 220 })
    fireEvent.mouseMove(document, { clientX: 300 })
    fireEvent.mouseUp(document)

    expect(screen.getByTestId('semantic-resource-pane')).toHaveStyle({ width: '300px' })
  })

  it('无当前 Cube 时发起 AI 建模会展示 pending 态', async () => {
    const user = userEvent.setup()
    let resolveDraft: ((value: unknown) => void) | undefined
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.createCubeDraftFromSource.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve
        }) as never,
    )

    renderPage('/semantic/workbench')

    await user.click(await screen.findByRole('button', { name: '选择 orders_table' }))
    await user.click(screen.getByRole('button', { name: 'AI 建模' }))

    expect(screen.getByRole('button', { name: '生成中…' })).toBeDisabled()

    resolveDraft?.({
      data: {
        name: 'orders_cube__revision_draft',
        title: '订单分析修订草稿',
        description: '待发布新版本',
        table: 'public.orders',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        status: 'draft',
        dimensions: {
          customer_id: { title: '客户', type: 'string', sql: 'source.customer_id' },
        },
        measures: {
          total_amount: { title: '总金额', type: 'sum', sql: 'SUM(source.total_amount)' },
        },
      },
    })
  })

  it('分页列表和空 Join 搜索结果都可正常渲染', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'orders_cube__revision_draft',
        title: '订单分析修订草稿',
        description: '待发布新版本',
        table: 'public.orders',
        domain_id: 'sales',
        domain_name: '销售域',
        domain_ids: ['sales'],
        domains: [{ id: 'sales', code: 'sales', name: '销售域', status: 'draft' }],
        domain_count: 1,
        status: 'draft',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'public',
        source_binding_summary: {
          source_id: 1,
          source_name: '学习行为仓',
          database: 'dw',
          schema: 'public',
          display: '学习行为仓 / dw.public',
        },
        dimensions: Object.fromEntries(
          Array.from({ length: 21 }).map((_, index) => [
            `dimension_${index + 1}`,
            {
              title: `维度 ${index + 1}`,
              type: 'string',
              sql: `source.dimension_${index + 1}`,
            },
          ]),
        ),
        measures: Object.fromEntries(
          Array.from({ length: 21 }).map((_, index) => [
            `measure_${index + 1}`,
            {
              title: `指标 ${index + 1}`,
              type: 'sum',
              sql: `SUM(source.measure_${index + 1})`,
            },
          ]),
        ),
        segments: {},
        joins: {},
        default_filters: [],
        grain: 'dimension_1',
        entity_key: 'dimension_1',
        state_summary: { status: 'draft' },
      },
    })

    renderPage('/semantic/workbench?cube=orders_cube__revision_draft&tab=modeling')

    await user.click(await screen.findByRole('button', { name: 'Measures' }))
    expect(screen.getByText('21 条，第 1/2 页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('21 条，第 2/2 页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dimensions' }))
    expect(screen.getByText('21 条，第 1/2 页')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('21 条，第 2/2 页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Joins' }))
    expect(await screen.findByText('暂无 Join 关系')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /新增/ }))
    await user.type(await screen.findByPlaceholderText('搜索物理表或数据集…'), 'not-found-table')
    expect(await screen.findByText('未找到匹配的表')).toBeInTheDocument()
  })
})
