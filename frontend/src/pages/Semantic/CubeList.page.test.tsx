import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import CubeList from './CubeList'

const semanticApiMocks = vi.hoisted(() => ({
  listCubes: vi.fn(),
  listViews: vi.fn(),
  getBatchMaterializeStatus: vi.fn(),
}))

vi.mock('@/api/semantic', async () => {
  const actual = await vi.importActual<typeof import('@/api/semantic')>('@/api/semantic')
  return {
    ...actual,
    listCubes: semanticApiMocks.listCubes,
    listViews: semanticApiMocks.listViews,
    getBatchMaterializeStatus: semanticApiMocks.getBatchMaterializeStatus,
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
  it('Cube 管理页不再混入快速查询和技术跳转', async () => {
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
      },
    ]
    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes,
        total: 1,
      },
    })
    semanticApiMocks.listCubes.mockResolvedValueOnce({
      data: {
        cubes,
        total: 1,
        page: 1,
        page_size: 9,
        page_count: 1,
      },
    })
    semanticApiMocks.listViews.mockResolvedValueOnce({ data: { views: [], total: 0 } })
    semanticApiMocks.listViews.mockResolvedValueOnce({ data: { views: [], total: 0, page: 1, page_size: 9, page_count: 0 } })
    semanticApiMocks.getBatchMaterializeStatus.mockResolvedValueOnce({ data: {} })

    renderPage()

    await screen.findByRole('heading', { name: 'Cube 管理' })
    expect(screen.getByTestId('cube-management-item-answer_records')).toBeInTheDocument()
    expect(screen.queryByText('快速查询')).not.toBeInTheDocument()
    expect(screen.queryByText('DSL JSON')).not.toBeInTheDocument()
    expect(screen.queryByText('去 IDE 查看定义')).not.toBeInTheDocument()
    expect(screen.getByTestId('cube-open-design-answer_records')).toBeInTheDocument()
  })
})
