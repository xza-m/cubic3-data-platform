import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CubeDetail, CubeSummary } from '@/api/semantic'
import { CubePreviewPanel } from './CubePreviewPanel'

function buildSelectedCube(overrides: Partial<CubeSummary> = {}): CubeSummary {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '答题事实表',
    table: 'answer_records',
    status: 'draft',
    domain_ids: [],
    domains: [],
    domain_count: 0,
    dimensions: [],
    measures: [],
    dimension_count: 1,
    measure_count: 1,
    ...overrides,
  }
}

function buildCubeDetail(overrides: Partial<CubeDetail> = {}): CubeDetail {
  return {
    name: 'answer_records',
    title: '学生答题记录',
    description: '答题事实表',
    table: 'answer_records',
    domain_ids: [],
    domains: [],
    domain_count: 0,
    status: 'draft',
    dimensions: {
      student_id: { title: '学生', type: 'string' },
    },
    measures: {
      answer_count: { title: '答题数', type: 'count' },
    },
    segments: {},
    joins: {},
    grain: null,
    entity_key: null,
    state_summary: {
      status: 'draft',
      updated_at: '2026-04-01T12:30:00Z',
      last_published_at: '2026-03-28T09:00:00Z',
    },
    ...overrides,
  }
}

function renderPanel(selectedCube: CubeSummary, cubeDetail?: CubeDetail) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CubePreviewPanel selectedCube={selectedCube} cubeDetail={cubeDetail} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CubePreviewPanel', () => {
  it('会展示真实的所属领域空态、状态与最近变更', () => {
    renderPanel(
      buildSelectedCube({
        status: 'draft',
        domain_name: undefined,
      }),
      buildCubeDetail({
        domain_name: undefined,
        domains: [],
      }),
    )

    expect(screen.getByText('所属领域')).toBeInTheDocument()
    expect(screen.getByText('未归属')).toBeInTheDocument()
    expect(screen.queryByText('订单分析')).not.toBeInTheDocument()
    expect(screen.getByText('状态')).toBeInTheDocument()
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.getByText('最近变更')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-04-01T12:30:00Z').toLocaleString('zh-CN'))).toBeInTheDocument()
  })

  it('草稿 Cube 的工作台按钮会提示继续建模并保持建模 tab', () => {
    renderPanel(
      buildSelectedCube({
        status: 'draft',
      }),
      buildCubeDetail({
        status: 'draft',
      }),
    )

    const link = screen.getByRole('link', { name: '去工作台继续建模' })
    expect(link).toHaveAttribute('href', '/semantic/workbench?cube=answer_records&tab=modeling')
  })
})
