// frontend/src/v2/pages/config/subscriptions/SubscriptionCreate.tsx
//
// 订阅创建页（/config/subscriptions/new）。
// 接口：POST /api/v1/subscriptions
// 静态路由必须先于动态路由 /:id 注册，见 plan §01 §4。

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Input, Select, Switch, useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { useCreateSubscription } from '@v2/hooks/subscriptions'
import { useChannels } from '@v2/hooks/channels'
import type { CreateSubscriptionPayload } from '@v2/api/subscriptions'
import type { Channel, ChannelType } from '@v2/api/channels'
import { CHANNEL_TYPE_LABEL } from '../_shared/channel-content'
import { SUBSCRIPTION_EVENT_OPTIONS } from '../_shared/event-labels'

export default function SubscriptionCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const createMutation = useCreateSubscription()
  const { data: channelData } = useChannels()
  const channels = channelData?.items ?? []

  const [name, setName] = useState('')
  const [appInstanceId, setAppInstanceId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const toggleEventType = (eventType: string) => {
    setEventTypes((current) =>
      current.includes(eventType)
        ? current.filter((item) => item !== eventType)
        : [...current, eventType],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: CreateSubscriptionPayload = {
        name,
        app_instance_id: Number(appInstanceId),
        channel_id: Number(channelId),
        event_types: eventTypes,
        description: description || undefined,
        enabled,
      }
      const created = await createMutation.mutateAsync(payload)
      toast.show({ tone: 'success', title: t('subscription.toast.created', '已新建订阅'), description: created.name })
      navigate(`/config/subscriptions/${created.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header
        className="border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/config/subscriptions')}
            className="inline-flex items-center gap-1 text-xs hover:underline focus-visible:ring-2"
            style={{ color: 'var(--text-3)' }}
          >
            <ArrowLeft size={11} aria-hidden />
            {t('subscription.nav.backToList', '返回订阅列表')}
          </button>
        </div>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('subscription.form.createTitle', '新建订阅')}
        </h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5">
          <div>
            <label htmlFor="new-sub-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('common.name', '名称')} *
            </label>
            <Input
              id="new-sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder={t('subscription.form.namePlaceholder', '如：风险应用失败告警')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-sub-instance" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                {t('subscription.field.appInstanceId', '应用实例 ID')} *
              </label>
              <Input
                id="new-sub-instance"
                type="number"
                value={appInstanceId}
                onChange={(e) => setAppInstanceId(e.target.value)}
                required
                placeholder="1"
                min={1}
                aria-describedby="new-sub-instance-hint"
              />
              <p id="new-sub-instance-hint" className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('subscription.form.instanceIdHint', '可在应用实例列表页查看 ID')}
              </p>
            </div>
            <div>
              <label htmlFor="new-sub-channel" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                {t('subscription.field.channelId', '推送渠道')} *
              </label>
              <Select
                id="new-sub-channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                required
              >
                <option value="">{t('subscription.form.channelPlaceholder', '— 选择渠道 —')}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{formatChannelOption(c)}</option>
                ))}
              </Select>
              {channels.length === 0 ? (
                <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                  {t('subscription.form.noChannels', '暂无渠道，先创建飞书或 Webhook 渠道')}
                  <button
                    type="button"
                    className="ml-1 underline"
                    onClick={() => navigate('/config/channels/new')}
                    style={{ color: 'var(--accent)' }}
                  >
                    {t('subscription.form.createChannelLink', '去创建')}
                  </button>
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('subscription.field.eventTypes', '订阅事件类型')} *
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUBSCRIPTION_EVENT_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex min-h-9 items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                  style={{
                    borderColor: eventTypes.includes(option.value) ? 'var(--accent)' : 'var(--border)',
                    background: eventTypes.includes(option.value) ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    color: 'var(--text-2)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={eventTypes.includes(option.value)}
                    onChange={() => toggleEventType(option.value)}
                  />
                  <span className="truncate" title={option.value}>{option.label}</span>
                </label>
              ))}
            </div>
            <p id="new-sub-events-hint" className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('subscription.form.eventTypesHint', '至少选择一个事件类型')}
            </p>
          </div>

          <div>
            <label htmlFor="new-sub-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('common.description', '描述')}
            </label>
            <Input
              id="new-sub-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('subscription.form.descPlaceholder', '可选备注')}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onChange={setEnabled} />
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              {t('subscription.form.enabledLabel', '创建后立即启用')}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || eventTypes.length === 0}
              className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2"
            >
              {submitting ? t('common.creating', '创建中…') : t('common.create.subscription', '创建订阅')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/config/subscriptions')}
              className="rounded-md border px-4 py-2 text-xs transition-colors hover:bg-[color:var(--bg-hover)] focus-visible:ring-2"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('common.cancel', '取消')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatChannelOption(channel: Channel): string {
  const rawType = channel.channel_type ?? (channel as Channel & { type?: ChannelType }).type
  const typeLabel = rawType ? CHANNEL_TYPE_LABEL[rawType] ?? rawType : t('channel.field.type', '渠道')
  const status = channel.enabled ? t('common.enabled', '启用') : t('common.disabled', '已停')
  return `${channel.name} · ${typeLabel} · ${status}`
}
