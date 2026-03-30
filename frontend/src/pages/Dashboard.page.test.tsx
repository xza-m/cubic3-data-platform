import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'

const navigateMock = vi.fn()

const dashboardMocks = vi.hoisted(() => ({
  getDashboardOverview: vi.fn(),
}))

vi.mock('../api/dashboard', () => ({
  getDashboardOverview: dashboardMocks.getDashboardOverview,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Dashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('Dashboard page', () => {
  it('渲染欢迎语、聚合统计、近期查询和快捷操作', async () => {
    navigateMock.mockReset()
    dashboardMocks.getDashboardOverview.mockResolvedValue({
      stats: {
        datasource_total: 5,
        dataset_total: 12,
        semantic_model_total: 12,
        today_query_count: 3,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: 2,
        dataset_week_delta: 5,
        query_count_week: 18,
      },
      recent_queries: [
        {
          id: 1,
          name: 'SELECT count(*) FROM lesson_progress',
          status: 'success',
          executed_at: new Date().toISOString(),
          datasource_name: '教学 PostgreSQL',
        },
      ],
      health: {
        datasource_connectivity: 98,
        semantic_coverage: null,
        query_success_rate: 99.2,
      },
    })

    renderPage()

    expect(screen.getByRole('heading', { name: /欢迎回来/ })).toBeInTheDocument()
    expect(screen.getByText('已接入数据源')).toBeInTheDocument()
    expect(screen.getByText('今日查询')).toBeInTheDocument()
    expect(screen.getByText('语义模型')).toBeInTheDocument()
    expect(screen.getByText('AI 对话')).toBeInTheDocument()
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(await screen.findByText('12')).toBeInTheDocument()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('--')).toBeInTheDocument()
    expect(screen.getByText('未接入')).toBeInTheDocument()
    expect(screen.getByText('+2 本月')).toBeInTheDocument()
    expect(screen.getByText('+5 本周')).toBeInTheDocument()
    expect(screen.getByText('近 7 日 18')).toBeInTheDocument()
    expect(screen.getByText('近期查询')).toBeInTheDocument()
    expect(screen.getByText('数据健康')).toBeInTheDocument()
    expect(screen.getByText('98%')).toBeInTheDocument()
    expect(screen.getByText('99.2%')).toBeInTheDocument()
    expect(screen.queryByText('87%')).not.toBeInTheDocument()
    expect(screen.getByText('快捷操作')).toBeInTheDocument()
  })

  it('空指标不显示假值，且近期查询为空时展示空态', async () => {
    dashboardMocks.getDashboardOverview.mockResolvedValue({
      stats: {
        datasource_total: 0,
        dataset_total: 0,
        semantic_model_total: 0,
        today_query_count: 0,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: null,
        dataset_week_delta: null,
        query_count_week: null,
      },
      recent_queries: [],
      health: {
        datasource_connectivity: null,
        semantic_coverage: null,
        query_success_rate: null,
      },
    })

    renderPage()

    expect(await screen.findByText('最近还没有真实查询记录')).toBeInTheDocument()
    expect(screen.getAllByText('暂无趋势')).toHaveLength(3)
    expect(screen.getByText('未接入')).toBeInTheDocument()
    expect(screen.queryByText('+2 本月')).not.toBeInTheDocument()
    expect(screen.queryByText('+5 本周')).not.toBeInTheDocument()
    expect(screen.queryByText('近 7 日 18')).not.toBeInTheDocument()
  })

  it('快捷操作点击可导航', async () => {
    const user = userEvent.setup()
    navigateMock.mockReset()
    dashboardMocks.getDashboardOverview.mockResolvedValue({
      stats: {
        datasource_total: 0,
        dataset_total: 0,
        semantic_model_total: 0,
        today_query_count: 0,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: null,
        dataset_week_delta: null,
        query_count_week: null,
      },
      recent_queries: [],
      health: {
        datasource_connectivity: null,
        semantic_coverage: null,
        query_success_rate: null,
      },
    })

    renderPage()

    await user.click(screen.getByRole('button', { name: /新建查询/ }))
    expect(navigateMock).toHaveBeenCalledWith('/queries')

    await user.click(screen.getByRole('button', { name: /导入数据源/ }))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasources')

    await user.click(screen.getByRole('button', { name: /智能问数/ }))
    expect(navigateMock).toHaveBeenCalledWith('/data-chat')
  })
})
