import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DevTools from './DevTools'

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
              key: 'table:orders_table',
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

  it('保留 DSL / 代码 / Python 路由链路', async () => {
    const user = userEvent.setup()
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube', 'active')

    renderPage('/semantic/workbench?cube=orders_cube&tab=dsl')

    expect(await screen.findByTestId('mock-playground-tab')).toHaveTextContent('DSL Playground orders_cube')

    await user.click(screen.getByRole('button', { name: 'YAML' }))
    expect(await screen.findByTestId('mock-yaml-editor-orders_cube')).toBeInTheDocument()
  })

  it('保留 Python 预览路由', async () => {
    mockResourceApis()
    mockSemanticLists()
    mockCubeDetail('orders_cube', 'active')

    renderPage('/semantic/workbench?cube=orders_cube&tab=python')

    expect(await screen.findByTestId('mock-python-tab')).toHaveTextContent('Python Preview orders_cube')
  })
})
