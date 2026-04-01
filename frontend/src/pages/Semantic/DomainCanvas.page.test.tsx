import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DomainCanvas from './DomainCanvas'

const semanticApiMocks = vi.hoisted(() => ({
  getDomainCanvas: vi.fn(),
  publishDomain: vi.fn(),
  listDomainCatalogs: vi.fn(),
  listDomains: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    getDomainCanvas: semanticApiMocks.getDomainCanvas,
    publishDomain: semanticApiMocks.publishDomain,
    listDomainCatalogs: semanticApiMocks.listDomainCatalogs,
    listDomains: semanticApiMocks.listDomains,
  }
})

vi.mock('@/components/business', () => ({
  useToast: () => ({
    toast: semanticApiMocks.toast,
  }),
}))

vi.mock('@/hooks/useUnsavedChangesPrompt', () => ({
  useUnsavedChangesPrompt: vi.fn(),
}))

const SelectContext = React.createContext<{
  value: string
  onValueChange: (value: string) => void
}>({
  value: '',
  onValueChange: () => {},
})

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children, ...props }: { children: React.ReactNode }) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder || 'select'}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: React.ReactNode
  }) => {
    const ctx = React.useContext(SelectContext)
    return (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => ctx.onValueChange(value)}>
        {children}
      </button>
    )
  },
}))

vi.mock('@xyflow/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  const reactFlowApi = {
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
  }

  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-reactflow-provider">{children}</div>
    ),
    ReactFlow: ({
      nodes = [],
      edges = [],
      onNodeClick,
      onEdgeClick,
      onConnect,
      onPaneClick,
      children,
    }: {
      nodes?: Array<any>
      edges?: Array<any>
      onNodeClick?: (event: any, node: any) => void
      onEdgeClick?: (event: any, edge: any) => void
      onConnect?: (connection: any) => void
      onPaneClick?: (event: any) => void
      children?: React.ReactNode
    }) => (
      <div data-testid="mock-reactflow">
        <div>
          {nodes.filter((node) => !node.hidden).map((node) => (
            <button key={node.id} type="button" data-testid={`mock-node-${node.id}`} onClick={() => onNodeClick?.({}, node)}>
              {node.id}
            </button>
          ))}
        </div>
        <div>
          {edges.filter((edge) => !edge.hidden).map((edge) => (
            <button key={edge.id} type="button" data-testid={`mock-edge-${edge.id}`} onClick={() => onEdgeClick?.({}, edge)}>
              {edge.id}
            </button>
          ))}
        </div>
        <button type="button" data-testid="mock-connect-answer_records__user_profile" onClick={() => onConnect?.({ source: 'answer_records', target: 'user_profile' })}>
          mock connect
        </button>
        <button type="button" data-testid="mock-pane-click" onClick={() => onPaneClick?.({})}>
          mock pane click
        </button>
        {children}
      </div>
    ),
    BackgroundVariant: { Dots: 'dots' },
    useReactFlow: () => reactFlowApi,
    useNodesState: (initial: any[]) => React.useState(initial).concat([vi.fn()]),
    useEdgesState: (initial: any[]) => React.useState(initial).concat([vi.fn()]),
  }
})

function installSelectPolyfills() {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  })
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => {},
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  })
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/semantic/domains/domain-learning']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/domains/:id" element={<DomainCanvas />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function renderCatalogPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/semantic/domains/domain-learning?panel=catalog']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/domains/:id" element={<DomainCanvas />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

type MockRecord = Record<string, unknown>

function buildDomain(overrides: MockRecord = {}): MockRecord {
  return {
    id: 'domain-learning',
    code: 'learning',
    name: '学习领域',
    status: 'draft',
    description: '学习过程与结果相关语义模型',
    ...overrides,
  }
}

function buildNode(id: string, overrides: MockRecord = {}): MockRecord {
  return {
    id,
    title: id,
    type: 'fact',
    dimensions: 3,
    measures: 2,
    status: 'active',
    ...overrides,
  }
}

