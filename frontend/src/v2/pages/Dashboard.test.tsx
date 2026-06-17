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

  it('展示产品口径来源，不暴露实现表名或平台 Dataset 文案', () => {
    renderDashboard()

    expect(screen.getByText('数据资产')).toBeInTheDocument()
    expect(screen.getByText('较上周 · 数据资产事实源')).toBeInTheDocument()
    expect(screen.getByText('平台查询')).toBeInTheDocument()
    expect(screen.getAllByText('交互式查询记录')).toHaveLength(1)
    expect(screen.getByText('近 7 日累计 · 交互式查询记录')).toBeInTheDocument()
    expect(screen.getByText('用业务问题生成 Cube 与本体草稿，校验后发布到语义中心，供 Agent / BI / 数据分析消费')).toBeInTheDocument()
    expect(screen.queryByText(/Gateway 正式问数/)).not.toBeInTheDocument()
    expect(screen.queryByText(/data_asset_tables|query_histories|平台 Dataset|发布给 Agent/)).not.toBeInTheDocument()
  })

  it('数据规模回退到 datasets 时展示平台数据集', () => {
    mockUseDashboardOverview.mockReturnValue(dashboardResult('datasets'))

    renderDashboard()

    expect(screen.getByText('较上周 · 平台数据集')).toBeInTheDocument()
    expect(screen.queryByText(/平台 Dataset/)).not.toBeInTheDocument()
  })
})
