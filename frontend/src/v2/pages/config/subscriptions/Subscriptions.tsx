// frontend/src/v2/pages/config/subscriptions/Subscriptions.tsx
//
// 订阅列表页（L0）。
// 接口：GET /api/v1/subscriptions
// 对齐后端：app/interfaces/api/v1/subscriptions.py
//
// drop-frontend: type(指标/查询/应用/事件) / target / schedule / owner / last_triggered_at
//   — demo 字段，后端无对应，见 plan §3.4。

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Dialog, Input, Select, SkeletonRows, Switch, Table, useToast, type TableColumn, useConfirm } from '@v2/components/ui'
import { CreateButton } from '@v2/components/CommonControls'
import { PeekPanel } from '@v2/components/PeekPanel'
import { t } from '@v2/i18n'
import { fmtRelative } from '@v2/lib/format'
import {
  useSubscriptions,
  useCreateSubscription,
  useDeleteSubscription,
  useTriggerSubscription,
  useUpdateSubscription,
} from '@v2/hooks/subscriptions'
import { useChannels } from '@v2/hooks/channels'
import type { Subscription, CreateSubscriptionPayload } from '@v2/api/subscriptions'
import type { Channel, ChannelType } from '@v2/api/channels'
import {
  SubscriptionDetailContent,
  formatSubscriptionAppInstanceName,
  formatSubscriptionAppInstanceOption,
} from '../_shared/subscription-content'
import { eventTypeLabel, SUBSCRIPTION_EVENT_OPTIONS } from '../_shared/event-labels'
import { CHANNEL_TYPE_LABEL } from '../_shared/channel-content'
import { useInstances } from '@v2/hooks/instances'

// ============================================================================
// 创建 / 编辑表单
// ============================================================================

function SubscriptionFormDialog({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode,
  onCreateChannel,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (payload: CreateSubscriptionPayload) => Promise<void>
  initialValues?: Partial<CreateSubscriptionPayload>
  mode: 'create' | 'edit'
  onCreateChannel?: () => void
}) {
  const { data: channelData } = useChannels()
  const { data: instanceData, isLoading: instancesLoading } = useInstances({ page: 1, page_size: 50 })
  const channels = channelData?.items ?? []
  const instances = instanceData?.items ?? []

  const [name, setName] = useState(initialValues?.name ?? '')
  const [appInstanceId, setAppInstanceId] = useState(String(initialValues?.app_instance_id ?? ''))
  const [channelId, setChannelId] = useState(String(initialValues?.channel_id ?? ''))
  const [eventTypes, setEventTypes] = useState<string[]>(initialValues?.event_types ?? [])
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialValues?.name ?? '')
    setAppInstanceId(String(initialValues?.app_instance_id ?? ''))
    setChannelId(String(initialValues?.channel_id ?? ''))
    setEventTypes(initialValues?.event_types ?? [])
    setDescription(initialValues?.description ?? '')
    setEnabled(initialValues?.enabled ?? true)
  }, [initialValues, open])

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
      await onSubmit({
        name,
        app_instance_id: Number(appInstanceId),
        channel_id: Number(channelId),
        event_types: eventTypes,
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
              {t('subscription.field.appInstanceId', '应用实例')} *
            </label>
            <Select
              id="sub-instance"
              value={appInstanceId}
              onChange={(e) => setAppInstanceId(e.target.value)}
              required
              disabled={mode === 'edit'}
            >
              <option value="">
                {instancesLoading
                  ? t('subscription.form.instanceLoading', '正在加载应用实例…')
                  : t('subscription.form.instancePlaceholder', '— 选择应用实例 —')}
              </option>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {formatSubscriptionAppInstanceOption(instance)}
                </option>
              ))}
            </Select>
            {instances.length === 0 && !instancesLoading ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('subscription.form.noInstances', '暂无可订阅的应用实例，先在应用中心创建实例')}
              </p>
            ) : null}
            {mode === 'edit' ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('subscription.form.instanceImmutableHint', '订阅创建后不修改关联实例，需要变更时请新建订阅')}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="sub-channel" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('subscription.field.channelId', '推送渠道')} *
            </label>
            <Select
              id="sub-channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              required
            >
              <option value="">{t('subscription.form.channelPlaceholder', '— 选择渠道 —')}</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatChannelOption(c)}
                </option>
              ))}
            </Select>
            {channels.length === 0 ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('subscription.form.noChannels', '暂无渠道，先创建飞书或 Webhook 渠道')}
                {onCreateChannel ? (
                  <button
                    type="button"
                    className="ml-1 underline"
                    onClick={onCreateChannel}
                    style={{ color: 'var(--accent)' }}
                  >
                    {t('subscription.form.createChannelLink', '去创建')}
                  </button>
                ) : null}
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
          <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
            {t('subscription.form.eventTypesHint', '至少选择一个事件类型')}
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
            disabled={submitting || eventTypes.length === 0}
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

