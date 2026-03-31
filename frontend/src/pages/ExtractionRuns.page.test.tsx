import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExtractionRuns from './ExtractionRuns'

const extractionRunMocks = vi.hoisted(() => ({
  getRuns: vi.fn(),
  downloadRun: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../api/extraction', () => ({
  getRuns: extractionRunMocks.getRuns,
  downloadRun: extractionRunMocks.downloadRun,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => extractionRunMocks.navigate,
  }
})

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    title,
    className,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    title?: string
    className?: string
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={className}>
      {children}
    </button>
  ),
  PageModal: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title: string
    children: ReactNode
  }) => (open ? <div role="dialog" aria-label={title}>{children}</div> : null),
  useToast: () => ({ toast: extractionRunMocks.toast }),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

const runFixture = {
  id: 31,
  task_id: 7,
  status: 'success',
  start_time: '2026-03-26T09:00:00.000Z',
  row_count: 256,
  result_size_mb: 1.25,
  delivery_method: 'local',
  duration_ms: 1520,
  generated_sql: 'select * from answer_summary',
  error_message: '',
  delivery_info: { file: 'answer_summary.csv' },
}

function renderPage(initialEntry = '/extraction/runs?task_id=7') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/extraction/runs" element={<ExtractionRuns />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ExtractionRuns page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    extractionRunMocks.getRuns.mockResolvedValue({
      data: {
        items: [runFixture],
        total: 25,
      },
    })
  })

  it('展示执行历史、支持详情查看和下载', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('执行历史')).toBeInTheDocument()
    expect(extractionRunMocks.getRuns).toHaveBeenCalledWith({
      task_id: 7,
      page: 1,
      page_size: 20,
    })
    expect(await screen.findByText('本地下载')).toBeInTheDocument()
    expect(screen.getByText('1.25MB')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '详情' }))
    expect(screen.getByRole('dialog', { name: '执行详情' })).toBeInTheDocument()
    expect(screen.getByText('select * from answer_summary')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下载' }))
    expect(extractionRunMocks.downloadRun).toHaveBeenCalledWith(31)
    expect(extractionRunMocks.toast).toHaveBeenCalledWith({ title: '开始下载文件' })
  })

  it('支持空态和返回任务列表', async () => {
    const user = userEvent.setup()
    extractionRunMocks.getRuns.mockResolvedValueOnce({
      data: {
        items: [],
        total: 0,
      },
    })

    renderPage('/extraction/runs')

    expect(await screen.findByText('暂无执行记录')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button')[0])
    expect(extractionRunMocks.navigate).toHaveBeenCalledWith('/extraction-tasks')
  })

  it('不支持下载时给出提示，并支持翻页', async () => {
    const user = userEvent.setup()
    extractionRunMocks.getRuns
      .mockResolvedValueOnce({
        data: {
          items: [{ ...runFixture, status: 'failed', delivery_method: 'feishu', error_message: '推送失败' }],
          total: 40,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [runFixture],
          total: 40,
        },
      })

    renderPage()

    expect(await screen.findByText('失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '详情' }))
    expect(screen.getByText('推送失败')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => {
      expect(extractionRunMocks.getRuns).toHaveBeenLastCalledWith({
        task_id: 7,
        page: 2,
        page_size: 20,
      })
    })

    extractionRunMocks.toast.mockClear()
    renderPage('/extraction/runs')
    expect(await screen.findByText('成功')).toBeInTheDocument()
    extractionRunMocks.toast.mockClear()
    extractionRunMocks.downloadRun.mockClear()
  })
})
