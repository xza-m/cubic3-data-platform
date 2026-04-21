import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExtractionTasks from './ExtractionTasks'

const extractionTaskMocks = vi.hoisted(() => ({
  getTasks: vi.fn(),
  executeTask: vi.fn(),
  deleteTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  getDatasets: vi.fn(),
  getDataset: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('../api/extraction', () => ({
  getTasks: extractionTaskMocks.getTasks,
  executeTask: extractionTaskMocks.executeTask,
  deleteTask: extractionTaskMocks.deleteTask,
  createTask: extractionTaskMocks.createTask,
  updateTask: extractionTaskMocks.updateTask,
}))

vi.mock('../api/datasets', () => ({
  getDatasets: extractionTaskMocks.getDatasets,
  getDataset: extractionTaskMocks.getDataset,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => extractionTaskMocks.navigate,
  }
})

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    title,
    type = 'button',
    className,
  }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    title?: string
    type?: 'button' | 'submit' | 'reset'
    className?: string
  }) => (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={className}
    >
      {children}
    </button>
  ),
  FormInput: ({
    value,
    onChange,
    placeholder,
    type = 'text',
    className,
    min,
    max,
  }: {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
    type?: string
    className?: string
    min?: number
    max?: number
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      className={className}
      min={min}
      max={max}
    />
  ),
  FormSelect: ({
    value,
    onValueChange,
    options,
    placeholder,
  }: {
    value?: string
    onValueChange: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      aria-label={placeholder || 'select'}
      value={value || ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  PageModal: ({
    open,
    title,
    footer,
    children,
  }: {
    open: boolean
    title: string
    footer?: ReactNode
    children: ReactNode
  }) => (open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null),
  useToast: () => ({ toast: extractionTaskMocks.toast }),
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    className,
  }: {
    children: ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    id?: string
  }) => (
    <input
      id={id}
      aria-label={id || 'checkbox'}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

const taskFixtures = [
  {
    id: 11,
    task_name: '日报同步任务',
    task_type: 'scheduled',
    is_active: true,
    last_run_at: '2026-03-26T09:00:00.000Z',
    row_limit: 1000,
  },
  {
    id: 12,
    task_name: '手动补数任务',
    task_type: 'manual',
    is_active: false,
    last_run_at: null,
    row_limit: 500,
  },
]

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter initialEntries={['/extraction/tasks']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/extraction/tasks" element={<ExtractionTasks />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ExtractionTasks page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    extractionTaskMocks.getTasks.mockResolvedValue({
      data: {
        items: taskFixtures,
        total: taskFixtures.length,
      },
    })
    extractionTaskMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          { id: 1, dataset_name: '答题汇总', dataset_code: 'answer_summary' },
        ],
      },
    })
    extractionTaskMocks.executeTask.mockResolvedValue({ data: { run_id: 99, status: 'queued' } })
    extractionTaskMocks.updateTask.mockResolvedValue({ data: { id: 11 } })
    extractionTaskMocks.deleteTask.mockResolvedValue({})
  })

  it('展示任务概览、支持搜索，并可跳转到新建任务与执行历史', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByRole('heading', { name: '数据提取' })).toBeInTheDocument()
    expect(await screen.findByText('日报同步任务')).toBeInTheDocument()
    expect(extractionTaskMocks.getTasks).toHaveBeenCalledWith({ page: 1, page_size: 100 })
    expect(extractionTaskMocks.getDatasets).toHaveBeenCalledWith({ page: 1, page_size: 100 })
    expect(screen.getByText('手动补数任务')).toBeInTheDocument()
    expect(screen.getByText('总任务数')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText('搜索任务名称...'), '日报')
    expect(screen.getByText('日报同步任务')).toBeInTheDocument()
    expect(screen.queryByText('手动补数任务')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新建任务' }))
    expect(extractionTaskMocks.navigate).toHaveBeenCalledWith('/extraction/config')

    extractionTaskMocks.navigate.mockClear()
    const firstRow = screen.getByText('日报同步任务').closest('tr')
    expect(firstRow).not.toBeNull()
    await user.click(within(firstRow as HTMLElement).getByTitle('执行历史'))
    expect(extractionTaskMocks.navigate).toHaveBeenCalledWith('/extraction/runs?task_id=11')
  })

  it('支持执行任务并给出成功提示', async () => {
    const user = userEvent.setup()

    renderPage()

    const firstRow = (await screen.findByText('日报同步任务')).closest('tr')
    expect(firstRow).not.toBeNull()
    await user.click(within(firstRow as HTMLElement).getByTitle('执行'))

    await waitFor(() => {
      expect(extractionTaskMocks.executeTask).toHaveBeenCalledWith(11)
      expect(extractionTaskMocks.toast).toHaveBeenCalledWith({ title: '任务已提交执行' })
    })
  })

  it('支持编辑任务并删除任务', async () => {
    const user = userEvent.setup()

    renderPage()

    const row = (await screen.findByText('日报同步任务')).closest('tr')
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByTitle('编辑'))

    const dialog = screen.getByRole('dialog', { name: '编辑任务' })
    const [nameInput] = within(dialog).getAllByPlaceholderText('请输入任务名称')
    const rowLimitInput = within(dialog).getByPlaceholderText('请输入限制行数')
    const enabledCheckbox = within(dialog).getByLabelText('is-active')

    await user.clear(nameInput)
    await user.type(nameInput, '日报同步任务-更新版')
    await user.clear(rowLimitInput)
    await user.type(rowLimitInput, '1500')
    await user.click(enabledCheckbox)
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(extractionTaskMocks.updateTask).toHaveBeenCalledWith(11, {
        task_name: '日报同步任务-更新版',
        row_limit: 1500,
        is_active: false,
      })
      expect(extractionTaskMocks.toast).toHaveBeenCalledWith({ title: '任务更新成功' })
    })

    extractionTaskMocks.toast.mockClear()
    const taskRow = screen.getByText('日报同步任务').closest('tr')
    expect(taskRow).not.toBeNull()
    const rowButtons = within(taskRow as HTMLElement).getAllByRole('button')
    await user.click(rowButtons[rowButtons.length - 1])

    await waitFor(() => {
      expect(extractionTaskMocks.deleteTask.mock.calls[0]?.[0]).toBe(11)
      expect(extractionTaskMocks.toast).toHaveBeenCalledWith({ title: '删除成功' })
    })
  })
})
