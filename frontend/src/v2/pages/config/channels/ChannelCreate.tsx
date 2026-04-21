// frontend/src/v2/pages/config/channels/ChannelCreate.tsx
//
// 渠道创建页（/config/channels/new）。
// 接口：POST /api/v1/channels
// 静态路由必须先于动态路由 /:id 注册，见 plan §01 §4。

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Input, Select, Switch, useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { useCreateChannel } from '@v2/hooks/channels'
import type { ChannelType, CreateChannelPayload } from '@v2/api/channels'
import { CHANNEL_TYPE_LABEL } from '../_shared/channel-content'

const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: 'feishu', label: CHANNEL_TYPE_LABEL.feishu },
  { value: 'email', label: CHANNEL_TYPE_LABEL.email },
  { value: 'webhook', label: CHANNEL_TYPE_LABEL.webhook },
  { value: 'oss', label: CHANNEL_TYPE_LABEL.oss },
]

function buildConfig(type: ChannelType, configValue: string): Record<string, unknown> {
  switch (type) {
    case 'feishu':
      return { webhook_url: configValue }
    case 'email':
      return { recipients: configValue.split(',').map((s) => s.trim()).filter(Boolean) }
    case 'webhook':
      return { url: configValue }
    case 'oss':
      return { bucket: configValue }
    default:
      return {}
  }
}

function getConfigLabel(type: ChannelType): string {
  switch (type) {
    case 'email':
      return t('channel.form.recipients', '收件人（逗号分隔）')
    case 'oss':
      return t('channel.form.bucket', 'OSS Bucket 名称')
    case 'feishu':
      return t('channel.form.feishuWebhook', '飞书 Webhook URL')
    default:
      return t('channel.form.webhookUrl', 'Webhook URL')
  }
}

function getConfigPlaceholder(type: ChannelType): string {
  switch (type) {
    case 'email':
      return 'user@example.com, other@example.com'
    case 'oss':
      return 'my-data-bucket'
    default:
      return 'https://...'
  }
}

export default function ChannelCreate() {
  const navigate = useNavigate()
  const toast = useToast()
  const createMutation = useCreateChannel()

  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<ChannelType>('webhook')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [configValue, setConfigValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: CreateChannelPayload = {
        name,
        channel_type: channelType,
        config: buildConfig(channelType, configValue),
        description: description || undefined,
        enabled,
      }
      const created = await createMutation.mutateAsync(payload)
      toast.show({ tone: 'success', title: t('channel.toast.created', '已新建渠道'), description: created.name })
      navigate(`/config/channels/${created.id}`)
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
            onClick={() => navigate('/config/channels')}
            className="inline-flex items-center gap-1 text-xs hover:underline focus-visible:ring-2"
            style={{ color: 'var(--text-3)' }}
          >
            <ArrowLeft size={11} aria-hidden />
            {t('channel.nav.backToList', '返回渠道列表')}
          </button>
        </div>
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('channel.form.createTitle', '接入新渠道')}
        </h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-ch-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                {t('common.name', '名称')} *
              </label>
              <Input
                id="new-ch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={t('channel.form.namePlaceholder', '如：飞书告警群')}
                aria-describedby="new-ch-name-hint"
              />
            </div>
            <div>
              <label htmlFor="new-ch-type" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                {t('channel.field.type', '类型')} *
              </label>
              <Select
                id="new-ch-type"
                value={channelType}
                onChange={(e) => {
                  setChannelType(e.target.value as ChannelType)
                  setConfigValue('')
                }}
              >
                {CHANNEL_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label htmlFor="new-ch-config" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {getConfigLabel(channelType)} *
            </label>
            <Input
              id="new-ch-config"
              value={configValue}
              onChange={(e) => setConfigValue(e.target.value)}
              required
              placeholder={getConfigPlaceholder(channelType)}
              aria-describedby="new-ch-config-hint"
            />
          </div>

          <div>
            <label htmlFor="new-ch-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('common.description', '描述')}
            </label>
            <Input
              id="new-ch-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('channel.form.descPlaceholder', '可选备注')}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={enabled} onChange={setEnabled} />
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
              {t('channel.form.enabledLabel', '创建后立即启用')}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[color:var(--accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:ring-2"
            >
              {submitting ? t('common.saving', '创建中…') : t('common.create', '创建渠道')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/config/channels')}
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