function buildEdge(overrides: MockRecord = {}): MockRecord {
  return {
    id: 'join-42',
    source: 'answer_records',
    target: 'user_profile',
    relationship: 'N:1',
    join_type: 'left',
    source_field: 'user_id',
    target_field: 'id',
    aggregation_strategy: 'none',
    description: '',
    ...overrides,
  }
}

function buildCube(name: string, title: string, overrides: MockRecord = {}): MockRecord {
  return {
    name,
    title,
    description: '',
    table: name,
    dimensions: [],
    measures: [],
    dimension_count: 3,
    measure_count: 0,
    status: 'active',
    in_domain: false,
    ...overrides,
  }
}

function mockCanvasData({
  domain = {},
  nodes = [],
  edges = [],
  libraryCubes = [],
}: {
  domain?: MockRecord
  nodes?: MockRecord[]
  edges?: MockRecord[]
  libraryCubes?: MockRecord[]
} = {}) {
  semanticApiMocks.getDomainCanvas.mockResolvedValueOnce({
    data: {
      domain: buildDomain(domain),
      nodes,
      edges,
      library_cubes: libraryCubes,
    },
  })
}

describe('DomainCanvas page', () => {
  beforeEach(() => {
    semanticApiMocks.getDomainCanvas.mockReset()
    semanticApiMocks.publishDomain.mockReset()
    semanticApiMocks.listDomainCatalogs.mockReset()
    semanticApiMocks.listDomains.mockReset()
    semanticApiMocks.toast.mockReset()
    semanticApiMocks.listDomainCatalogs.mockResolvedValue({
      data: {
        catalogs: [
          {
            code: 'default',
            name: '默认目录',
            domains: [
              {
                id: 'domain-learning',
                code: 'learning',
                name: '学习领域',
                cube_count: 2,
              },
            ],
          },
        ],
      },
    })
    semanticApiMocks.listDomains.mockResolvedValue({
      data: {
        domains: [
          {
            id: 'domain-learning',
            code: 'learning',
            name: '学习领域',
            cube_count: 2,
            join_count: 1,
          },
        ],
        total: 1,
        page: 1,
        page_size: 999,
        page_count: 1,
      },
    })
  })

  it('渲染当前画布结构与资源库', async () => {
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录', measures: 2 }),
        buildNode('course_dim', { title: '课程维度', type: 'dimension', measures: 0 }),
      ],
      edges: [
        buildEdge({
          id: 'join-42',
          source: 'answer_records',
          target: 'course_dim',
          target_field: 'id',
        }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('course_dim', '课程维度', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 4,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    expect(screen.getByTestId('domain-canvas-page')).toHaveClass('flex-col')
    expect(screen.getByTestId('mock-reactflow-provider')).toBeInTheDocument()
    expect(screen.getByText('Cube 库')).toBeInTheDocument()
    expect(screen.getByText('学习领域')).toBeInTheDocument()
    expect(await screen.findByText('2 Cubes')).toBeInTheDocument()
    expect(screen.getByTestId('domain-library-cube-user_profile')).toBeInTheDocument()
    expect(screen.getByTestId('mock-reactflow')).toBeInTheDocument()
    expect(within(screen.getByTestId('domain-join-panel')).getByText('当前 Join 关系')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '折叠资源树' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '折叠 Join 面板' })).toBeInTheDocument()
  })

  it('支持切换到领域目录模式，并在右侧展示领域信息', async () => {
    mockCanvasData({
      nodes: [buildNode('lesson_progress', { title: '学习进度' })],
      edges: [buildEdge()],
      libraryCubes: [buildCube('lesson_progress', '学习进度', { in_domain: true })],
    })

    renderCatalogPage()

    expect(await screen.findByText('领域目录')).toBeInTheDocument()
    expect(screen.getByText('领域说明')).toBeInTheDocument()
    expect(screen.getByText('Cube 关系')).toBeInTheDocument()
  })

  it('资源库支持关键词筛选与空结果提示', async () => {
    const user = userEvent.setup()
    mockCanvasData({
      libraryCubes: [
        buildCube('attention_cube', '待检查 Cube', {
          dimensions: ['user_id'],
          measure_count: 1,
          status: 'draft',
        }),
        buildCube('recent_cube', '最近课程 Cube', {
          dimensions: ['course_id'],
          dimension_count: 2,
          measure_count: 1,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    const searchInput = screen.getByPlaceholderText('搜索 Cube...')

    await user.type(searchInput, '课程')
    expect(screen.getByTestId('domain-library-cube-recent_cube')).toBeInTheDocument()
    expect(screen.queryByTestId('domain-library-cube-attention_cube')).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, '不存在')
    expect(screen.getByText('没有可加入的 Cube')).toBeInTheDocument()
  })

  it('点击已有关系会切到 Join 编辑器', async () => {
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      edges: [
        buildEdge({
          id: 'answer_records__user_profile',
          source: 'answer_records',
          target: 'user_profile',
        }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    fireEvent.click(await screen.findByTestId('mock-edge-answer_records__user_profile'))

    expect(await screen.findByText('编辑 Join')).toBeInTheDocument()
    expect(screen.getByDisplayValue('answer_records')).toBeInTheDocument()
    expect(screen.getByDisplayValue('user_profile')).toBeInTheDocument()
    expect(screen.getByTestId('domain-inspector-source-field')).toBeInTheDocument()
    expect(screen.getByTestId('domain-inspector-target-field')).toBeInTheDocument()
  })

  it('空画布时展示引导和默认 Join 面板', async () => {
    mockCanvasData({
      domain: { status: 'active' },
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    expect(screen.getByText('空画布引导')).toBeInTheDocument()
    expect(within(screen.getByTestId('domain-join-panel')).getByText('还没有定义 Join 关系')).toBeInTheDocument()
  })

  it('创建草稿 Join 后会校验必填字段并支持清空选择', async () => {
    const user = userEvent.setup()
    installSelectPolyfills()
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(screen.getByTestId('mock-connect-answer_records__user_profile'))
    expect(await screen.findByText('编辑 Join')).toBeInTheDocument()

    await user.click(screen.getByTestId('domain-inspector-save'))
    expect(semanticApiMocks.toast).toHaveBeenCalledWith({
      title: '请补全 Join 字段',
      variant: 'destructive',
    })

    await user.click(screen.getByTestId('mock-pane-click'))
    expect(screen.queryByText('编辑 Join')).not.toBeInTheDocument()
    expect(screen.getByText('当前 Join 关系')).toBeInTheDocument()
  })

  it('编辑已有 Join 时会校验 1:N 聚合策略并复用原 edge id', async () => {
    const user = userEvent.setup()
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      edges: [
        buildEdge({
          id: 'join-42',
          relationship: '1:N',
          source_field: '',
          target_field: '',
        }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id', 'class_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id', 'school_id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(await screen.findByTestId('mock-edge-join-42'))

    await user.click(screen.getByTestId('select-item-user_id'))
    await user.click(screen.getByTestId('select-item-id'))
    await user.click(screen.getByTestId('select-item-1:N'))
    await user.click(screen.getByTestId('domain-inspector-save'))

    expect(semanticApiMocks.toast).toHaveBeenCalledWith({
      title: '1:N 必须指定聚合策略',
      variant: 'destructive',
    })

    await user.click(screen.getByTestId('select-item-aggregate_before_join'))
    await user.click(screen.getByTestId('domain-inspector-save'))

    expect(await screen.findByTestId('mock-edge-join-42')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-edge-answer_records__user_profile')).not.toBeInTheDocument()
  })

  it('支持拖拽资源入画布并删除草稿 Join', async () => {
    const user = userEvent.setup()
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await screen.findByTestId('mock-node-answer_records')

    fireEvent.drop(screen.getByTestId('domain-canvas-surface'), {
      preventDefault: vi.fn(),
      clientX: 240,
      clientY: 180,
      dataTransfer: {
        getData: (type: string) => type === 'application/x-semantic-cube' ? 'user_profile' : '',
      },
    })

    expect(await screen.findByTestId('mock-node-user_profile')).toBeInTheDocument()

    await user.click(screen.getByTestId('mock-connect-answer_records__user_profile'))
    expect(await screen.findByText('编辑 Join')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.queryByText('编辑 Join')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-edge-answer_records__user_profile')).not.toBeInTheDocument()
  })

  it('拖拽资源时会写入拖拽元数据并忽略重复入域节点', async () => {
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await screen.findByTestId('mock-node-answer_records')
    const dragButton = screen.getByTestId('domain-library-cube-answer_records')
    const setData = vi.fn()
    const dragEvent = {
      dataTransfer: {
        setData,
        effectAllowed: '',
      },
    }

    fireEvent.dragStart(dragButton, dragEvent)
    expect(setData).toHaveBeenCalledWith('application/x-semantic-cube', 'answer_records')
    expect(setData).toHaveBeenCalledWith('text/plain', 'answer_records')
    expect(dragEvent.dataTransfer.effectAllowed).toBe('move')

    fireEvent.drop(screen.getByTestId('domain-canvas-surface'), {
      preventDefault: vi.fn(),
      clientX: 180,
      clientY: 160,
      dataTransfer: {
        getData: (type: string) => type === 'application/x-semantic-cube' ? 'answer_records' : '',
      },
    })

    expect(screen.getAllByTestId('mock-node-answer_records')).toHaveLength(1)
  })

  it('保存草稿 Join 时使用默认 edge id', async () => {
    const user = userEvent.setup()
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(screen.getByTestId('mock-connect-answer_records__user_profile'))
    await user.click(screen.getByTestId('select-item-user_id'))
    await user.click(screen.getByTestId('select-item-id'))
    await user.click(screen.getByTestId('domain-inspector-save'))

    expect(await screen.findByTestId('mock-edge-answer_records__user_profile')).toBeInTheDocument()
  })

  it('支持删除已有 Join', async () => {
    const user = userEvent.setup()
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      edges: [
        buildEdge({ id: 'join-42' }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(await screen.findByTestId('mock-edge-join-42'))
    await user.click(screen.getByRole('button', { name: '删除' }))

    expect(screen.queryByTestId('mock-edge-join-42')).not.toBeInTheDocument()
    expect(screen.queryByText('编辑 Join')).not.toBeInTheDocument()
    expect(screen.getByText('当前 Join 关系')).toBeInTheDocument()
  })

  it('发布领域成功时给出成功提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.publishDomain.mockResolvedValueOnce({
      data: { status: 'ok' },
    })
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
        buildNode('user_profile', { title: '学生档案', type: 'dimension', measures: 0 }),
      ],
      edges: [
        buildEdge({ id: 'join-42', description: '学生维表关联' }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
        buildCube('user_profile', '学生档案', {
          dimensions: ['id'],
          dimension_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(semanticApiMocks.publishDomain).toHaveBeenCalledWith('domain-learning', {
      cubes: ['answer_records', 'user_profile'],
      joins: [{
        name: 'join-42',
        source_cube: 'answer_records',
        target_cube: 'user_profile',
        source_field: 'user_id',
        target_field: 'id',
        join_type: 'left',
        cardinality: 'N:1',
        aggregation_strategy: 'none',
        description: '学生维表关联',
      }],
    }))
    await waitFor(() => expect(semanticApiMocks.toast).toHaveBeenCalledWith({ title: '领域 YAML 发布成功' }))
  })

  it('发布领域失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.publishDomain.mockRejectedValueOnce(new Error('publish failed'))
    mockCanvasData({
      nodes: [
        buildNode('answer_records', { title: '答题记录' }),
      ],
      libraryCubes: [
        buildCube('answer_records', '答题记录', {
          dimensions: ['user_id'],
          measure_count: 2,
          in_domain: true,
        }),
      ],
    })

    renderPage()

    await screen.findByTestId('domain-canvas-page')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(semanticApiMocks.toast).toHaveBeenCalledWith({
      title: '发布失败',
      description: 'publish failed',
      variant: 'destructive',
    }))
  })
})
