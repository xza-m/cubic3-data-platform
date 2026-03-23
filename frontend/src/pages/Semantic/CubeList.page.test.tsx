import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CubeList from './CubeList'

const semanticApiMocks = vi.hoisted(() => ({
  listCubes: vi.fn(),
  listViews: vi.fn(),
  getBatchMaterializeStatus: vi.fn(),
  describeCube: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    getBatchMaterializeStatus: semanticApiMocks.getBatchMaterializeStatus,
    describeCube: semanticApiMocks.describeCube,
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CubeList />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CubeList page', () => {
  it('Cube 管理页使用表格主视图和右侧预览', async () => {
    const cubes = [
      {
        name: 'answer_records',
        title: '学生答题记录',
        description: '用于答题分析',
        table: 'answer_records',
        status: 'active',
        dimensions: [],
        measures: [],
        dimension_count: 3,
        measure_count: 2,
        domain_name: '学习领域',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'learning',
        state_summary: {
          updated_at: '2026-03-20T10:00:00Z',
          last_published_at: '2026-03-18T10:00:00Z',
          sync_status: 'ok',
          publish_status: 'published',
          source_binding_summary: {
            display: 'dw.learning',
            source_id: 1,
            database: 'dw',
            schema: 'learning',
          },
        },
      },
    ]
    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes,
        total: 1,
      },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({ data: { views: [], total: 0 } })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({ data: {} })
    semanticApiMocks.describeCube.mockResolvedValueOnce({
      data: {
        name: 'answer_records',
        title: '学生答题记录',
        description: '用于答题分析',
        table: 'answer_records',
        status: 'active',
        domain_name: '学习领域',
        dimensions: {
          user_id: { title: '学生', type: 'string' },
        },
        measures: {
          answer_count: { title: '答题次数', type: 'count' },
        },
        segments: {},
        joins: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Cube 管理' })
    expect(screen.getByTestId('cube-management-item-answer_records')).toBeInTheDocument()
    expect(screen.getByTestId('semantic-preview-panel')).toBeInTheDocument()
    expect(screen.getByTestId('cube-open-design-answer_records')).toBeInTheDocument()
    expect(screen.getByText('待处理事项')).toBeInTheDocument()
    expect(screen.queryByText('快速查询')).not.toBeInTheDocument()
  })

  it('Cube 快筛可以切到未绑定数据源对象', async () => {
    const cubes = [
      {
        name: 'bound_cube',
        title: '已绑定模型',
        description: '已完成来源绑定',
        table: 'bound_cube',
        status: 'active',
        dimensions: [],
        measures: [],
        dimension_count: 2,
        measure_count: 1,
        domain_name: '学习领域',
        source_id: 1,
        source_database: 'dw',
        source_schema: 'learning',
        state_summary: {
          source_binding_summary: {
            display: 'dw.learning',
            source_id: 1,
          },
        },
      },
      {
        name: 'draft_cube',
        title: '待绑定模型',
        description: '还没有来源绑定',
        table: 'draft_cube',
        status: 'draft',
        dimensions: [],
        measures: [],
        dimension_count: 1,
        measure_count: 0,
      },
    ]

    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes,
        total: 2,
      },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({ data: { views: [], total: 0 } })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({ data: {} })
    semanticApiMocks.describeCube.mockResolvedValue({
      data: {
        name: 'draft_cube',
        title: '待绑定模型',
        description: '还没有来源绑定',
        table: 'draft_cube',
        status: 'draft',
        dimensions: {},
        measures: {},
        segments: {},
        joins: {},
      },
    })

    renderPage()

    await screen.findByRole('heading', { name: 'Cube 管理' })
    fireEvent.click(screen.getByTestId('semantic-filter-chip-unbound'))

    await waitFor(() => {
      expect(screen.queryByTestId('cube-management-item-bound_cube')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('cube-management-item-draft_cube')).toBeInTheDocument()
  })
})
