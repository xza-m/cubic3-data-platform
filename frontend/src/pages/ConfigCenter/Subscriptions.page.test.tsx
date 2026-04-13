import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Subscriptions from './Subscriptions'

const subscriptionPageMocks = vi.hoisted(() => ({
  getSubscriptions: vi.fn(),
  deleteSubscription: vi.fn(),
  toggleSubscription: vi.fn(),
  getChannels: vi.fn(),
  getInstances: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/subscriptions', () => ({
  getSubscriptions: subscriptionPageMocks.getSubscriptions,
  deleteSubscription: subscriptionPageMocks.deleteSubscription,
  toggleSubscription: subscriptionPageMocks.toggleSubscription,
}))

vi.mock('../../api/channels', () => ({
  getChannels: subscriptionPageMocks.getChannels,
}))

vi.mock('../../api/appCenter', () => ({
  getInstances: subscriptionPageMocks.getInstances,
}))

vi.mock('./SubscriptionForm', () => ({
  default: ({
    open,
    subscription,
    onClose,
    onSuccess,
  }: {
    open: boolean
    subscription: { name: string } | null
    onClose: () => void
    onSuccess: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="订阅表单">
        <p>{subscription ? `编辑 ${subscription.name}` : '创建订阅'}</p>
        <button type="button" onClick={onSuccess}>
          提交表单
        </button>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/business', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    FormButton: ({
      children,
      onClick,
      disabled,
      loading,
      icon,
    }: {
      children?: ReactNode
      onClick?: () => void
      disabled?: boolean
      loading?: boolean
      icon?: ReactNode
    }) => (
      <button type="button" onClick={onClick} disabled={disabled || loading}>
        {loading ? '加载中' : icon}
        {children}
      </button>
    ),
    DataTable: ({
      columns,
      data,
    }: {
      columns: Array<{
        id?: string
        header?: ReactNode
        accessorKey?: string
        cell?: (payload: {
          row: {
            original: Record<string, unknown>
            getValue: (key: string) => unknown
          }
        }) => ReactNode
      }>
      data: Array<Record<string, unknown>>
    }) => (
      <div data-testid="subscriptions-table">
        {data.map((row) => (
          <div key={String(row.id)} data-testid={`subscription-row-${row.id}`}>
            {columns.map((column, index) => {
              const rowApi = {
                original: row,
                getValue: (key: string) => row[key],
              }
              const content = column.cell ? column.cell({ row: rowApi }) : row[column.accessorKey ?? '']
              return (
                <div key={`${String(row.id)}-${column.id ?? column.accessorKey ?? index}`}>
                  <span>{column.header}</span>
                  <div>{content as ReactNode}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    ),
    useToast: () => ({ toast: subscriptionPageMocks.toast }),
  }
})

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
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
        <Subscriptions />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '日报推送',
    app_instance_id: 101,
    channel_id: 11,
    event_types: ['app.execution.completed'],
    event_filter: { event_types: ['app.execution.completed'] },
    enabled: true,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-02T10:00:00Z',
    app_instance: {
      id: 101,
      name: '日报实例',
      app_code: 'daily-report',
      app_name: '日报应用',
    },
    channel: {
      id: 11,
      name: '飞书群',
      channel_type: 'feishu',
    },
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Subscriptions page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriptionPageMocks.getSubscriptions.mockResolvedValue({
      data: {
        items: [
          makeSubscription(),
          makeSubscription({
            id: 2,
            name: '失败告警',
            app_instance_id: 202,
            channel_id: 12,
            enabled: false,
            event_types: ['app.execution.failed', 'app.instance.disabled'],
            event_filter: { event_types: ['app.execution.failed', 'app.instance.disabled'] },
            app_instance: {
              id: 202,
              name: '数据助手实例',
              app_code: 'data-agent',
              app_name: '数据助手',
            },
            channel: {
              id: 12,
              name: 'Webhook 渠道',
              channel_type: 'webhook',
            },
          }),
        ],
      },
    })
    subscriptionPageMocks.getChannels.mockResolvedValue({
      data: {
        items: [
          { id: 11, name: '飞书群', channel_type: 'feishu' },
          { id: 12, name: 'Webhook 渠道', channel_type: 'webhook' },
        ],
      },
    })
    subscriptionPageMocks.getInstances.mockResolvedValue({
      items: [
        { id: 101, name: '日报实例', app_code: 'daily-report' },
        { id: 202, name: '数据助手实例', app_code: 'data-agent' },
      ],
    })
    subscriptionPageMocks.deleteSubscription.mockResolvedValue(undefined)
    subscriptionPageMocks.toggleSubscription.mockResolvedValue(undefined)
  })

  it('展示列表并支持应用筛选、渠道筛选、刷新和状态切换', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('订阅管理')).toBeInTheDocument()
    expect(await screen.findByText('日报推送')).toBeInTheDocument()
    expect(screen.getByText('失败告警')).toBeInTheDocument()
    expect(screen.getByText('日报应用')).toBeInTheDocument()
    expect(await screen.findAllByText('飞书群')).toHaveLength(2)
    expect(screen.getByText('应用执行完成')).toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], '101')
    expect(screen.getByText('日报推送')).toBeInTheDocument()
    expect(screen.queryByText('失败告警')).not.toBeInTheDocument()

    await user.selectOptions(selects[0], '')
    await user.selectOptions(selects[1], '12')
    expect(screen.getByText('失败告警')).toBeInTheDocument()
    expect(screen.queryByText('日报推送')).not.toBeInTheDocument()

    await user.selectOptions(selects[1], '')
    const firstRow = await screen.findByTestId('subscription-row-1')
    await user.click(within(firstRow).getByRole('button', { name: '启用' }))
    await waitFor(() => {
      expect(subscriptionPageMocks.toggleSubscription).toHaveBeenCalledWith(1, false)
    })
    expect(subscriptionPageMocks.toast).toHaveBeenCalledWith({ title: '状态更新成功' })

    const refreshDeferred = createDeferred<{
      data: {
        items: Array<Record<string, unknown>>
      }
    }>()
    subscriptionPageMocks.getSubscriptions.mockClear()
    subscriptionPageMocks.getSubscriptions.mockReturnValueOnce(refreshDeferred.promise)

    const refreshButton = screen.getByRole('button', { name: '刷新' })
    await user.click(refreshButton)
    await waitFor(() => {
      expect(subscriptionPageMocks.getSubscriptions).toHaveBeenCalledTimes(1)
    })
    expect(refreshButton).toBeDisabled()

    refreshDeferred.resolve({
      data: {
        items: [
          makeSubscription(),
          makeSubscription({
            id: 2,
            name: '失败告警',
            app_instance_id: 202,
            channel_id: 12,
            enabled: false,
            event_types: ['app.execution.failed', 'app.instance.disabled'],
            event_filter: { event_types: ['app.execution.failed', 'app.instance.disabled'] },
            app_instance: {
              id: 202,
              name: '数据助手实例',
              app_code: 'data-agent',
              app_name: '数据助手',
            },
            channel: {
              id: 12,
              name: 'Webhook 渠道',
              channel_type: 'webhook',
            },
          }),
        ],
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刷新' })).not.toBeDisabled()
    })
    expect(subscriptionPageMocks.toast).toHaveBeenCalledWith({ title: '订阅列表已刷新' })
  })

  it('支持创建与编辑订阅', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '新建' }))
    expect(screen.getByRole('dialog', { name: '订阅表单' })).toHaveTextContent('创建订阅')
    await user.click(screen.getByRole('button', { name: '提交表单' }))
    await waitFor(() => {
      expect(subscriptionPageMocks.getSubscriptions).toHaveBeenCalledTimes(2)
    })

    const firstRow = await screen.findByTestId('subscription-row-1')
    const rowButtons = within(firstRow).getAllByRole('button')
    await user.click(rowButtons[rowButtons.length - 2])
    expect(screen.getByRole('dialog', { name: '订阅表单' })).toHaveTextContent('编辑 日报推送')
  })

  it('支持删除并展示匹配为空与默认空态', async () => {
    const user = userEvent.setup()

    const page = renderPage()

    const secondRow = await screen.findByTestId('subscription-row-2')
    const rowButtons = within(secondRow).getAllByRole('button')
    await user.click(rowButtons[rowButtons.length - 1])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('失败告警')

    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(subscriptionPageMocks.deleteSubscription.mock.calls[0]?.[0]).toBe(2)
    })
    expect(subscriptionPageMocks.toast).toHaveBeenCalledWith({ title: '订阅已删除' })

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], '101')
    await user.selectOptions(selects[1], '12')
    expect(screen.getByText('未找到匹配的订阅')).toBeInTheDocument()

    subscriptionPageMocks.getSubscriptions.mockResolvedValueOnce({ data: { items: [] } })
    page.unmount()
    renderPage()
    const emptyTitle = await screen.findByText('还没有订阅')
    expect(emptyTitle).toBeInTheDocument()
    const emptyState = emptyTitle.closest('div')
    expect(emptyState).not.toBeNull()
    expect(within(emptyState as HTMLElement).getByRole('button', { name: '新建' })).toBeInTheDocument()
  })
})
