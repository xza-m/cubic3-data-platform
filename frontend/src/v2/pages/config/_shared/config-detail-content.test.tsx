import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChannelDetailContent } from './channel-content'
import { SubscriptionDetailContent } from './subscription-content'
import type { Channel } from '@v2/api/channels'
import type { Subscription } from '@v2/api/subscriptions'

vi.mock('@v2/hooks/access', () => ({
  usePrincipalDisplayNames: (ids: string[]) => ({
    data: Object.fromEntries(ids.map((id) => [id, '王小明'])),
  }),
}))

const channel: Channel = {
  id: 5,
  name: '飞书告警群',
  channel_type: 'feishu',
  description: null,
  config: { webhook_url: 'https://example.test' },
  enabled: true,
  created_by: 'ou_a233770c5639ea99ec09a3a5e148fee0',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
}

const subscription: Subscription = {
  id: 8,
  name: '应用执行订阅',
  description: null,
  app_instance_id: 2,
  channel_id: 5,
  event_types: ['app.execution.completed'],
  filter_conditions: {},
  delivery_config: {},
  enabled: true,
  created_by: 'ou_a233770c5639ea99ec09a3a5e148fee0',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-02T00:00:00Z',
  channel: { id: 5, name: '飞书告警群', channel_type: 'feishu' },
  app_instance: { id: 2, name: '日报任务', app_code: 'daily-report', app_name: '日报' },
}

describe('配置详情内容', () => {
  it('渠道详情不直接展示 open_id，并把操作收敛为图标按钮', () => {
    render(
      <ChannelDetailContent
        row={channel}
        actions={{
          onTest: () => {},
          onToggle: () => {},
          onEdit: () => {},
          onDelete: () => {},
        }}
      />,
    )

    expect(screen.getByText('王小明')).toBeInTheDocument()
    expect(screen.queryByText(/ou_a233770c5639ea99ec09a3a5e148fee0/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送测试消息' })).toBeInTheDocument()
    expect(screen.queryByText('发送测试')).not.toBeInTheDocument()
  })

  it('订阅详情使用中文事件枚举，并把操作收敛为图标按钮', () => {
    render(
      <SubscriptionDetailContent
        row={subscription}
        actions={{
          onTrigger: () => {},
          onToggle: () => {},
          onJumpChannel: () => {},
          onEdit: () => {},
          onDelete: () => {},
        }}
      />,
    )

    expect(screen.getByText('王小明')).toBeInTheDocument()
    expect(screen.getByText('应用执行完成')).toBeInTheDocument()
    expect(screen.queryByText('app.execution.completed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即触发此订阅' })).toBeInTheDocument()
    expect(screen.queryByText('立即触发')).not.toBeInTheDocument()
  })
})
