import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import ExecutionDrawer from './ExecutionDrawer'
import ExecutionTable from './ExecutionTable'
import InstanceTable from './InstanceTable'

const appCenterComponentMocks = vi.hoisted(() => ({
  toast: vi.fn(),
  enableInstance: vi.fn(),
  disableInstance: vi.fn(),
  deleteInstance: vi.fn(),
  executeInstance: vi.fn(),
}))

vi.mock('@/components/business', () => ({
  PageDrawer: ({
    open,
    title,
    children,
    onOpenChange,
  }: {
    open: boolean
    title: string
    children: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => (open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={() => onOpenChange?.(false)}>
        关闭抽屉
      </button>
      {children}
    </div>
  ) : null),
  Badge: ({
    children,
    variant,
  }: {
    children: ReactNode
    variant?: string
  }) => <span data-variant={variant}>{children}</span>,
  Alert: ({
    children,
    variant,
  }: {
    children: ReactNode
    variant?: string
  }) => <div data-testid={`alert-${variant || 'default'}`}>{children}</div>,
  AlertDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
    className,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    className?: string
    [key: string]: unknown
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={className} {...props}>
      {children}
    </button>
  ),
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? '已启用' : '已停用'}
    </button>
  ),
  useToast: () => ({ toast: appCenterComponentMocks.toast }),
  DataTable: ({
    columns,
    data,
    density,
    pagination,
    onRow,
  }: {
    columns: Array<{
      key: string
      title: string
      dataIndex?: string
      render?: (value: unknown, record: Record<string, unknown>) => ReactNode
    }>
    data: Array<Record<string, unknown>>
    density?: string
    pagination?: { onChange?: (page: number, pageSize: number) => void; pageSize: number }
    onRow?: (record: Record<string, unknown>) => { onClick?: () => void }
  }) => (
    <div data-testid="data-table" data-density={density || 'default'}>
      {data.map((record, rowIndex) => (
        <div
          key={record.id as number}
          data-testid={`table-row-${rowIndex}`}
          onClick={() => onRow?.(record).onClick?.()}
        >
          {columns.map((column) => (
            <div key={`${String(record.id)}-${column.key}`}>
              {column.render
                ? column.render(record[(column.dataIndex || column.key) as keyof typeof record], record)
                : String(record[(column.dataIndex || column.key) as keyof typeof record] ?? '')}
            </div>
          ))}
        </div>
      ))}
      {pagination && (
        <button type="button" onClick={() => pagination.onChange?.(2, pagination.pageSize)}>
          切换分页
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: ReactNode
  }) => (open ? (
    <div data-testid="alert-dialog">
      <button type="button" onClick={() => onOpenChange?.(false)}>
        关闭对话框
      </button>
      {children}
    </div>
  ) : null),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('../../api/appCenter', async () => {
  const actual = await vi.importActual<typeof import('../../api/appCenter')>('../../api/appCenter')
  return {
    ...actual,
    enableInstance: appCenterComponentMocks.enableInstance,
    disableInstance: appCenterComponentMocks.disableInstance,
    deleteInstance: appCenterComponentMocks.deleteInstance,
    executeInstance: appCenterComponentMocks.executeInstance,
  }
})

function renderWithQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>,
  )
}

