// frontend/src/v2/pages/config/subscriptions/Subscriptions.tsx
//
// 订阅列表页（L0）。
// 接口：GET /api/v1/subscriptions
// 对齐后端：app/interfaces/api/v1/subscriptions.py
//
// drop-frontend: type(指标/查询/应用/事件) / target / schedule / owner / last_triggered_at
//   — demo 字段，后端无对应，见 plan §3.4。

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Dialog, Input, SkeletonRows, Switch, Table, useToast, type TableColumn } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import {
  useSubscriptions,
  useCreateSubscription,
  useDeleteSubscription,
  useUpdateSubscription,
} from '@v2/hooks/subscriptions'
import { useChannels } from '@v2/hooks/channels'
import type { Subscription, CreateSubscriptionPayload } from '@v2/api/subscriptions'
import {
  SubscriptionDetailContent,
} from '../_shared/subscription-content'

// ============================================================================
// 创建 / 编辑表单
// TODO: 等待 X-Crosscut EntityFormDialog
// ============================================================================

function SubscriptionFormDialog({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: CreateSubscriptionPayload) => Promise<void>
  initialValues?: Partial<CreateSubscriptionPayload>
  mode: 'create' | 'edit'
}) {
  const { data: channelData } = useChannels()
  const channels = channelData?.items ?? []

  const [name, setName] = useState(initialValues?.name ?? '')
  const [appInstanceId, setAppInstanceId] = useState(String(initialValues?.app_instance_id ?? ''))
  const [channelId, setChannelId] = useState(String(initialValues?.channel_id ?? ''))
  const [eventTypesStr, setEventTypesStr] = useState(
    (initialValues?.event_types ?? []).join(', '),
  )
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        name,
        app_instance_id: Number(appInstanceId),
        channel_id: Number(channelId),
        event_types: eventTypesStr.split(',').map((s) => s.trim()).filter(Boolean),
        description: description || undefined,
        enabled,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('subscription.form.createTitle', '新建订阅') : t('subscription.form.editTitle', '编辑订阅')}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div>
          <label htmlFor="sub-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.name', '名称')} *
          </label>
          <Input
            id="sub-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t('subscription.form.namePlaceholder', '如：风险应用失败告警')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sub-instance" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('subscription.field.appInstanceId', '应用实例 ID')} *
            </label>
            <Input
              id="sub-instance"
              type="number"
              value={appInstanceId}
              onChange={(e) => setAppInstanceId(e.target.value)}
              required
              placeholder="1"
              min={1}
            />
          </div>
          <div>
            <label htmlFor="sub-channel" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('subscription.field.channelId', '推送渠道')} *
            </label>
            <select
              id="sub-channel"
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
          <label htmlFor="sub-events" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('subscription.field.eventTypes', '订阅事件类型')} *
          </label>
          <Input
            id="sub-events"
            value={eventTypesStr}
            onChange={(e) => setEventTypesStr(e.target.value)}
            required
            placeholder="app.execution.completed, app.execution.failed"
          />
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            {t('subscription.form.eventTypesHint', '多个事件用逗号分隔')}
          </p>
        </div>

        <div>
          <label htmlFor="sub-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.description', '描述')}
          </label>
          <Input
            id="sub-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('subscription.form.descPlaceholder', '可选备注')}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={enabled} onChange={setEnabled} />
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
                : t('common.save', '保存修改')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ============================================================================
// 列表页主组件
// ============================================================================

