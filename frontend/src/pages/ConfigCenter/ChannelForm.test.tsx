import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChannelForm from './ChannelForm'

const channelApiMocks = vi.hoisted(() => ({
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
}))

const toastMocks = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('@/api/channels', () => ({
  createChannel: channelApiMocks.createChannel,
  updateChannel: channelApiMocks.updateChannel,
}))

vi.mock('@/components/business', () => ({
  PageModal: ({
    open,
    title,
    description,
    children,
    footer,
    width,
    className,
    bodyClassName,
  }: {
    open: boolean
    title: string
    description?: string
    children: React.ReactNode
    footer?: React.ReactNode
    width?: string
    className?: string
    bodyClassName?: string
  }) => (open ? (
    <div
      data-testid="channel-form-modal"
      data-width={width}
      data-classname={className}
      data-bodyclassname={bodyClassName}
    >
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
      {footer}
    </div>
  ) : null),
  FormInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  FormPassword: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="password" {...props} />,
  FormTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  FormSelect: ({
    value,
    onValueChange,
    options,
    disabled,
    id,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    disabled?: boolean
    id?: string
  }) => (
    <select
      aria-label={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
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

vi.mock('@/components/ui/label', () => ({
  Label: ({
    htmlFor,
    children,
  }: {
    htmlFor?: string
    children: React.ReactNode
  }) => <label htmlFor={htmlFor}>{children}</label>,
}))

function renderForm(channel: any = null) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <ChannelForm open channel={channel} onClose={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  )
}

describe('ChannelForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认创建飞书渠道并提交成功', async () => {
    const user = userEvent.setup()
    channelApiMocks.createChannel.mockResolvedValueOnce({ data: { id: 1 } })

    renderForm()

    await user.type(screen.getByLabelText(/渠道名称/), '数据团队飞书群')
    await user.type(screen.getByLabelText(/群聊 ID/), 'oc_demo')
    await user.type(screen.getByLabelText(/Webhook URL \(可选\)/), 'https://open.feishu.cn/webhook')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(channelApiMocks.createChannel).toHaveBeenCalledTimes(1)
      expect(channelApiMocks.createChannel.mock.calls[0][0]).toEqual({
        name: '数据团队飞书群',
        channel_type: 'feishu',
        config: {
          chat_id: 'oc_demo',
          webhook_url: 'https://open.feishu.cn/webhook',
        },
        enabled: true,
      })
    })
    expect(toastMocks.toast).toHaveBeenCalledWith({ title: '渠道创建成功' })
  })

  it('创建态会使用更稳的弹窗宽度和可滚动布局参数', () => {
    renderForm()

    const modal = screen.getByTestId('channel-form-modal')
    expect(modal).toHaveAttribute('data-width', 'min(720px,calc(100vw-2rem))')
    expect(modal).toHaveAttribute(
      'data-classname',
      expect.stringContaining('top-4'),
    )
    expect(modal).toHaveAttribute(
      'data-classname',
      expect.stringContaining('sm:translate-y-[-50%]'),
    )
    expect(modal).toHaveAttribute(
      'data-bodyclassname',
      expect.stringContaining('pr-1'),
    )
  })

  it('切到 Webhook 时先校验 URL，再按配置创建', async () => {
    const user = userEvent.setup()
    channelApiMocks.createChannel.mockResolvedValueOnce({ data: { id: 2 } })

    renderForm()

    await user.type(screen.getByLabelText(/渠道名称/), 'Webhook 推送')
    await user.selectOptions(screen.getByLabelText('channel_type'), 'webhook')
    await screen.findByLabelText(/Webhook URL \*/)
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '请输入 Webhook URL',
      variant: 'destructive',
    })

    await user.type(screen.getByLabelText(/Webhook URL \*/), 'https://hooks.example.com/event')
    await user.type(screen.getByLabelText(/Secret/), 'secret-token')
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(channelApiMocks.createChannel).toHaveBeenCalledTimes(1)
      expect(channelApiMocks.createChannel.mock.calls[0][0]).toEqual({
        name: 'Webhook 推送',
        channel_type: 'webhook',
        config: {
          url: 'https://hooks.example.com/event',
          method: 'POST',
          secret: 'secret-token',
        },
        enabled: true,
      })
    })
  })

  it('编辑邮件渠道时预填配置并更新', async () => {
    const user = userEvent.setup()
    channelApiMocks.updateChannel.mockResolvedValueOnce({ data: { id: 3 } })

    renderForm({
      id: 3,
      name: '邮件通知',
      channel_type: 'email',
      enabled: true,
      config: {
        recipients: ['a@example.com', 'b@example.com'],
        subject_template: '日报通知',
      },
    })

    expect(screen.getByDisplayValue('邮件通知')).toBeInTheDocument()
    expect(screen.getByDisplayValue('a@example.com, b@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('日报通知')).toBeInTheDocument()
    expect(screen.getByLabelText('channel_type')).toBeDisabled()

    await user.clear(screen.getByLabelText(/渠道名称/))
    await user.type(screen.getByLabelText(/渠道名称/), '邮件通知更新')
    await user.clear(screen.getByLabelText(/收件人/))
    await user.type(screen.getByLabelText(/收件人/), 'ops@example.com, bi@example.com')
    await user.clear(screen.getByLabelText(/邮件主题模板/))
    await user.type(screen.getByLabelText(/邮件主题模板/), '最新订阅提醒')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(channelApiMocks.updateChannel).toHaveBeenCalledWith(3, {
        name: '邮件通知更新',
        channel_type: 'email',
        config: {
          recipients: ['ops@example.com', 'bi@example.com'],
          subject_template: '最新订阅提醒',
        },
        enabled: true,
      })
    })
  })

  it('创建 OSS 渠道时校验 bucket 并支持禁用状态', async () => {
    const user = userEvent.setup()
    channelApiMocks.createChannel.mockResolvedValueOnce({ data: { id: 4 } })

    renderForm()

    await user.type(screen.getByLabelText(/渠道名称/), 'OSS 归档')
    await user.selectOptions(screen.getByLabelText('channel_type'), 'oss')
    await screen.findByLabelText(/Bucket 名称/)
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(toastMocks.toast).toHaveBeenCalledWith({
      title: '请输入 Bucket 名称',
      variant: 'destructive',
    })

    await user.type(screen.getByLabelText(/Bucket 名称/), 'analytics-archive')
    fireEvent.change(screen.getByLabelText(/路径模板/), {
      target: { value: 'reports/{date}.csv' },
    })
    await user.click(screen.getByLabelText('enabled'))
    await user.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(channelApiMocks.createChannel).toHaveBeenCalledTimes(1)
      expect(channelApiMocks.createChannel.mock.calls[0][0]).toEqual({
        name: 'OSS 归档',
        channel_type: 'oss',
        config: {
          bucket: 'analytics-archive',
          path_template: 'reports/{date}.csv',
        },
        enabled: false,
      })
    })
  })
})
