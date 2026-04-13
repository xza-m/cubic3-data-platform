import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { createContext, useContext, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RelationCanvas, {
  LegacyCubeWorkbenchRedirect,
  buildCreateCubeDraftRequest,
  notifyCreateCubeFailure,
  resolveSelectedCubeId,
} from './RelationCanvas'

const semanticApiMocks = vi.hoisted(() => ({
  getGraph: vi.fn(),
  describeCube: vi.fn(),
  createCubeDraftFromSource: vi.fn(),
  createCube: vi.fn(),
  updateCube: vi.fn(),
  activateCube: vi.fn(),
  deprecateCube: vi.fn(),
}))

const datasourceMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

const elkLayoutMock = vi.hoisted(() => vi.fn(async (graph: any) => ({
  children: graph.children?.map((child: { id: string }, index: number) => ({
    id: child.id,
    x: index * 240,
    y: 0,
  })),
})))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    getGraph: semanticApiMocks.getGraph,
    describeCube: semanticApiMocks.describeCube,
    createCubeDraftFromSource: semanticApiMocks.createCubeDraftFromSource,
    createCube: semanticApiMocks.createCube,
    updateCube: semanticApiMocks.updateCube,
    activateCube: semanticApiMocks.activateCube,
    deprecateCube: semanticApiMocks.deprecateCube,
  }
})

vi.mock('@/api/datasources', () => ({
  getDataSources: datasourceMocks.getDataSources,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockElk {
    layout = elkLayoutMock
  },
}))

vi.mock('@/components/business', () => ({
  SchemaBrowser: ({ onSelect }: { onSelect?: (node: any) => void }) => (
    <div data-testid="schema-browser">
      <button
        type="button"
        onClick={() => onSelect?.({
          type: 'table',
          name: 'answer_records',
          metadata: {
            database: 'dw',
            schema: 'learning',
            table: 'answer_records',
            comment: '答题事实表',
          },
        })}
      >
        选择物理表
      </button>
      <button
        type="button"
        onClick={() => onSelect?.({
          type: 'database',
          name: 'dw',
          metadata: {
            database: 'dw',
          },
        })}
      >
        选择目录节点
      </button>
    </div>
  ),
  useToast: () => ({
    toast: toastMocks.toast,
  }),
}))

const SelectContext = createContext<{
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
    children: ReactNode
  }) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children, ...props }: { children: ReactNode }) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder || 'select'}</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: ReactNode
  }) => {
    const ctx = useContext(SelectContext)
    return (
      <button type="button" data-testid={`select-item-${value}`} onClick={() => ctx.onValueChange(value)}>
        {children}
      </button>
    )
  },
}))

vi.mock('@xyflow/react', async () => {
  const ReactLib = await vi.importActual<typeof import('react')>('react')

  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({
      nodes = [],
      edges = [],
      onNodeClick,
      children,
    }: {
      nodes?: Array<any>
      edges?: Array<any>
      onNodeClick?: (event: any, node: any) => void
      children?: React.ReactNode
    }) => (
      <div data-testid="mock-reactflow">
        <div>
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              data-testid={`mock-node-${node.id}`}
              onClick={() => onNodeClick?.({}, node)}
            >
              {node.id}
            </button>
          ))}
        </div>
        <div>
          {edges.map((edge) => (
            <span key={edge.id} data-testid={`mock-edge-${edge.id}`}>
              {edge.id}
            </span>
          ))}
        </div>
        {children}
      </div>
    ),
    BackgroundVariant: { Dots: 'dots' },
    useNodesState: (initial: any[]) => ReactLib.useState(initial).concat([vi.fn()]),
    useEdgesState: (initial: any[]) => ReactLib.useState(initial).concat([vi.fn()]),
  }
})