export default function Subscriptions() {
  const navigate = useNavigate()
  const toast = useToast()

  const { data, isLoading } = useSubscriptions()
  const rows = data?.items ?? []

  const updateMutation = useUpdateSubscription()
  const createMutation = useCreateSubscription()
  const deleteMutation = useDeleteSubscription()

  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [peekRow, setPeekRow] = useState<Subscription | null>(null)

  const openCreate = () => { setEditing(null); setFormMode('create') }
  const openEdit = (row: Subscription) => { setEditing(row); setFormMode('edit') }
  const closeForm = () => setFormMode(null)

  const handleCreate = async (payload: CreateSubscriptionPayload) => {
    const created = await createMutation.mutateAsync(payload)
    toast.show({ tone: 'success', title: t('subscription.toast.created', '已新建订阅'), description: created.name })
  }

  const handleEditSubmit = async (payload: CreateSubscriptionPayload) => {
    if (!editing) return
    await updateMutation.mutateAsync({
      id: editing.id,
      payload: {
        name: payload.name,
        event_types: payload.event_types,
        description: payload.description,
        enabled: payload.enabled,
      },
    })
    toast.show({ tone: 'success', title: t('subscription.toast.updated', '已保存修改'), description: editing.name })
  }

  const handleDelete = async (row: Subscription) => {
    if (!window.confirm(t('subscription.confirm.delete', `删除订阅「${row.name}」？`))) return
    await deleteMutation.mutateAsync(row.id)
    toast.show({ tone: 'warning', title: t('subscription.toast.deleted', '已删除'), description: row.name })
    if (peekRow?.id === row.id) setPeekRow(null)
  }

  const handleToggle = async (row: Subscription) => {
    await updateMutation.mutateAsync({ id: row.id, payload: { enabled: !row.enabled } })
  }

  // 统计
  const enabledCount = useMemo(() => rows.filter((r) => r.enabled).length, [rows])

  const columns: TableColumn<Subscription>[] = [
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
      key: 'event_types',
      title: t('subscription.field.eventTypes', '事件类型'),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.event_types.slice(0, 2).map((et) => (
            <Chip key={et} tone="violet">{et}</Chip>
          ))}
          {r.event_types.length > 2 && (
            <Chip tone="neutral">+{r.event_types.length - 2}</Chip>
          )}
        </div>
      ),
    },
    {
      key: 'app_instance_id',
      title: t('subscription.field.appInstanceId', '应用实例'),
      width: 110,
      render: (r) => (
        <span style={{ color: 'var(--text-2)' }}>
          {r.app_instance?.app_name ?? `#${r.app_instance_id}`}
        </span>
      ),
    },
    {
      key: 'channel_id',
      title: t('subscription.field.channelId', '渠道'),
      width: 110,
      render: (r) => (
        <span style={{ color: 'var(--text-2)' }}>
          {r.channel?.name ?? `#${r.channel_id}`}
        </span>
      ),
    },
    {
      key: 'updated_at',
      title: t('common.updatedAt', '更新时间'),
      width: 130,
      render: (r) => <span style={{ color: 'var(--text-3)' }}>{fmtRelative(r.updated_at)}</span>,
    },
    {
      key: 'enabled',
      title: t('common.enabled', '启用'),
      width: 70,
      render: (r) => (
        <Switch
          checked={r.enabled}
          onChange={() => void handleToggle(r)}
          aria-label={r.enabled ? t('subscription.action.pause', '暂停') : t('subscription.action.enable', '启用')}
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
            {t('nav.config', '配置')} / {t('nav.subscriptions', '订阅')}
          </nav>
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('subscription.page.title', '订阅')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('subscription.page.subtitle', '将应用实例事件按需推送到配置渠道')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="neutral">
            {t('subscription.stats.enabled', `启用 ${enabledCount} / ${rows.length}`)}
          </Chip>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2"
          >
            + {t('subscription.action.create', '新建订阅')}
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
              onRowClick={(r) => navigate(`/config/subscriptions/${r.id}`)}
              emptyText={t('subscription.empty', '暂无订阅，点击「新建订阅」创建')}
            />
          )}
        </div>

        {/* ── Peek Panel ── */}
        {/* TODO: 等待 X-Crosscut PeekPanel 组件 */}
        {peekRow ? (
          <aside
            className="w-72 shrink-0 border-l"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <div
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  {peekRow.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {peekRow.channel?.name ?? `#${peekRow.channel_id}`}
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
              <SubscriptionDetailContent
                row={peekRow}
                actions={{
                  onTrigger: () =>
                    toast.show({ tone: 'success', title: t('subscription.toast.triggered', '已立即触发'), description: peekRow.name }),
                  onToggle: () => void handleToggle(peekRow),
                  onJumpChannel: () => navigate(`/config/channels/${peekRow.channel_id}`),
                  onEdit: () => openEdit(peekRow),
                  onDelete: () => void handleDelete(peekRow),
                }}
              />
            </div>
          </aside>
        ) : null}
      </div>

      {/* ── 创建 / 编辑表单 ── */}
      <SubscriptionFormDialog
        open={formMode != null}
        mode={formMode ?? 'create'}
        onClose={closeForm}
        onSubmit={formMode === 'edit' && editing ? handleEditSubmit : handleCreate}
        initialValues={
          formMode === 'edit' && editing
            ? {
                name: editing.name,
                app_instance_id: editing.app_instance_id,
                channel_id: editing.channel_id,
                event_types: editing.event_types,
                description: editing.description ?? undefined,
                enabled: editing.enabled,
              }
            : undefined
        }
      />
    </div>
  )
}
