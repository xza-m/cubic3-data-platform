import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('近期查询超过一天后按真实天数显示，不再一律显示昨天', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    dashboardMocks.getDashboardOverview.mockResolvedValue({
      stats: {
        datasource_total: 1,
        dataset_total: 1,
        semantic_model_total: 1,
        today_query_count: 0,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: null,
        dataset_week_delta: null,
        query_count_week: null,
      },
      recent_queries: [
        {
          id: 42,
          name: 'SELECT * FROM orders',
          status: 'success',
          executed_at: threeDaysAgo,
          datasource_name: '订单 PostgreSQL',
        },
      ],
      health: {
        datasource_connectivity: null,
        semantic_coverage: null,
        query_success_rate: null,
      },
    })

    renderPage()

    expect(await screen.findByText('3 天前')).toBeInTheDocument()
    expect(screen.queryByText('昨天')).not.toBeInTheDocument()
  })

  it('对 null、0、空列表按 overview 单源语义渲染', async () => {
    dashboardMocks.getDashboardOverview.mockResolvedValue({
      stats: {
        datasource_total: null,
        dataset_total: 0,
        semantic_model_total: 0,
        today_query_count: 0,
        ai_chat_count: null,
      },
      trends: {
        datasource_month_delta: null,
        dataset_week_delta: 0,
        query_count_week: null,
      },
      recent_queries: [],
      health: {
        datasource_connectivity: null,
        semantic_coverage: 0,
        query_success_rate: null,
      },
    })

    renderPage()

    expect(await screen.findByText('0%')).toBeInTheDocument()
    expect(screen.getByText('暂无查询记录')).toBeInTheDocument()
    expect(screen.getByText('当前统计周期内没有查询历史。')).toBeInTheDocument()
    expect(screen.getAllByText('暂无趋势')).toHaveLength(1)
    expect(screen.getByText('语义模型').parentElement?.textContent).toContain('0 本周')
    expect(screen.getByText('近 7 日暂无数据')).toBeInTheDocument()
    expect(screen.queryByText('暂无健康指标')).not.toBeInTheDocument()
    expect(screen.queryByText('至少需要后端返回一个非 null 指标后才会展示健康概览。')).not.toBeInTheDocument()
  })

  it('overview 失败时不再混算其他业务接口数据', async () => {
    dashboardMocks.getDashboardOverview.mockRejectedValue(new Error('dashboard overview failed'))

    renderPage()

    expect(await screen.findByText('工作台概览暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('请稍后刷新，当前页面不会再改用其他业务接口混算统计口径。')).toBeInTheDocument()
    expect(screen.queryByText('SELECT * FROM orders')).not.toBeInTheDocument()
    expect(screen.queryByText('60%')).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: /打开查询工作台/ }))
    expect(navigateMock).toHaveBeenCalledWith('/queries')

    await user.click(screen.getByRole('button', { name: /打开语义工作台/ }))
    expect(navigateMock).toHaveBeenCalledWith('/semantic/workbench')

    await user.click(screen.getByRole('button', { name: /导入数据源/ }))
    expect(navigateMock).toHaveBeenCalledWith('/data-center/datasources')

    await user.click(screen.getByRole('button', { name: /智能问数/ }))
    expect(navigateMock).toHaveBeenCalledWith('/data-chat')
  })
})
