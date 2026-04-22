// frontend/src/v2/pages/config/subscriptions/SubscriptionCreate.tsx
//
// 订阅创建页（/config/subscriptions/new）。
// 接口：POST /api/v1/subscriptions
// 静态路由必须先于动态路由 /:id 注册，见 plan §01 §4。

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Input, Switch, useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { useCreateSubscription } from '@v2/hooks/subscriptions'
import { useChannels } from '@v2/hooks/channels'
import type { CreateSubscriptionPayload } from '@v2/api/subscriptions'

export default function SubscriptionCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const createMutation = useCreateSubscription()
  const { data: channelData } = useChannels()
  const channels = channelData?.items ?? []

  const [name, setName] = useState('')
  const [appInstanceId, setAppInstanceId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [eventTypesStr, setEventTypesStr] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: CreateSubscriptionPayload = {
        name,
        app_instance_id: Number(appInstanceId),
        channel_id: Number(channelId),
        event_types: eventTypesStr.split(',').map((s) => s.trim()).filter(Boolean),
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
              <select
                id="new-sub-channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                required
                className="w-full rounded-md border px-2 py-1.5 text-xs focus-visible:ring-2"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
              >
                <option value="">{t('subscription.form.channelPlaceholder', '— 选择渠道 —')}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="new-sub-events" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('subscription.field.eventTypes', '订阅事件类型')} *
            </label>
            <Input
              id="new-sub-events"
              value={eventTypesStr}
              onChange={(e) => setEventTypesStr(e.target.value)}
              required
              placeholder="app.execution.completed, app.execution.failed"
              aria-describedby="new-sub-events-hint"
            />
            <p id="new-sub-events-hint" className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('subscription.form.eventTypesHint', '多个事件用逗号分隔，如：app.execution.completed')}
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
              disabled={submitting}
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
