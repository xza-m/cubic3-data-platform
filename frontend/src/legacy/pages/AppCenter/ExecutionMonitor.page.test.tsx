import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExecutionMonitor from './ExecutionMonitor'

const executionMonitorMocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  getExecutions: vi.fn(),
  getExecutionStats: vi.fn(),
}))

vi.mock('../../api/appCenter', () => ({
  getApps: executionMonitorMocks.getApps,
  getExecutions: executionMonitorMocks.getExecutions,
  getExecutionStats: executionMonitorMocks.getExecutionStats,
}))

vi.mock('@/components/business', async () => {
  const actual = await vi.importActual<typeof import('@/components/business')>('@/components/business')
  return {
    ...actual,
    FormRangeDatePicker: ({
      placeholder,
      onChange,
    }: {
      placeholder?: string
      onChange?: (range: { from: Date; to: Date }) => void
    }) => (
      <button
        type="button"
        onClick={() => onChange?.({ from: new Date('2026-03-01'), to: new Date('2026-03-03') })}
      >
        {placeholder || '选择日期范围'}
      </button>
    ),
  }
})

vi.mock('../../components/AppCenter/ExecutionTable', () => ({
  default: ({
    executions,
    onViewDetail,
    onPageChange,
  }: {
    executions: Array<{ id: number; instance_name: string }>
    onViewDetail?: (execution: { id: number; instance_name: string }) => void
    onPageChange?: (page: number, pageSize: number) => void
  }) => (
    <div>
      <div>执行记录数：{executions.length}</div>
      {executions.map((execution) => (
        <button key={execution.id} type="button" onClick={() => onViewDetail?.(execution)}>
          查看 {execution.instance_name}
        </button>
      ))}
      <button type="button" onClick={() => onPageChange?.(2, 50)}>
        下一页
      </button>
    </div>
  ),
}))

vi.mock('../../components/AppCenter/ExecutionDrawer', () => ({
  default: ({
    open,
    execution,
    onClose,
  }: {
    open: boolean
    execution: { id: number; instance_name: string } | null
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="执行详情抽屉">
        <p>执行详情 #{execution?.id}</p>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    ) : null,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ExecutionMonitor />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ExecutionMonitor page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executionMonitorMocks.getApps.mockResolvedValue([
      { code: 'daily-report', name: '日报应用' },
      { code: 'data-agent', name: '数据助手' },
    ])
    executionMonitorMocks.getExecutions.mockImplementation(async (params?: { status?: string }) => ({
      items: params?.status === 'failed' ? [{ id: 2, instance_name: '失败任务' }] : [{ id: 1, instance_name: '日报任务' }],
      total: 1,
    }))
    executionMonitorMocks.getExecutionStats.mockResolvedValue({
      total_executions: 12,
      success_count: 10,
      failed_count: 2,
      avg_duration_ms: 2500,
    })
  })

  it('展示统计卡片和执行列表，并支持查看详情', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('应用执行监控')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('2.50s')).toBeInTheDocument()
      expect(screen.getByText('执行记录数：1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '查看 日报任务' }))
    expect(screen.getByRole('dialog', { name: '执行详情抽屉' })).toBeInTheDocument()
    expect(screen.getByText('执行详情 #1')).toBeInTheDocument()
  })

  it('切换执行状态筛选后会重新拉取数据', async () => {
    const user = userEvent.setup()

    renderPage()

    const statusSelect = await screen.findByDisplayValue('筛选执行状态')
    await user.selectOptions(statusSelect, 'failed')

    await waitFor(() => {
      expect(executionMonitorMocks.getExecutions).toHaveBeenLastCalledWith({
        status: 'failed',
        app_code: undefined,
        start_date: undefined,
        end_date: undefined,
        page: 1,
        page_size: 10,
      })
    })
    expect(screen.getByText('执行记录数：1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看 失败任务' })).toBeInTheDocument()
  })

  it('支持按应用筛选、翻页并关闭详情抽屉', async () => {
    const user = userEvent.setup()

    renderPage()

    await screen.findByRole('option', { name: '日报应用' })
    const appSelect = await screen.findByDisplayValue('筛选应用类型')
    await user.selectOptions(appSelect, 'daily-report')
    await waitFor(() => {
      expect(executionMonitorMocks.getExecutions).toHaveBeenLastCalledWith({
        app_code: 'daily-report',
        status: undefined,
        start_date: undefined,
        end_date: undefined,
        page: 1,
        page_size: 10,
      })
    })

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(executionMonitorMocks.getExecutions).toHaveBeenLastCalledWith({
        app_code: 'daily-report',
        status: undefined,
        start_date: undefined,
        end_date: undefined,
        page: 2,
        page_size: 50,
      })
    })

    await user.click(screen.getByRole('button', { name: '查看 日报任务' }))
    expect(screen.getByRole('dialog', { name: '执行详情抽屉' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog', { name: '执行详情抽屉' })).not.toBeInTheDocument()
  })

  it('支持按日期范围筛选执行记录', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '选择日期范围' }))

    await waitFor(() => {
      expect(executionMonitorMocks.getExecutions).toHaveBeenLastCalledWith({
        app_code: undefined,
        status: undefined,
        start_date: '2026-03-01',
        end_date: '2026-03-03',
        page: 1,
        page_size: 10,
      })
    })
  })
})
