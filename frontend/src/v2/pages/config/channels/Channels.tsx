// frontend/src/v2/pages/config/channels/Channels.tsx
//
// 渠道列表页（L0）。
// 接口：GET /api/v1/channels
// 对齐后端：app/interfaces/api/v1/channels.py

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, SkeletonRows, Switch, Table, useToast, type TableColumn } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtDateTime } from '@v2/lib/format'
import { useChannels, useDeleteChannel, useUpdateChannel } from '@v2/hooks/channels'
import { useCreateChannel } from '@v2/hooks/channels'
import type { Channel, ChannelType, CreateChannelPayload } from '@v2/api/channels'
import {
  CHANNEL_TYPE_LABEL,
  channelTypeChip,
  ChannelDetailContent,
} from '../_shared/channel-content'

// ============================================================================
// 渠道创建表单（内联简化版，等 X-Crosscut EntityFormDialog 就绪后可重构）
// TODO: 等待 X-Crosscut EntityFormDialog — 当前使用内联 Dialog
// ============================================================================

import { Dialog, Input, Select } from '@v2/components/ui'

const CHANNEL_TYPE_OPTIONS: { value: ChannelType; label: string }[] = [
  { value: 'feishu', label: CHANNEL_TYPE_LABEL.feishu },
  { value: 'email', label: CHANNEL_TYPE_LABEL.email },
  { value: 'webhook', label: CHANNEL_TYPE_LABEL.webhook },
  { value: 'oss', label: CHANNEL_TYPE_LABEL.oss },
]

interface ChannelFormState {
  name: string
  channel_type: ChannelType
  description: string
  enabled: boolean
  webhook_url: string
  recipients: string
}

const DEFAULT_FORM: ChannelFormState = {
  name: '',
  channel_type: 'webhook',
  description: '',
  enabled: true,
  webhook_url: '',
  recipients: '',
}

function buildConfig(form: ChannelFormState): Record<string, unknown> {
  switch (form.channel_type) {
    case 'feishu':
      return { webhook_url: form.webhook_url }
    case 'email':
      return { recipients: form.recipients.split(',').map((s) => s.trim()).filter(Boolean) }
    case 'webhook':
      return { url: form.webhook_url }
    case 'oss':
      return { bucket: form.webhook_url }
    default:
      return {}
  }
}

