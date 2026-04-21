import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Playground from './Playground'

const semanticApiMocks = vi.hoisted(() => ({
  listCubes: vi.fn(),
  listViews: vi.fn(),
  describeCube: vi.fn(),
  describeView: vi.fn(),
  getBatchMaterializeStatus: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    describeCube: semanticApiMocks.describeCube,
    describeView: semanticApiMocks.describeView,
    getBatchMaterializeStatus: semanticApiMocks.getBatchMaterializeStatus,
  }
})

function renderPage(initialEntry = '/semantic/cubes') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Playground />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('Playground page', () => {
  it('默认展示 Cube 浏览、成员筛选与快捷跳转', async () => {
    const user = userEvent.setup()

    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes: [
          {
            name: 'answer_records',
            title: '学生答题记录',
            description: '用于答题分析',
            table: 'dws.answer_records',
            domain_name: '学习领域',
            domain_id: 'learning',
            domain_ids: ['learning'],
            domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
            domain_count: 1,
            status: 'active',
            dimensions: [],
            measures: [],
            dimension_count: 2,
            measure_count: 2,
          },
          {
            name: 'course_snapshot',
            title: '课程快照',
            description: '课程目录',
            table: 'dim.course_snapshot',
            domain_name: '教学领域',
            domain_id: 'teaching',
            domain_ids: ['teaching'],
            domains: [{ id: 'teaching', code: 'teaching', name: '教学领域' }],
            domain_count: 1,
            status: 'draft',
            dimensions: [],
            measures: [],
            dimension_count: 1,
            measure_count: 0,
          },
        ],
        total: 2,
      },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({
      data: {
        views: [
          {
            name: 'learning_view',
            title: '学习宽表',
            description: '供下游消费',
            public: true,
            cube_count: 1,
          },
        ],
        total: 1,
      },
    })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'answer_records',
        title: '学生答题记录',
        description: '用于答题分析',
        table: 'dws.answer_records',
        domain_id: 'learning',
        domain_name: '学习领域',
        domain_ids: ['learning'],
        domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
        domain_count: 1,
        status: 'active',
        dimensions: {
          user_id: { title: '学生', type: 'string', primary_key: true, enum: { a: 'Alice', b: 'Bob' } },
          class_name: { title: '班级', type: 'string' },
        },
        measures: {
          answer_count: { title: '答题次数', type: 'count', certified: true },
          accuracy_rate: { title: '正确率', type: 'number', format: '0.00%' },
        },
        segments: {},
        joins: {
          user_profile: { target_cube: 'user_profile', type: 'belongsTo' },
        },
      },
    })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({ data: {} })

    renderPage()

    await screen.findByRole('heading', { name: 'Cube 管理' })
    expect(screen.getByTestId('playground-item-answer_records')).toBeInTheDocument()
    await waitFor(() => {
      expect(semanticApiMocks.describeCube).toHaveBeenCalledWith('answer_records')
    })
    expect(await screen.findByRole('link', { name: '查看详情' })).toHaveAttribute('href', '/semantic/cubes/answer_records')
    expect(screen.getByRole('link', { name: '进入画布' })).toHaveAttribute('href', '/semantic/domains/learning')
    expect(screen.getByText('user_id')).toBeInTheDocument()
    expect(screen.getByText('班级')).toBeInTheDocument()
    expect(screen.getByText('枚举 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '指标 (2)' }))
    expect(screen.getByText('answer_count')).toBeInTheDocument()
    expect(screen.getByText('正确率')).toBeInTheDocument()

    await user.type(screen.getByTestId('playground-member-filter'), '正确')
    expect(screen.getByText('accuracy_rate')).toBeInTheDocument()
    expect(screen.queryByText('answer_count')).not.toBeInTheDocument()
  })

  it('切换到 View 后展示引用映射、诊断与物化状态', async () => {
    const user = userEvent.setup()

    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: { cubes: [], total: 0 },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({
      data: {
        views: [
          {
            name: 'learning_view',
            title: '学习宽表',
            description: '给 BI 使用',
            public: false,
            cube_count: 2,
          },
        ],
        total: 1,
      },
    })
    semanticApiMocks.describeView.mockResolvedValueOnce({
      data: {
        name: 'learning_view',
        title: '学习宽表',
        description: '给 BI 使用',
        public: false,
        cubes: [
          {
            join_path: 'answer_records',
            includes: '*',
            excludes: [],
            prefix: false,
          },
        ],
        diagnostics: [
          { level: 'warn', message: '存在待确认字段映射' },
        ],
      },
    })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({
      data: {
        learning_view: {
          materialized: false,
        },
      },
    })

    renderPage('/semantic/cubes?kind=view')

    await screen.findByRole('heading', { name: 'Cube 管理' })
    await user.click(screen.getByRole('button', { name: 'Views' }))

    await waitFor(() => {
      expect(semanticApiMocks.describeView).toHaveBeenCalledWith('learning_view')
    })
    expect(screen.getByText('引用 Cube 映射')).toBeInTheDocument()
    expect(screen.getByText('answer_records')).toBeInTheDocument()
    expect(screen.getByText('includes: 全部字段')).toBeInTheDocument()
    expect(screen.getByText('存在待确认字段映射')).toBeInTheDocument()
    expect(screen.getAllByText('私有').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未发布').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '查看 View 详情' })).toHaveAttribute('href', '/semantic/views/learning_view')
  })

  it('搜索无结果时展示空态与未选择提示', async () => {
    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes: [
          {
            name: 'answer_records',
            title: '学生答题记录',
            description: '用于答题分析',
            table: 'dws.answer_records',
            domain_name: '学习领域',
            domain_id: 'learning',
            domain_ids: ['learning'],
            domains: [{ id: 'learning', code: 'learning', name: '学习领域' }],
            domain_count: 1,
            status: 'active',
            dimensions: [],
            measures: [],
            dimension_count: 2,
            measure_count: 1,
          },
        ],
        total: 1,
      },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({
      data: { views: [], total: 0 },
    })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({ data: {} })

    renderPage('/semantic/cubes?q=missing')

    await screen.findByRole('heading', { name: 'Cube 管理' })
    expect(screen.getByText('没有匹配项')).toBeInTheDocument()
    expect(screen.getByText('选择一个模型查看成员')).toBeInTheDocument()
  })

  it('在 View 模式下按关键词过滤列表', async () => {
    const user = userEvent.setup()

    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: { cubes: [], total: 0 },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({
      data: {
        views: [
          {
            name: 'learning_view',
            title: '学习宽表',
            description: '给 BI 使用',
            public: false,
            cube_count: 2,
          },
          {
            name: 'ops_view',
            title: '运营总览',
            description: '给运营看板使用',
            public: true,
            cube_count: 1,
          },
        ],
        total: 2,
      },
    })
    semanticApiMocks.describeView.mockResolvedValue({
      data: {
        name: 'ops_view',
        title: '运营总览',
        description: '给运营看板使用',
        public: true,
        cubes: [{ join_path: 'ops_cube', includes: '*', excludes: [], prefix: false }],
        diagnostics: [{ level: 'error', message: '存在待确认指标映射' }],
      },
    })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({
      data: {
        learning_view: { materialized: false },
        ops_view: { materialized: true },
      },
    })

    renderPage('/semantic/cubes?kind=view')

    await screen.findByRole('heading', { name: 'Cube 管理' })
    await user.click(screen.getByRole('button', { name: 'Views' }))
    await user.type(screen.getByTestId('playground-search'), '运营')

    expect(screen.getByTestId('playground-item-ops_view')).toBeInTheDocument()
    expect(screen.queryByTestId('playground-item-learning_view')).not.toBeInTheDocument()
    expect(await screen.findByText('存在待确认指标映射')).toBeInTheDocument()
  })
})