function renderPage(initialEntry = '/semantic/cubes/new') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/semantic/cubes/new" element={<RelationCanvas />} />
          <Route path="/semantic/cubes/:name" element={<RelationCanvas />} />
          <Route path="/semantic/cubes/:name/edit" element={<RelationCanvas />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function renderLegacyRedirect(initialEntry: string) {
  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/semantic/cubes/new" element={<LegacyCubeWorkbenchRedirect />} />
        <Route path="/semantic/cubes/:name/edit" element={<LegacyCubeWorkbenchRedirect />} />
        <Route path="/semantic/workbench" element={<div data-testid="workbench-destination">语义工作台页</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

function buildGraphData() {
  return {
    nodes: [
      {
        id: 'answer_records',
        title: '答题记录',
        type: 'fact',
        dimensions: 3,
        measures: 2,
        status: 'draft',
        source_id: 1,
        source_binding_summary: { source_name: '学习数仓', database: 'dw', schema: 'learning' },
      },
      {
        id: 'course_profile',
        title: '课程档案',
        type: 'dimension',
        dimensions: 2,
        measures: 0,
        status: 'active',
        source_id: 2,
        source_binding_summary: { source_name: '教学数仓', database: 'teaching', schema: 'mart' },
      },
    ],
    edges: [
      {
        source: 'answer_records',
        target: 'course_profile',
        relationship: 'N:1',
        join_type: 'left',
        sql: 'answer_records.course_id = course_profile.id',
      },
    ],
  }
}

function buildCubeDetail(overrides: Record<string, any> = {}) {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '用于答题分析',
    table: 'answer_records',
    status: 'draft',
    source_id: 1,
    source_database: 'dw',
    source_schema: 'learning',
    source_binding_summary: {
      source_name: '学习数仓',
      source_type: 'maxcompute',
      database: 'dw',
      schema: 'learning',
    },
    dimensions: {
      user_id: { title: '学生', type: 'string' },
      class_id: { title: '班级', type: 'string' },
    },
    measures: {
      answer_count: { title: '答题次数', type: 'count' },
    },
    segments: {},
    joins: {},
    state_summary: {
      sync_status: 'ok',
      last_drift_checked_at: '2026-03-26T08:00:00Z',
    },
    ...overrides,
  }
}

function buildDraft(overrides: Record<string, any> = {}) {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '用于答题分析',
    table: 'answer_records',
    source_id: 1,
    source_database: 'dw',
    source_schema: 'learning',
    data_source: '学习数仓',
    status: 'draft',
    dimensions: {
      user_id: { title: '学生', type: 'string' },
    },
    measures: {
      answer_count: { title: '答题次数', type: 'count' },
    },
    ...overrides,
  }
}

describe('RelationCanvas page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('旧的新建路由会回流到工作台起始态', async () => {
    renderLegacyRedirect('/semantic/cubes/new')

    expect(await screen.findByTestId('workbench-destination')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench')
  })

  it('旧的编辑路由会回流到对应 workbench 对象态', async () => {
    renderLegacyRedirect('/semantic/cubes/answer_records/edit')

    expect(await screen.findByTestId('workbench-destination')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench?cube=answer_records&tab=modeling')
  })

  it('旧的编辑路由会保留已有 query，而不是强制改成默认 tab', async () => {
    renderLegacyRedirect('/semantic/cubes/answer_records/edit?tab=sync')

    expect(await screen.findByTestId('workbench-destination')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench?tab=sync&cube=answer_records')
  })

  it('旧的新建路由会删除残留 cube query 再回到工作台起始态', async () => {
    renderLegacyRedirect('/semantic/cubes/new?cube=old')

    expect(await screen.findByTestId('workbench-destination')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench')
  })

  it('旧的新建路由会清理无效 tab 再回到工作台起始态', async () => {
    renderLegacyRedirect('/semantic/cubes/new?tab=sync')

    expect(await screen.findByTestId('workbench-destination')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/semantic/workbench')
  })

  it('创建草稿前要求已选择数据源与物理表', () => {
    expect(() => buildCreateCubeDraftRequest()).toThrow('请先选择数据源和物理表')
    expect(
      buildCreateCubeDraftRequest('1', {
        database: 'dw',
        schema: 'learning',
        table: 'answer_records',
      }),
    ).toEqual({
      source_kind: 'physical_table',
      source_id: 1,
      database: 'dw',
      schema: 'learning',
      table: 'answer_records',
    })
  })

  it('创建 Cube 失败时统一输出 destructive 提示', () => {
    const toast = vi.fn()

    notifyCreateCubeFailure({
      toast,
      error: new Error('当前草稿无法创建'),
    })

    expect(toast).toHaveBeenCalledWith({
      title: '创建 Cube 失败',
      description: '当前草稿无法创建',
      variant: 'destructive',
    })
  })

  it('根据路由和草稿状态解析默认选中的 Cube', () => {
    expect(
      resolveSelectedCubeId({
        name: 'answer_records',
        draft: null,
        isCreateRoute: false,
      }),
    ).toBe('answer_records')
    expect(
      resolveSelectedCubeId({
        name: undefined,
        draft: null,
        isCreateRoute: false,
      }),
    ).toBeNull()
    expect(
      resolveSelectedCubeId({
        name: undefined,
        draft: buildDraft(),
        isCreateRoute: true,
      }),
    ).toBeUndefined()
  })

  it('支持从物理表生成草稿并创建 Cube', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValueOnce({
      data: buildDraft(),
    })
    semanticApiMocks.createCube.mockResolvedValueOnce({
      data: buildDraft(),
    })

    renderPage('/semantic/cubes/new')

    expect((await screen.findAllByText('新建 Cube')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('选择物理表'))
    await waitFor(() => {
      expect(screen.getByTestId('cube-generate-draft')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByTestId('cube-generate-draft'))

    await waitFor(() => {
      expect(semanticApiMocks.createCubeDraftFromSource).toHaveBeenCalledWith({
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        schema: 'learning',
        table: 'answer_records',
      })
    })
    expect(toastMocks.toast).toHaveBeenCalledWith({ title: 'Cube 草稿已生成' })
    expect(await screen.findByText('创建 Cube 草稿')).toBeInTheDocument()
    expect(screen.getByDisplayValue('answer_records')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '创建 Draft Cube' }))
    await waitFor(() => {
      expect(semanticApiMocks.createCube).toHaveBeenCalledWith(expect.objectContaining({
        name: 'answer_records',
        title: '学生答题记录',
      }))
    })
    expect(toastMocks.toast).toHaveBeenCalledWith({ title: 'Cube 创建成功' })
  })

  it('创建 Draft Cube 失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.createCubeDraftFromSource.mockResolvedValueOnce({
      data: buildDraft(),
    })
    semanticApiMocks.createCube.mockRejectedValueOnce(new Error('Draft Cube 创建失败'))

    renderPage('/semantic/cubes/new')

    fireEvent.click(await screen.findByText('选择物理表'))
    await waitFor(() => {
      expect(screen.getByTestId('cube-generate-draft')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByTestId('cube-generate-draft'))
    expect(await screen.findByText('创建 Cube 草稿')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '创建 Draft Cube' }))

    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith({
        title: '创建 Cube 失败',
        description: 'Draft Cube 创建失败',
        variant: 'destructive',
      })
    })
  })

  it('在编辑模式下支持更新、激活和弃用 Cube', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValue({
      data: buildCubeDetail(),
    })
    semanticApiMocks.updateCube.mockResolvedValueOnce({
      data: buildCubeDetail({ title: '答题明细模型', description: '新版说明', status: 'active' }),
    })
    semanticApiMocks.activateCube.mockResolvedValueOnce({
      data: buildCubeDetail({ title: '学生答题记录', status: 'active' }),
    })
    semanticApiMocks.deprecateCube.mockResolvedValueOnce({
      data: buildCubeDetail({ title: '学生答题记录', status: 'deprecated' }),
    })

    renderPage('/semantic/cubes/answer_records/edit')

    expect((await screen.findAllByText('编辑 Cube')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTestId('mock-node-answer_records'))
    expect(navigateMock).toHaveBeenCalledWith('/semantic/cubes/answer_records/edit')

    const titleInput = await screen.findByDisplayValue('学生答题记录')
    await user.clear(titleInput)
    await user.type(titleInput, '答题明细模型')

    const descriptionInput = screen.getByDisplayValue('用于答题分析')
    await user.clear(descriptionInput)
    await user.type(descriptionInput, '新版说明')
    await user.click(screen.getByTestId('select-item-active'))

    await user.click(screen.getByRole('button', { name: '保存基础信息' }))
    await waitFor(() => {
      expect(semanticApiMocks.updateCube).toHaveBeenCalledWith('answer_records', {
        title: '答题明细模型',
        description: '新版说明',
        status: 'active',
      })
    })

    await user.click(screen.getByRole('button', { name: '激活' }))
    await waitFor(() => {
      expect(semanticApiMocks.activateCube).toHaveBeenCalledWith('answer_records')
    })

    const deprecateButtons = screen.getAllByRole('button', { name: '弃用' })
    await user.click(deprecateButtons[deprecateButtons.length - 1]!)
    await waitFor(() => {
      expect(semanticApiMocks.deprecateCube).toHaveBeenCalledWith('answer_records')
    })
  })

  it('弃用失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail(),
    })
    semanticApiMocks.deprecateCube.mockRejectedValueOnce(new Error('当前 Cube 无法弃用'))

    renderPage('/semantic/cubes/answer_records/edit')

    expect((await screen.findAllByText('编辑 Cube')).length).toBeGreaterThan(0)
    const deprecateButtons = screen.getAllByRole('button', { name: '弃用' })
    await user.click(deprecateButtons[deprecateButtons.length - 1]!)

    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith({
        title: '弃用失败',
        description: '当前 Cube 无法弃用',
        variant: 'destructive',
      })
    })
  })

  it('更新和激活失败时给出 destructive 提示', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValue({
      data: buildCubeDetail(),
    })
    semanticApiMocks.updateCube.mockRejectedValueOnce(new Error('基础信息保存失败'))
    semanticApiMocks.activateCube.mockRejectedValueOnce(new Error('当前状态不可激活'))

    renderPage('/semantic/cubes/answer_records/edit')

    expect((await screen.findAllByText('编辑 Cube')).length).toBeGreaterThan(0)

    const titleInput = await screen.findByDisplayValue('学生答题记录')
    await user.clear(titleInput)
    await user.type(titleInput, '保存失败模型')
    await user.click(screen.getByRole('button', { name: '保存基础信息' }))

    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith({
        title: '更新 Cube 失败',
        description: '基础信息保存失败',
        variant: 'destructive',
      })
    })

    await user.click(screen.getByRole('button', { name: '激活' }))

    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith({
        title: '激活失败',
        description: '当前状态不可激活',
        variant: 'destructive',
      })
    })
  })

  it('支持按数据源过滤画布并处理生成草稿失败', async () => {
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [
          { id: 1, name: '学习数仓', source_type: 'maxcompute' },
          { id: 2, name: '教学数仓', source_type: 'postgres' },
        ],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail({
        name: 'course_profile',
        title: '课程档案',
        source_id: 2,
        source_database: 'teaching',
        source_schema: 'mart',
        source_binding_summary: {
          source_name: '教学数仓',
          source_type: 'postgres',
          database: 'teaching',
          schema: 'mart',
        },
      }),
    })
    semanticApiMocks.createCubeDraftFromSource.mockRejectedValueOnce(new Error('表结构解析失败'))

    renderPage('/semantic/cubes/new')

    expect((await screen.findAllByText('新建 Cube')).length).toBeGreaterThan(0)
    expect(await screen.findByTestId('mock-node-answer_records')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-node-course_profile')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('选择物理表'))
    await waitFor(() => {
      expect(screen.getByTestId('cube-generate-draft')).not.toBeDisabled()
    })
    fireEvent.click(screen.getByTestId('cube-generate-draft'))
    await waitFor(() => {
      expect(toastMocks.toast).toHaveBeenCalledWith({
        title: '生成草稿失败',
        description: '表结构解析失败',
        variant: 'destructive',
      })
    })

    fireEvent.click(screen.getByTestId('select-item-2'))
    expect(await screen.findByTestId('mock-node-course_profile')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-node-answer_records')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('mock-node-course_profile'))
    expect(await screen.findByDisplayValue('course_profile')).toBeInTheDocument()
    expect(elkLayoutMock).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('select-item-1'))
    await waitFor(() => {
      expect(screen.queryByDisplayValue('course_profile')).not.toBeInTheDocument()
    })
  })

  it('侧边栏关闭时返回索引，并在来源名缺失时回退到数据源类型', async () => {
    const user = userEvent.setup()
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail({
        source_binding_summary: {
          source_name: '',
          source_type: 'maxcompute',
          database: 'dw',
          schema: 'learning',
        },
      }),
    })

    renderPage('/semantic/cubes/answer_records/edit')

    expect((await screen.findAllByText('编辑 Cube')).length).toBeGreaterThan(0)
    expect(screen.getByText('maxcompute')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/semantic/cubes')
    })
  })

  it('只读模式展示查看态描述，忽略非表节点，并在未绑定来源时显示兜底文案', async () => {
    semanticApiMocks.getGraph.mockResolvedValueOnce({ data: buildGraphData() })
    datasourceMocks.getDataSources.mockResolvedValueOnce({
      data: {
        items: [{ id: 1, name: '学习数仓', source_type: 'maxcompute' }],
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: buildCubeDetail({
        source_binding_summary: {
          source_name: '',
          source_type: '',
          database: 'dw',
          schema: 'learning',
        },
      }),
    })

    renderPage('/semantic/cubes/answer_records')

    expect(await screen.findByText('查看当前 Cube 的来源、字段规模与同步状态。')).toBeInTheDocument()
    fireEvent.click(screen.getByText('选择目录节点'))
    expect(screen.getByTestId('cube-generate-draft')).toBeDisabled()

    fireEvent.click(screen.getByTestId('mock-node-answer_records'))
    expect(await screen.findByText('未绑定')).toBeInTheDocument()
  })
})
