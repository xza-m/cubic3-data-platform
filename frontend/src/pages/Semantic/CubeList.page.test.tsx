import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CubeList from './CubeList'

const semanticApiMocks = vi.hoisted(() => ({
  listCubes: vi.fn(),
  listViews: vi.fn(),
  describeCube: vi.fn(),
  createCubeRevision: vi.fn(),
}))

const navigateMock = vi.hoisted(() => vi.fn())

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
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    describeCube: semanticApiMocks.describeCube,
    createCubeRevision: semanticApiMocks.createCubeRevision,
  }
})

type MockRecord = Record<string, unknown>

function buildCube(name: string, title: string, overrides: MockRecord = {}): MockRecord {
  return {
    name,
    title,
    description: '',
    table: name,
    status: 'active',
    dimensions: [],
    measures: [],
    dimension_count: 2,
    measure_count: 1,
    ...overrides,
  }
}

function mockCubeInventory(cubes: MockRecord[]) {
  semanticApiMocks.listCubes.mockResolvedValueOnce({
    data: {
      cubes,
      total: cubes.length,
    },
  })
  semanticApiMocks.listViews.mockResolvedValueOnce({
    data: {
      views: [],
      total: 0,
    },
  })
}

function renderPage(initialEntry = '/') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <CubeList />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CubeList page', () => {
  beforeEach(() => {
    semanticApiMocks.listCubes.mockReset()
    semanticApiMocks.listViews.mockReset()
    semanticApiMocks.describeCube.mockReset()
    semanticApiMocks.createCubeRevision.mockReset()
    navigateMock.mockReset()
  })

  it('Cube 管理页默认进入资产视角，只展示已发布对象并移除新建入口', async () => {
    mockCubeInventory([
      buildCube('answer_records', '学生答题记录', {
        table: 'answer_records',
        dimension_count: 3,
        measure_count: 2,
        status: 'active',
        domain_name: '学习领域',
      }),
      buildCube('answer_records__revision_draft', '答题记录修订草稿', {
        table: 'answer_records',
        dimension_count: 1,
        measure_count: 1,
        status: 'draft',
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    expect(screen.getByRole('heading', { name: 'Cube 管理' })).toBeInTheDocument()
    expect(screen.getByText('只管理已发布与已废弃的正式语义资产')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索 Cube 名称...')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '新建 Cube' })).not.toBeInTheDocument()
    expect(screen.getByText('Cube 名称')).toBeInTheDocument()
    expect(screen.getByText('SQL 表')).toBeInTheDocument()
    expect(screen.getByText('维度')).toBeInTheDocument()
    expect(screen.getByText('指标')).toBeInTheDocument()
    expect(screen.getByText('字段')).toBeInTheDocument()
    const [statusSelect] = screen.getAllByRole('combobox')
    expect(statusSelect).toHaveTextContent('已发布')
    expect(screen.queryByRole('option', { name: '草稿' })).not.toBeInTheDocument()
    expect(screen.getByText('学生答题记录')).toBeInTheDocument()
    expect(screen.queryByText('答题记录修订草稿')).not.toBeInTheDocument()
    expect(screen.getByText('answer_records')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看详情' })).toBeInTheDocument()
    const activeRow = screen.getByText('学生答题记录').closest('div[class*="border-b"]')
    const activeStatus = within(activeRow as HTMLElement).getByText('活跃').closest('span.inline-flex')
    expect(activeStatus).toHaveClass('bg-emerald-50', 'text-emerald-700')
  })

  it('搜索关键字会过滤 Cube 列表并展示空态', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('answer_records', '学生答题记录', {
        description: '用于答题分析',
      }),
      buildCube('course_dimension', '课程维度', {
        status: 'draft',
        measure_count: 0,
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    const searchInput = screen.getByPlaceholderText('搜索 Cube 名称...')
    const [statusSelect] = screen.getAllByRole('combobox')

    await user.click(statusSelect)
    await user.click(screen.getByRole('option', { name: '全部状态' }))

    await user.type(searchInput, '课程')
    await waitFor(() => {
      expect(screen.getByText('课程维度')).toBeInTheDocument()
      expect(screen.queryByText('学生答题记录')).not.toBeInTheDocument()
    })

    await user.clear(searchInput)
    await user.type(searchInput, '不存在')
    await waitFor(() => {
      expect(screen.getByText('没有命中当前条件的 Cube')).toBeInTheDocument()
    })
  })

  it('状态筛选支持切换已发布与全部资产列表', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('active_cube', '已发布模型', {
        status: 'active',
      }),
      buildCube('draft_cube', '草稿模型', {
        status: 'draft',
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    const [statusSelect] = screen.getAllByRole('combobox')
    await user.click(statusSelect)
    await user.click(screen.getByRole('option', { name: '全部状态' }))

    await waitFor(() => {
      expect(screen.getByText('草稿模型')).toBeInTheDocument()
      expect(screen.getByText('已发布模型')).toBeInTheDocument()
    })
  })

  it('非激活状态显示兜底样式，并在缺失物理表时回退为占位符', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('draft_cube', '草稿模型', {
        status: 'draft',
        table: '',
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    const [statusSelect] = screen.getAllByRole('combobox')
    await user.click(statusSelect)
    await user.click(screen.getByRole('option', { name: '全部状态' }))
    expect(screen.getByText('草稿模型')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    const draftRow = screen.getByText('草稿模型').closest('div[class*="border-b"]')
    const draftStatus = within(draftRow as HTMLElement).getByText('草稿').closest('span.inline-flex')
    expect(draftStatus).toHaveClass('bg-amber-50', 'text-amber-700')
  })

  it('未知状态会回退为默认文案并沿用非激活样式', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('unknown_cube', '待判定模型', {
        status: undefined,
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    const [statusSelect] = screen.getAllByRole('combobox')
    await user.click(statusSelect)
    await user.click(screen.getByRole('option', { name: '全部状态' }))

    const unknownRow = screen.getByText('待判定模型').closest('div[class*="border-b"]')
    const unknownStatus = within(unknownRow as HTMLElement).getByText('未知').closest('span.inline-flex')
    expect(unknownStatus).toHaveClass('bg-amber-50', 'text-amber-700')
  })

  it('领域筛选支持切换已分配和未分配列表', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('assigned_cube', '已纳域模型', {
        domain_name: '学习领域',
        domain_ids: ['learning'],
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
      }),
      buildCube('unassigned_cube', '未纳域模型', {
        status: 'draft',
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    const [statusSelect, domainSelect] = screen.getAllByRole('combobox')
    await user.click(statusSelect)
    await user.click(screen.getByRole('option', { name: '全部状态' }))
    await user.click(domainSelect)
    await user.click(screen.getByRole('option', { name: '已分配' }))

    await waitFor(() => {
      expect(screen.getByText('已纳域模型')).toBeInTheDocument()
      expect(screen.queryByText('未纳域模型')).not.toBeInTheDocument()
    })

    await user.click(domainSelect)
    await user.click(screen.getByRole('option', { name: '未分配' }))
    await waitFor(() => {
      expect(screen.getByText('未纳域模型')).toBeInTheDocument()
      expect(screen.queryByText('已纳域模型')).not.toBeInTheDocument()
    })
  })

  it('初始 URL 参数会恢复搜索、状态与领域筛选', async () => {
    mockCubeInventory([
      buildCube('alpha_dimension', 'A 维度模型', {
        status: 'active',
        type: 'dimension',
        in_domain: true,
        domain_name: '学习领域',
      }),
      buildCube('zeta_fact', 'Z 事实模型', {
        status: 'draft',
        type: 'fact',
        in_domain: false,
      }),
    ])

    renderPage('/?q=维度&status=active&domain=assigned')

    await screen.findByTestId('cube-management-page')
    expect(screen.getByPlaceholderText('搜索 Cube 名称...')).toHaveValue('维度')
    const [statusSelect, domainSelect] = screen.getAllByRole('combobox')
    expect(statusSelect).toHaveTextContent('已发布')
    expect(domainSelect).toHaveTextContent('已分配')
    expect(screen.getByText('A 维度模型')).toBeInTheDocument()
    expect(screen.queryByText('Z 事实模型')).not.toBeInTheDocument()
  })

  it('已发布 Cube 可从详情抽屉发起修订并跳回工作台', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('answer_records', '学生答题记录', {
        table: 'answer_records',
        dimension_count: 3,
        measure_count: 2,
        status: 'active',
      }),
    ])
    semanticApiMocks.describeCube.mockResolvedValue({
      data: {
        name: 'answer_records',
        title: '学生答题记录',
        description: '答题事实表',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        status: 'active',
        dimensions: {
          student_id: { title: '学生', type: 'string' },
        },
        measures: {
          answer_count: { title: '答题数', type: 'count' },
        },
        segments: {},
        joins: {},
      },
    })
    semanticApiMocks.createCubeRevision.mockResolvedValue({
      data: {
        name: 'answer_records__revision_draft',
        title: '学生答题记录修订草稿',
        description: '待补充',
        table: 'answer_records',
        source_id: 1,
        dimensions: {},
        measures: {},
        status: 'draft',
      },
    })

    renderPage()

    await screen.findByTestId('cube-management-page')
    await user.click(screen.getByRole('button', { name: '学生答题记录' }))
    await screen.findByText('基础信息')
    expect(screen.getByText('字段摘要')).toBeInTheDocument()
    expect(screen.getAllByText('操作').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '去工作台查看' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建修订版' }))

    await waitFor(() => expect(semanticApiMocks.createCubeRevision).toHaveBeenCalledWith('answer_records'))
    expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench?cube=answer_records__revision_draft&tab=modeling')
  })

  it('草稿 Cube 的详情抽屉会提示继续建模并保留真实空态', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('answer_records__revision_draft', '学生答题记录修订草稿', {
        table: 'answer_records',
        dimension_count: 1,
        measure_count: 1,
        status: 'draft',
      }),
    ])
    semanticApiMocks.describeCube.mockResolvedValue({
      data: {
        name: 'answer_records__revision_draft',
        title: '学生答题记录修订草稿',
        description: '待补充',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        status: 'draft',
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
        state_summary: {
          status: 'draft',
          updated_at: '2026-04-01T12:30:00Z',
        },
      },
    })

    renderPage('/?status=all')

    await screen.findByTestId('cube-management-page')
    await user.click(screen.getByRole('button', { name: '学生答题记录修订草稿' }))

    await screen.findByText('基础信息')
    expect(screen.getByText('未归属')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '去工作台继续建模' })).toHaveAttribute(
      'href',
      '/semantic/workbench?cube=answer_records__revision_draft&tab=modeling',
    )
  })

  it('关闭详情抽屉后会清空当前选中的 Cube', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('answer_records', '学生答题记录', {
        status: 'active',
      }),
    ])
    semanticApiMocks.describeCube.mockResolvedValue({
      data: {
        name: 'answer_records',
        title: '学生答题记录',
        description: '答题事实表',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        status: 'active',
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
      },
    })

    renderPage()

    await screen.findByTestId('cube-management-page')
    await user.click(screen.getByRole('button', { name: '学生答题记录' }))
    await screen.findByText('基础信息')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByText('基础信息')).not.toBeInTheDocument()
    })
  })

  it('缺少标题时使用 Cube 名称作为列表入口和详情标题', async () => {
    const user = userEvent.setup()
    mockCubeInventory([
      buildCube('fallback_cube', '', {
        status: 'active',
      }),
    ])
    semanticApiMocks.describeCube.mockResolvedValue({
      data: {
        name: 'fallback_cube',
        title: '',
        description: '无标题模型',
        table: 'fallback_cube',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        status: 'active',
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
      },
    })

    renderPage()

    await screen.findByTestId('cube-management-page')
    await user.click(screen.getByRole('button', { name: 'fallback_cube' }))

    expect(await screen.findByRole('heading', { name: 'fallback_cube' })).toBeInTheDocument()
  })
})
