import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ScheduledQueries from './ScheduledQueries'

const scheduledQueryMocks = vi.hoisted(() => ({
  getTasks: vi.fn(),
  executeTask: vi.fn(),
  updateTask: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/extraction', () => ({
  getTasks: scheduledQueryMocks.getTasks,
  executeTask: scheduledQueryMocks.executeTask,
  updateTask: scheduledQueryMocks.updateTask,
}))

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    type = 'button',
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type} onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  useToast: () => ({ toast: scheduledQueryMocks.toast }),
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={['/queries/scheduled']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/queries/scheduled" element={<ScheduledQueries />} />
          <Route path="/extraction/config" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ScheduledQueries page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scheduledQueryMocks.getTasks.mockResolvedValue({
      data: {
        items: [
          {
            id: 21,
            task_name: '按天同步课堂进度',
            task_type: 'scheduled',
            dataset_id: 9,
            dataset_name: '课堂进度',
            is_active: true,
            row_limit: 1000,
            last_run_status: 'success',
          },
        ],
      },
    })
    scheduledQueryMocks.executeTask.mockResolvedValue({ data: { status: 'queued' } })
    scheduledQueryMocks.updateTask.mockResolvedValue({ data: { id: 21 } })
  })

  it('展示独立定时查询工作区，并可跳转到带 taskType 的新建配置页', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('定时查询')).toBeInTheDocument()
    expect(scheduledQueryMocks.getTasks).toHaveBeenCalledWith({
      page: 1,
      page_size: 100,
      task_type: 'scheduled',
    })
    expect(await screen.findByText('按天同步课堂进度')).toBeInTheDocument()
    expect(screen.getByText(/数据集：课堂进度/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建定时查询' }))

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/extraction/config?taskType=scheduled')
  })

  it('支持立即执行和启停调度', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('按天同步课堂进度')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '立即执行' }))
    await waitFor(() => {
      expect(scheduledQueryMocks.executeTask).toHaveBeenCalledWith(21)
    })

    await user.click(screen.getByRole('button', { name: '停用调度' }))
    await waitFor(() => {
      expect(scheduledQueryMocks.updateTask).toHaveBeenCalledWith(21, { is_active: false })
    })
  })
})
