import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CubeList from './CubeList'

const semanticApiMocks = vi.hoisted(() => ({
  listCubes: vi.fn(),
  listViews: vi.fn(),
  describeCube: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    describeCube: semanticApiMocks.describeCube,
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
  })

  it('Cube 管理页使用表格主视图与当前筛选栏', async () => {
    mockCubeInventory([
      buildCube('answer_records', '学生答题记录', {
        table: 'answer_records',
        dimension_count: 3,
        measure_count: 2,
        status: 'active',
        domain_name: '学习领域',
      }),
    ])

    renderPage()

    await screen.findByTestId('cube-management-page')
    expect(screen.getByRole('heading', { name: 'Cube 管理' })).toBeInTheDocument()
    expect(screen.getByText('管理语义模型 Cube 的定义、维度与指标')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索 Cube 名称...')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '新建 Cube' })).toHaveAttribute('href', '/semantic/cubes/new')
    expect(screen.getByText('Cube 名称')).toBeInTheDocument()
    expect(screen.getByText('SQL 表')).toBeInTheDocument()
    expect(screen.getByText('维度')).toBeInTheDocument()
    expect(screen.getByText('指标')).toBeInTheDocument()
    expect(screen.getByText('字段')).toBeInTheDocument()
    expect(screen.getByText('学生答题记录')).toBeInTheDocument()
    expect(screen.getByText('answer_records')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '编辑' })).toHaveAttribute('href', '/semantic/cubes/answer_records/edit')
    expect(screen.getByRole('button', { name: '预览' })).toBeInTheDocument()
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

  it('状态筛选支持切换已发布与草稿列表', async () => {
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
    const [statusSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(statusSelect, 'draft')

    await waitFor(() => {
      expect(screen.getByText('草稿模型')).toBeInTheDocument()
      expect(screen.queryByText('已发布模型')).not.toBeInTheDocument()
    })

    await user.selectOptions(statusSelect, 'active')
    await waitFor(() => {
      expect(screen.getByText('已发布模型')).toBeInTheDocument()
      expect(screen.queryByText('草稿模型')).not.toBeInTheDocument()
    })
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
    const [, domainSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    await user.selectOptions(domainSelect, 'assigned')

    await waitFor(() => {
      expect(screen.getByText('已纳域模型')).toBeInTheDocument()
      expect(screen.queryByText('未纳域模型')).not.toBeInTheDocument()
    })

    await user.selectOptions(domainSelect, 'unassigned')
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
    const [statusSelect, domainSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(statusSelect).toHaveValue('active')
    expect(domainSelect).toHaveValue('assigned')
    expect(screen.getByText('A 维度模型')).toBeInTheDocument()
    expect(screen.queryByText('Z 事实模型')).not.toBeInTheDocument()
  })
})