describe('AppCenter components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appCenterComponentMocks.enableInstance.mockResolvedValue({})
    appCenterComponentMocks.disableInstance.mockResolvedValue({})
    appCenterComponentMocks.deleteInstance.mockResolvedValue({})
    appCenterComponentMocks.executeInstance.mockResolvedValue({ execution_id: 321 })
  })

  it('ExecutionDrawer 渲染失败和成功详情，并支持关闭抽屉', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    const { rerender } = renderWithQueryClient(
      <ExecutionDrawer
        open
        onClose={onClose}
        execution={{
          id: 7,
          instance_id: 19,
          instance_name: '日报推送',
          app_name: 'report_push',
          trigger_type: 'event',
          status: 'failed',
          created_at: '2026-03-01T10:00:00',
          started_at: '2026-03-01T10:01:00',
          ended_at: '2026-03-01T10:01:12',
          duration_ms: 12000,
          logs: 'line 1\nline 2',
          error: 'task crashed',
        } as never}
      />,
    )

    expect(screen.getByRole('dialog', { name: '执行详情' })).toBeInTheDocument()
    expect(screen.getByText('#7')).toBeInTheDocument()
    expect(screen.getByText('日报推送')).toBeInTheDocument()
    expect(screen.getByText('report_push')).toBeInTheDocument()
    expect(screen.getByText('事件')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('12.00秒')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '执行详情' }).querySelector('pre')).toHaveTextContent(
      /line 1\s+line 2/,
    )
    expect(screen.getByText('task crashed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭抽屉' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <ExecutionDrawer
          open
          onClose={onClose}
          execution={{
            id: 8,
            instance_id: 20,
            trigger_type: 'manual',
            status: 'success',
            created_at: '2026-03-02T10:00:00',
            result: { pushed: 12 },
          } as never}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('实例 #20')).toBeInTheDocument()
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.getByText('手动')).toBeInTheDocument()
    expect(screen.getByText('成功')).toBeInTheDocument()
    expect(screen.getByText('执行结果')).toBeInTheDocument()
    expect(screen.getByText(/"pushed": 12/)).toBeInTheDocument()
  })

  it('ExecutionDrawer 在 execution 为空时不渲染', () => {
    renderWithQueryClient(<ExecutionDrawer open execution={null} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog', { name: '执行详情' })).not.toBeInTheDocument()
  })

  it('ExecutionTable 渲染记录、分页和详情交互', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const onViewDetail = vi.fn()

    renderWithQueryClient(
      <ExecutionTable
        executions={[
          {
            id: 1,
            instance_id: 10,
            instance_name: '日报任务',
            app_name: 'report_push',
            trigger_type: 'scheduled',
            status: 'pending',
            started_at: '2026-03-01T09:00:00',
            ended_at: '2026-03-01T09:00:05',
            duration_ms: 5123,
          },
          {
            id: 2,
            instance_id: 11,
            trigger_type: 'adhoc',
            status: 'queued',
          },
        ] as never}
        total={40}
        page={1}
        pageSize={20}
        onPageChange={onPageChange}
        onViewDetail={onViewDetail}
      />,
    )

    expect(screen.getByText('日报任务')).toBeInTheDocument()
    expect(screen.getByTestId('data-table')).toHaveAttribute('data-density', 'compact')
    expect(screen.getByText('定时')).toBeInTheDocument()
    expect(screen.getByText('等待中')).toBeInTheDocument()
    expect(screen.getByText('5.12s')).toBeInTheDocument()
    expect(screen.getByText('实例 #11')).toBeInTheDocument()
    expect(screen.getByText('adhoc')).toBeInTheDocument()
    expect(screen.getByText('queued')).toBeInTheDocument()

    const firstRow = screen.getByTestId('table-row-0')
    await user.click(within(firstRow).getByRole('button', { name: '查看' }))
    expect(onViewDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))

    await user.click(screen.getByRole('button', { name: '切换分页' }))
    expect(onPageChange).toHaveBeenCalledWith(2, 20)

    await user.click(screen.getByTestId('table-row-1'))
    expect(onViewDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  })

  it('InstanceTable 支持启停、执行、编辑和删除实例', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    renderWithQueryClient(
      <InstanceTable
        instances={[
          {
            id: 101,
            name: '日报分发',
            description: '给班主任推日报',
            app_name: 'report_push',
            schedule_type: 'cron',
            next_execution_at: '2026-03-03T08:30:00',
            success_rate: 92.4,
            enabled: true,
          },
        ] as never}
        total={1}
        page={1}
        pageSize={20}
        onEdit={onEdit}
      />,
    )

    const row = screen.getByTestId('table-row-0')
    expect(within(row).getByText('日报分发')).toBeInTheDocument()
    expect(within(row).getByText('给班主任推日报')).toBeInTheDocument()
    expect(within(row).getByText('定时')).toBeInTheDocument()
    expect(within(row).getByText('92.4%')).toBeInTheDocument()

    await user.click(within(row).getByRole('switch'))
    await waitFor(() => {
      expect(appCenterComponentMocks.disableInstance).toHaveBeenCalledWith(101)
      expect(appCenterComponentMocks.toast).toHaveBeenCalledWith({ title: '操作成功', variant: 'default' })
    })

    await user.click(within(row).getByRole('button', { name: '执行' }))
    await waitFor(() => {
      expect(appCenterComponentMocks.executeInstance).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ client: expect.any(QueryClient) }),
      )
      expect(appCenterComponentMocks.toast).toHaveBeenCalledWith({
        title: '执行已提交',
        description: '执行ID: 321',
      })
    })

    await user.click(within(row).getByRole('button', { name: '编辑' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }))

    await user.click(within(row).getByRole('button', { name: '删除' }))
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument()
    expect(screen.getByText('删除后无法恢复，确定要删除实例 "日报分发" 吗？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确定' }))

    await waitFor(() => {
      expect(appCenterComponentMocks.deleteInstance).toHaveBeenCalledWith(
        101,
        expect.objectContaining({ client: expect.any(QueryClient) }),
      )
      expect(appCenterComponentMocks.toast).toHaveBeenCalledWith({ title: '删除成功' })
    })
  })

  it('InstanceTable 在错误分支下展示 destructive 提示，并处理回退显示', async () => {
    const user = userEvent.setup()
    appCenterComponentMocks.enableInstance.mockRejectedValueOnce({
      response: { data: { message: 'enable denied' } },
    })
    appCenterComponentMocks.executeInstance.mockRejectedValueOnce({
      response: { data: { message: 'run failed' } },
    })
    appCenterComponentMocks.deleteInstance.mockRejectedValueOnce({
      response: { data: { message: 'delete blocked' } },
    })

    renderWithQueryClient(
      <InstanceTable
        instances={[
          {
            id: 202,
            name: '事件分发',
            app_name: 'data_agent',
            schedule_type: 'adhoc',
            success_rate: 10,
            enabled: false,
          },
        ] as never}
      />,
    )

    const row = screen.getByTestId('table-row-0')
    expect(within(row).getByText('adhoc')).toBeInTheDocument()
    expect(within(row).getByText('-')).toBeInTheDocument()

    await user.click(within(row).getByRole('switch'))
    await waitFor(() => {
      expect(appCenterComponentMocks.enableInstance).toHaveBeenCalledWith(202)
      expect(appCenterComponentMocks.toast).toHaveBeenCalledWith({
        title: '操作失败',
        description: '无权限启停该实例，请联系应用管理员或检查当前账号权限。',
        variant: 'destructive',
      })
    })

    await user.click(within(row).getByRole('button', { name: '执行' }))
    expect(appCenterComponentMocks.executeInstance).not.toHaveBeenCalled()

    await user.click(within(row).getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '确定' }))
    await waitFor(() => {
      expect(appCenterComponentMocks.deleteInstance).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ client: expect.any(QueryClient) }),
      )
      expect(appCenterComponentMocks.toast).toHaveBeenCalledWith({
        title: '删除失败',
        description: 'delete blocked',
        variant: 'destructive',
      })
    })
  })
})
