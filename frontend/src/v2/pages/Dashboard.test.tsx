import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@v2/hooks/dashboard', () => ({
  useDashboardOverview: vi.fn(),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
  }),
}))

import { useDashboardOverview } from '@v2/hooks/dashboard'
import Dashboard from './Dashboard'

const mockUseDashboardOverview = useDashboardOverview as ReturnType<typeof vi.fn>

function renderDashboard() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  )
  return render(<Dashboard />, { wrapper: Wrapper })
}

function dashboardResult(source: 'data_asset_tables' | 'datasets' = 'data_asset_tables') {
  return {
    data: {
      stats: {
        datasource_total: 2,
        dataset_total: 6,
        semantic_model_total: 3,
        today_query_count: 4,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: 1,
        dataset_week_delta: 2,
        query_count_week: 9,
      },
      health: {
        datasource_connectivity: 100,
        semantic_coverage: 50,
        query_success_rate: 90,
      },
      recent_queries: [
        {
          id: 1,
          name: 'SELECT 1',
          datasource_name: '主数仓',
          status: 'success',
          executed_at: '2026-06-03T02:00:00Z',
        },
      ],
      sources: {
        datasource_total: 'data_sources',
        connected_datasource_count: 'data_sources',
        dataset_total: source,
        today_query_count: 'query_histories',
        recent_queries: 'query_histories',
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }
}

describe('Dashboard fact source labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDashboardOverview.mockReturnValue(dashboardResult())
  })

  it('展示数据资产事实源，不把平台查询表述为 Gateway 正式问数', () => {
    renderDashboard()

    expect(screen.getByText('数据资产')).toBeInTheDocument()
    expect(screen.getByText('较上周 · 资产事实层 · data_asset_tables')).toBeInTheDocument()
    expect(screen.getByText('平台查询')).toBeInTheDocument()
    expect(screen.getByText('近 7 日累计 · 交互式查询 · query_histories')).toBeInTheDocument()
    expect(screen.getByText('平台交互式查询 · query_histories')).toBeInTheDocument()
    expect(screen.queryByText(/Gateway 正式问数/)).not.toBeInTheDocument()
  })

  it('数据规模回退到平台 Dataset 时明确标注来源', () => {
    mockUseDashboardOverview.mockReturnValue(dashboardResult('datasets'))

    renderDashboard()

    expect(screen.getByText('较上周 · 回退到平台 Dataset')).toBeInTheDocument()
  })
})