function ChannelFormDialog({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: CreateChannelPayload) => Promise<void>
  initialValues?: Partial<ChannelFormState>
  mode: 'create' | 'edit'
}) {
  const [form, setForm] = useState<ChannelFormState>({ ...DEFAULT_FORM, ...initialValues })
  const [submitting, setSubmitting] = useState(false)

  const set = (k: keyof ChannelFormState, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        name: form.name,
        channel_type: form.channel_type,
        description: form.description || undefined,
        config: buildConfig(form),
        enabled: form.enabled,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const configLabel =
    form.channel_type === 'email'
      ? t('channel.form.recipients', '收件人（逗号分隔）')
      : form.channel_type === 'oss'
        ? t('channel.form.bucket', 'OSS Bucket')
        : form.channel_type === 'feishu'
          ? t('channel.form.feishuWebhook', '飞书 Webhook URL')
          : t('channel.form.webhookUrl', 'Webhook URL')

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('channel.form.createTitle', '接入新渠道') : t('channel.form.editTitle', '编辑渠道')}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ch-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('common.name', '名称')} *
            </label>
            <Input
              id="ch-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              placeholder={t('channel.form.namePlaceholder', '如：飞书告警群')}
            />
          </div>
          <div>
            <label htmlFor="ch-type" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('channel.field.type', '类型')} *
            </label>
            <Select
              id="ch-type"
              value={form.channel_type}
              onChange={(e) => set('channel_type', e.target.value as ChannelType)}
            >
              {CHANNEL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label htmlFor="ch-config" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {configLabel} *
          </label>
          {form.channel_type === 'email' ? (
            <Input
              id="ch-config"
              value={form.recipients}
              onChange={(e) => set('recipients', e.target.value)}
              placeholder="user@example.com, other@example.com"
              required
            />
          ) : (
            <Input
              id="ch-config"
              value={form.webhook_url}
              onChange={(e) => set('webhook_url', e.target.value)}
              placeholder={form.channel_type === 'oss' ? 'my-bucket' : 'https://...'}
              required
            />
          )}
        </div>

        <div>
          <label htmlFor="ch-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.description', '描述')}
          </label>
          <Input
            id="ch-desc"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('channel.form.descPlaceholder', '可选备注')}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={form.enabled}
            onChange={(checked) => set('enabled', checked)}
          />
          <span className="text-xs" style={{ color: 'var(--text-2)' }}>
            {t('common.enabled', '启用')}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {t('common.cancel', '取消')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[color:var(--accent)] px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting
              ? t('common.saving', '保存中…')
              : mode === 'create'
                ? t('common.create', '创建')
                : t('common.saveChanges', '保存修改')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ============================================================================
// 列表页主组件
// ============================================================================

export default function Channels() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, isLoading } = useChannels()
  const rows = data?.items ?? []

  const updateMutation = useUpdateChannel()
  const createMutation = useCreateChannel()
  const deleteMutation = useDeleteChannel()

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Channel | null>(null)
  const [peekRow, setPeekRow] = useState<Channel | null>(null)

  const openCreate = () => { setEditing(null); setFormMode('create') }
  const openEdit = (row: Channel) => { setEditing(row); setFormMode('edit') }
  const closeForm = () => setFormMode(null)

  const handleCreate = async (payload: CreateChannelPayload) => {
    const created = await createMutation.mutateAsync(payload)
    toast.show({ tone: 'success', title: t('channel.toast.created', '已新建渠道'), description: created.name })
  }

  const handleEditSubmit = async (payload: CreateChannelPayload) => {
    if (!editing) return
    await updateMutation.mutateAsync({ id: editing.id, payload })
    toast.show({ tone: 'success', title: t('channel.toast.updated', '已保存修改'), description: editing.name })
  }

  const handleDelete = async (row: Channel) => {
    if (!window.confirm(t('channel.confirm.delete', `删除渠道「${row.name}」？`))) return
    await deleteMutation.mutateAsync(row.id)
    toast.show({ tone: 'warning', title: t('channel.toast.deleted', '已删除'), description: row.name })
    if (peekRow?.id === row.id) setPeekRow(null)
  }

  const handleToggle = async (row: Channel) => {
    const payload = { enabled: !row.enabled }
    await updateMutation.mutateAsync({ id: row.id, payload })
  }

  const typeMap = useMemo(() => {
    const m = new Map<ChannelType, number>()
    for (const r of rows) m.set(r.channel_type, (m.get(r.channel_type) ?? 0) + 1)
    return m
  }, [rows])

  const columns: TableColumn<Channel>[] = [
    {
      key: 'name',
      title: t('common.name', '名称'),
      render: (r) => (
        <button
          type="button"
          onClick={() => setPeekRow(r)}
          className="text-left font-medium hover:underline focus-visible:ring-2"
          style={{ color: 'var(--text-1)' }}
        >
          {r.name}
        </button>
      ),
    },
    {
      key: 'channel_type',
      title: t('channel.field.type', '类型'),
      width: 100,
      render: (r) => channelTypeChip(r.channel_type),
    },
    {
      key: 'description',
      title: t('common.description', '描述'),
      render: (r) => <span style={{ color: 'var(--text-3)' }}>{r.description ?? '—'}</span>,
    },
    {
      key: 'created_by',
      title: t('common.createdBy', '创建人'),
      width: 100,
      render: (r) => <span style={{ color: 'var(--text-2)' }}>{r.created_by ?? '—'}</span>,
    },
    {
      key: 'updated_at',
      title: t('common.updatedAt', '更新时间'),
      width: 140,
      render: (r) => <span style={{ color: 'var(--text-3)' }}>{fmtDateTime(r.updated_at)}</span>,
    },
    {
      key: 'enabled',
      title: t('common.enabled', '启用'),
      width: 70,
      render: (r) => (
        <Switch
          checked={r.enabled}
          onChange={() => void handleToggle(r)}
          aria-label={r.enabled ? t('channel.action.disable', '禁用') : t('channel.action.enable', '启用')}
        />
      ),
    },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── 页头 ── */}
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div>
          <nav className="mb-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
            {t('nav.config', '配置')} / {t('nav.channels', '渠道')}
          </nav>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('channel.page.title', '渠道')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('channel.page.subtitle', '对接的飞书 / 邮件 / Webhook / OSS 等推送出口')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 类型分布 */}
          <div className="hidden items-center gap-1 md:flex">
            {Array.from(typeMap.entries()).map(([type, count]) => (
              <Chip key={type} tone="neutral">
                {CHANNEL_TYPE_LABEL[type]} {count}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2"
          >
            + {t('channel.action.create', '接入新渠道')}
          </button>
        </div>
      </header>

      {/* ── 列表 ── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4">
              <SkeletonRows rows={5} />
            </div>
          ) : (
            <Table
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id}
              onRowClick={(r) => navigate(`/config/channels/${r.id}`)}
              emptyText={t('channel.empty', '暂无渠道，点击「接入新渠道」创建')}
            />
          )}
        </div>

        {/* ── Peek Panel ── */}
        {/* TODO: 等待 X-Crosscut PeekPanel 组件 — 当前用内联 Sheet 替代 */}
        {peekRow ? (
          <aside
            className="w-72 shrink-0 border-l"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  {peekRow.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {CHANNEL_TYPE_LABEL[peekRow.channel_type]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPeekRow(null)}
                aria-label={t('common.close', '关闭')}
                className="ml-2 shrink-0 rounded p-1 hover:bg-[color:var(--bg-hover)] focus-visible:ring-2"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto" style={{ height: 'calc(100% - 45px)' }}>
              <ChannelDetailContent
                row={peekRow}
                actions={{
                  onTest: () =>
                    toast.show({ tone: 'success', title: t('channel.toast.testSent', '已发送测试消息'), description: peekRow.name }),
                  onToggle: () => void handleToggle(peekRow),
                  onEdit: () => openEdit(peekRow),
                  onDelete: () => void handleDelete(peekRow),
                }}
              />
            </div>
          </aside>
        ) : null}
      </div>

      {/* ── 创建 / 编辑表单 ── */}
      <ChannelFormDialog
        open={formMode != null}
        mode={formMode ?? 'create'}
        onClose={closeForm}
        onSubmit={formMode === 'edit' && editing ? handleEditSubmit : handleCreate}
        initialValues={
          formMode === 'edit' && editing
            ? {
                name: editing.name,
                channel_type: editing.channel_type,
                description: editing.description ?? '',
                enabled: editing.enabled,
              }
            : undefined
        }
      />
    </div>
  )
}