export default function Subscriptions() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const { data, isLoading } = useSubscriptions()
  const rows = useMemo(() => data?.items ?? [], [data])

  const updateMutation = useUpdateSubscription()
  const createMutation = useCreateSubscription()
  const deleteMutation = useDeleteSubscription()
  const triggerMutation = useTriggerSubscription()

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
    if (!(await confirm({ title: t('subscription.confirm.delete', '删除订阅「{name}」？', { name: row.name }), tone: 'danger' }))) return
    await deleteMutation.mutateAsync(row.id)
    toast.show({ tone: 'warning', title: t('subscription.toast.deleted', '已删除'), description: row.name })
    if (peekRow?.id === row.id) setPeekRow(null)
  }

  const handleToggle = async (row: Subscription) => {
    await updateMutation.mutateAsync({ id: row.id, payload: { enabled: !row.enabled } })
  }

  const handleTrigger = async (row: Subscription) => {
    const result = await triggerMutation.mutateAsync({ id: row.id })
    const detail = result.details[0]
    toast.show({
      tone: result.successful > 0 ? 'success' : 'warning',
      title: result.successful > 0
        ? t('subscription.toast.triggered', '已立即触发')
        : t('subscription.toast.triggerFailed', '触发失败'),
      description: detail?.error ?? detail?.detail ?? row.name,
    })
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
          onClick={(event) => {
            event.stopPropagation()
            setPeekRow(r)
          }}
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
            <Chip key={et} tone="violet">
              <span title={et}>{eventTypeLabel(et)}</span>
            </Chip>
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
      width: 190,
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate" style={{ color: 'var(--text-2)' }}>
            {formatSubscriptionAppInstanceName(r.app_instance)}
          </div>
        </div>
      ),
    },
    {
      key: 'channel_id',
      title: t('subscription.field.channelId', '渠道'),
      width: 110,
      render: (r) => (
        <span style={{ color: 'var(--text-2)' }}>
          {r.channel?.name ?? t('subscription.channel.unknown', '未知渠道')}
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
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('subscription.page.title', '订阅')}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('subscription.page.subtitle', '将应用实例事件按需推送到配置渠道')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="neutral">
            {t('subscription.stats.enabled', '启用 {enabledCount} / {total}', {
              enabledCount,
              total: rows.length,
            })}
          </Chip>
          <CreateButton label={t('subscription.action.create', '新建订阅')} onClick={openCreate} />
        </div>
      </header>

      {/* ── 列表 ── */}
      <div className="relative flex flex-1 overflow-hidden">
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
              activeKey={peekRow?.id}
              onRowClick={(r) => setPeekRow(r)}
              emptyText={t('subscription.empty', '暂无订阅，点击「新建订阅」创建')}
            />
          )}
        </div>

        <PeekPanel
          open={!!peekRow}
          onClose={() => setPeekRow(null)}
          onOpenFull={peekRow ? () => navigate(`/config/subscriptions/${peekRow.id}`) : undefined}
          title={peekRow?.name ?? t('subscription.peek.title', '订阅详情')}
          subtitle={peekRow ? formatSubscriptionAppInstanceName(peekRow.app_instance) : undefined}
          badges={
            peekRow ? (
              <Chip tone={peekRow.enabled ? 'success' : 'neutral'}>
                {peekRow.enabled ? t('common.enabled', '启用') : t('common.disabled', '已停')}
              </Chip>
            ) : null
          }
          size="narrow"
          footer={
            peekRow ? (
              <button
                type="button"
                className="btn btn-sm btn-primary w-full"
                onClick={() => navigate(`/config/subscriptions/${peekRow.id}`)}
              >
                {t('action.view_detail', '查看详情')}
              </button>
            ) : null
          }
        >
          {peekRow ? (
            <SubscriptionDetailContent
              row={peekRow}
              actions={{
                onTrigger: () => void handleTrigger(peekRow),
                onToggle: () => void handleToggle(peekRow),
                onJumpChannel: () => navigate(`/config/channels/${peekRow.channel_id}`),
                onEdit: () => openEdit(peekRow),
                onDelete: () => void handleDelete(peekRow),
              }}
            />
          ) : null}
        </PeekPanel>
      </div>

      {/* ── 创建 / 编辑表单 ── */}
      <SubscriptionFormDialog
        open={formMode != null}
        mode={formMode ?? 'create'}
        onClose={closeForm}
        onCreateChannel={() => {
          closeForm()
          navigate('/config/channels/new')
        }}
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

function formatChannelOption(channel: Channel): string {
  const rawType = channel.channel_type ?? (channel as Channel & { type?: ChannelType }).type
  const typeLabel = rawType ? CHANNEL_TYPE_LABEL[rawType] ?? rawType : t('channel.field.type', '渠道')
  const status = channel.enabled ? t('common.enabled', '启用') : t('common.disabled', '已停')
  return `${channel.name} · ${typeLabel} · ${status}`
}
