import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SubscriptionForm from './SubscriptionForm'

const subscriptionApiMocks = vi.hoisted(() => ({
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}))

const channelApiMocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
}))

const appCenterMocks = vi.hoisted(() => ({
  getInstances: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('@/api/subscriptions', () => ({
  createSubscription: subscriptionApiMocks.createSubscription,
  updateSubscription: subscriptionApiMocks.updateSubscription,
}))

vi.mock('@/api/channels', () => ({
  getChannels: channelApiMocks.getChannels,
}))

vi.mock('@/api/appCenter', () => ({
  getInstances: appCenterMocks.getInstances,
}))

vi.mock('@/components/business', () => ({
  PageModal: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean
    title: string
    children: React.ReactNode
    footer?: React.ReactNode
  }) => (open ? (
    <div>
      <h1>{title}</h1>
      {children}
      {footer}
    </div>
  ) : null),
  FormSelect: ({
    value,
    onChange,
    options,
    disabled,
    id,
  }: {
    value?: string
    onChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    disabled?: boolean
    id?: string
  }) => (
    <select
      aria-label={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">请选择</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  FormButton: ({
    children,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button type="button" {...props}>
      {loading ? '提交中...' : children}
    </button>
  ),
  useToast: () => ({ toast: toastMocks.toast }),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({
    htmlFor,
    children,
  }: {
    htmlFor?: string
    children: React.ReactNode
  }) => <label htmlFor={htmlFor}>{children}</label>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string
    checked: boolean
    onCheckedChange: (value: boolean) => void
  }) => (
    <input
      aria-label={id}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

function installQueryData() {
  channelApiMocks.getChannels.mockResolvedValue({
    data: {
      items: [
        { id: 9, name: '飞书群', channel_type: 'feishu' },
        { id: 10, name: 'Webhook', channel_type: 'webhook' },
      ],
    },
  })
  appCenterMocks.getInstances.mockResolvedValue({
    items: [
      { id: 7, name: '日报推送', instance_name: '日报推送', app_code: 'daily_push' },
      { id: 8, name: '周报推送', instance_name: '周报推送', app_code: 'weekly_push' },
    ],
  })
}

function renderForm(subscription: any = null) {
  installQueryData()
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <SubscriptionForm open subscription={subscription} onClose={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('SubscriptionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('创建订阅时支持选择实例、渠道和事件', async () => {
    const user = userEvent.setup()
    subscriptionApiMocks.createSubscription.mockResolvedValueOnce({ data: { id: 1 } })

    renderForm()

    await user.type(screen.getByLabelText(/订阅名称/), '数据集推送通知')
    await waitFor(() => {
      expect(screen.getByLabelText('app_instance_id')).toHaveTextContent('日报推送')
      expect(screen.getByLabelText('channel_id')).toHaveTextContent('飞书群')
    })
    await user.selectOptions(screen.getByLabelText('app_instance_id'), '7')
    await user.selectOptions(screen.getByLabelText('channel_id'), '9')
    await user.selectOptions(screen.getByLabelText('event_types'), 'app.execution.completed')
    expect(screen.getByText('应用执行完成')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(subscriptionApiMocks.createSubscription).toHaveBeenCalledTimes(1)
      expect(subscriptionApiMocks.createSubscription.mock.calls[0][0]).toEqual({
        name: '数据集推送通知',
        app_instance_id: 7,
        channel_id: 9,
        event_types: ['app.execution.completed'],
        enabled: true,
      })
    })
    expect(toastMocks.toast).toHaveBeenCalledWith({ title: '订阅创建成功' })
  })

  it('创建前按顺序校验名称、实例和渠道', async () => {
    const user = userEvent.setup()

    renderForm()

    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '请输入订阅名称',
      variant: 'destructive',
    })

    await waitFor(() => {
      expect(screen.getByLabelText('app_instance_id')).toHaveTextContent('日报推送')
    })
    await user.type(screen.getByLabelText(/订阅名称/), '失败告警')
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '请选择应用实例',
      variant: 'destructive',
    })

    await user.selectOptions(screen.getByLabelText('app_instance_id'), '7')
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '请选择推送渠道',
      variant: 'destructive',
    })
  })

  it('编辑模式会预填并仅更新可编辑字段', async () => {
    const user = userEvent.setup()
    subscriptionApiMocks.updateSubscription.mockResolvedValueOnce({ data: { id: 5 } })

    renderForm({
      id: 5,
      name: '实例执行告警',
      app_instance_id: 7,
      channel_id: 9,
      enabled: true,
      event_filter: {
        event_types: ['app.execution.failed'],
      },
    })

    expect(await screen.findByDisplayValue('实例执行告警')).toBeInTheDocument()
    expect(screen.getByLabelText('app_instance_id')).toBeDisabled()
    expect(screen.getByLabelText('channel_id')).toBeDisabled()
    expect(screen.getByText('应用执行失败')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/订阅名称/))
    await user.type(screen.getByLabelText(/订阅名称/), '实例执行告警-更新')
    await user.selectOptions(screen.getByLabelText('event_types'), 'app.instance.disabled')
    await user.click(screen.getByLabelText('enabled'))
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(subscriptionApiMocks.updateSubscription).toHaveBeenCalledWith(5, {
        name: '实例执行告警-更新',
        event_types: ['app.execution.failed', 'app.instance.disabled'],
        enabled: false,
      })
    })
    expect(toastMocks.toast).toHaveBeenCalledWith({ title: '订阅更新成功' })
  })
})
