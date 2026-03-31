import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import Channels from './Channels'

const channelPageMocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  deleteChannel: vi.fn(),
  toggleChannel: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/channels', () => ({
  getChannels: channelPageMocks.getChannels,
  deleteChannel: channelPageMocks.deleteChannel,
  toggleChannel: channelPageMocks.toggleChannel,
}))

vi.mock('./ChannelForm', () => ({
  default: ({
    open,
    channel,
    onClose,
    onSuccess,
  }: {
    open: boolean
    channel: { name: string } | null
    onClose: () => void
    onSuccess: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label="渠道表单">
        <p>{channel ? `编辑 ${channel.name}` : '创建渠道'}</p>
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
    DataTable: ({
      columns,
      data,
    }: {
      columns: Array<{
        key?: string
        title?: ReactNode
        dataIndex?: string
        render?: (value: unknown, record: Record<string, unknown>) => ReactNode
      }>
      data: Array<Record<string, unknown>>
    }) => (
      <div data-testid="channels-table">
        {data.map((row) => (
          <div key={String(row.id)} data-testid={`channel-row-${row.id}`}>
            {columns.map((column, index) => {
              const value = column.dataIndex ? row[column.dataIndex] : undefined
              const content = column.render ? column.render(value, row) : value
              return (
                <div key={`${String(row.id)}-${column.key ?? index}`}>
                  <span>{column.title}</span>
                  <div>{content as ReactNode}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    ),
    FormButton: ({
      children,
      onClick,
      disabled,
    }: {
      children?: ReactNode
      onClick?: () => void
      disabled?: boolean
    }) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    useToast: () => ({ toast: channelPageMocks.toast }),
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean
    children: ReactNode
  }) => (open ? <div role="alertdialog">{children}</div> : null),
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Channels />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '飞书告警群',
    channel_type: 'feishu',
    config: { chat_id: 'oc_xxx' },
    enabled: true,
    created_at: '2026-03-01T08:00:00Z',
    updated_at: '2026-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('Channels page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    channelPageMocks.getChannels.mockResolvedValue({
      data: {
        items: [
          makeChannel(),
          makeChannel({
            id: 2,
            name: 'Webhook 回调',
            channel_type: 'webhook',
            config: { url: 'https://example.com/webhook' },
            enabled: false,
          }),
        ],
      },
    })
    channelPageMocks.deleteChannel.mockResolvedValue(undefined)
    channelPageMocks.toggleChannel.mockResolvedValue(undefined)
  })

  it('展示列表并支持搜索、类型筛选、刷新和状态切换', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('渠道管理')).toBeInTheDocument()
    expect(await screen.findByText('飞书告警群')).toBeInTheDocument()
    expect(screen.getByText('Webhook 回调')).toBeInTheDocument()
    expect((await screen.findAllByText('飞书群')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText('Webhook')).length).toBeGreaterThan(0)

    const searchInput = screen.getByPlaceholderText('搜索渠道名称')
    await user.type(searchInput, 'Webhook')
    expect(screen.getByText('Webhook 回调')).toBeInTheDocument()
    expect(screen.queryByText('飞书告警群')).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.selectOptions(screen.getByRole('combobox'), 'feishu')
    expect(screen.getByText('飞书告警群')).toBeInTheDocument()
    expect(screen.queryByText('Webhook 回调')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox'), '')
    const firstRow = await screen.findByTestId('channel-row-1')
    await user.click(within(firstRow).getByRole('button', { name: '启用' }))
    await waitFor(() => {
      expect(channelPageMocks.toggleChannel).toHaveBeenCalledWith(1, false)
    })

    channelPageMocks.getChannels.mockClear()
    await user.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => {
      expect(channelPageMocks.getChannels).toHaveBeenCalledTimes(1)
    })
  })

  it('支持创建和编辑渠道', async () => {
    const user = userEvent.setup()

    renderPage()

    await user.click(await screen.findByRole('button', { name: '创建渠道' }))
    expect(screen.getByRole('dialog', { name: '渠道表单' })).toHaveTextContent('创建渠道')
    await user.click(screen.getByRole('button', { name: '提交表单' }))
    await waitFor(() => {
      expect(channelPageMocks.getChannels).toHaveBeenCalledTimes(2)
    })

    const firstRow = await screen.findByTestId('channel-row-1')
    const rowButtons = within(firstRow).getAllByRole('button')
    await user.click(rowButtons[rowButtons.length - 2])
    expect(screen.getByRole('dialog', { name: '渠道表单' })).toHaveTextContent('编辑 飞书告警群')
  })

  it('支持删除并展示匹配为空与默认空态', async () => {
    const user = userEvent.setup()

    const page = renderPage()

    const secondRow = await screen.findByTestId('channel-row-2')
    const rowButtons = within(secondRow).getAllByRole('button')
    await user.click(rowButtons[rowButtons.length - 1])
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Webhook 回调')

    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(channelPageMocks.deleteChannel.mock.calls[0]?.[0]).toBe(2)
    })
    expect(channelPageMocks.toast).toHaveBeenCalledWith({ title: '渠道已删除' })

    await user.type(screen.getByPlaceholderText('搜索渠道名称'), '不存在')
    expect(screen.getByText('未找到匹配的渠道')).toBeInTheDocument()

    channelPageMocks.getChannels.mockResolvedValueOnce({ data: { items: [] } })
    page.unmount()
    renderPage()
    const emptyTitle = await screen.findByText('还没有渠道')
    expect(emptyTitle).toBeInTheDocument()
    const emptyState = emptyTitle.closest('div')
    expect(emptyState).not.toBeNull()
    expect(within(emptyState as HTMLElement).getByRole('button', { name: '创建渠道' })).toBeInTheDocument()
  })
})
