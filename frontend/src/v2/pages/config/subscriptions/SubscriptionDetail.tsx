// frontend/src/v2/pages/config/subscriptions/SubscriptionDetail.tsx
//
// 订阅详情页（L3）。
// 接口：GET /api/v1/subscriptions/:id  PUT  DELETE  POST enable/disable
// 对齐后端：app/interfaces/api/v1/subscriptions.py

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Edit3, ExternalLink, PauseCircle, Play, PlayCircle, Trash2 } from 'lucide-react'
import { Chip, Dialog, Input, Skeleton, Switch, useToast, useConfirm } from '@v2/components/ui'
import { ActionIconButton } from '@v2/components/ActionIconButton'
import { RefreshButton } from '@v2/components/CommonControls'
import { t } from '@v2/i18n'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import {
  useSubscription,
  useSubscriptions,
  useDeleteSubscription,
  useTriggerSubscription,
  useUpdateSubscription,
  useSubscriptionHistory,
} from '@v2/hooks/subscriptions'
import type { Subscription, UpdateSubscriptionPayload, SubscriptionHistoryItem } from '@v2/api/subscriptions'
import {
  subscriptionTabLabel,
  SubscriptionDetailContent,
  SubscriptionContextBody,
} from '../_shared/subscription-content'
import { eventTypeLabel, SUBSCRIPTION_EVENT_OPTIONS } from '../_shared/event-labels'

// TODO: 等待 X-Crosscut 提供 useAppShell 布局 hook —— 当前用 document.title 占位
// import { useAppShell } from '@v2/layout/AppShell'

type SubTabId = 'overview' | 'history'

function buildSubTabs(): { id: SubTabId; label: string }[] {
  return [
    { id: 'overview', label: t('subscriptionDetail.tab.overview', '概览') },
    { id: 'history',  label: t('subscriptionDetail.tab.history', '触发历史') },
  ]
}

export default function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [subTab, setSubTab] = useState<SubTabId>('overview')

  const { data: subscription, isLoading } = useSubscription(numericId)
  const { data: listData } = useSubscriptions()
  const rows = useMemo(() => listData?.items ?? [], [listData])
  const {
    data: historyData,
    isLoading: historyLoading,
    isFetching: historyFetching,
    refetch: refetchHistory,
  } = useSubscriptionHistory(numericId)

  const updateMutation = useUpdateSubscription()
  const deleteMutation = useDeleteSubscription()
  const triggerMutation = useTriggerSubscription()
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (subscription) document.title = `${subscription.name} · ${t('subscriptionDetail.titleSuffix', '订阅')}`
  }, [subscription])

  // 邻接导航
  const neighbors = useMemo(() => {
    if (!subscription || rows.length === 0) return { prev: null, next: null }
    const idx = rows.findIndex((r) => r.id === subscription.id)
    return { prev: rows[idx - 1] ?? null, next: rows[idx + 1] ?? null }
  }, [rows, subscription])

  const handleUpdate = async (payload: UpdateSubscriptionPayload) => {
    if (!subscription) return
    await updateMutation.mutateAsync({ id: subscription.id, payload })
    toast.show({ tone: 'success', title: t('subscription.toast.updated', '已保存修改'), description: subscription.name })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!subscription) return
    if (!(await confirm({ title: t('subscription.confirm.delete', '删除订阅「{name}」？', { name: subscription.name }), tone: 'danger' }))) return
    await deleteMutation.mutateAsync(subscription.id)
    toast.show({ tone: 'warning', title: t('subscription.toast.deleted', '已删除'), description: subscription.name })
    navigate('/config/subscriptions')
  }

  const handleToggle = async () => {
    if (!subscription) return
    await updateMutation.mutateAsync({ id: subscription.id, payload: { enabled: !subscription.enabled } })
    toast.show({
      tone: subscription.enabled ? 'warning' : 'success',
      title: subscription.enabled
        ? t('subscription.toast.disabled', '已停用')
        : t('subscription.toast.enabled', '已启用'),
      description: subscription.name,
    })
  }

  const handleTrigger = async () => {
    if (!subscription) return
    const result = await triggerMutation.mutateAsync({ id: subscription.id })
    const detail = result.details[0]
    toast.show({
      tone: result.successful > 0 ? 'success' : 'warning',
      title: result.successful > 0
        ? t('subscription.toast.triggered', '已立即触发')
        : t('subscription.toast.triggerFailed', '触发失败'),
      description: detail?.error ?? detail?.detail ?? subscription.name,
    })
  }

  // ── 守门 ──
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('subscription.error.invalidId', '非法的订阅 ID')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500">
        {t('subscription.error.notFound', '未找到订阅 #{id}', { id: numericId })}
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── 主内容 ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header
          className="border-b px-4 py-3"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="mb-2 flex items-center gap-2">
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
          <div className="flex items-center gap-3">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: 'var(--accent)' }}
              aria-hidden
            >
              SU
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {subscription.name}
                </span>
                {subscription.enabled
                  ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
                  : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>}
              </div>
              <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                {subscription.channel?.name ?? t('subscriptionDetail.channelPrefix', '渠道 #{id}', { id: subscription.channel_id })}
                {' · '}
                {t('common.updatedAt', '更新')}：{fmtRelative(subscription.updated_at)}
              </p>
            </div>
            {/* 顶栏操作（Tabs 移到 header 底部） */}
            <div className="flex shrink-0 items-center gap-1.5">
              <ActionIconButton
                label={t('subscription.action.triggerFull', '立即触发此订阅')}
                icon={Play}
                variant="primary"
                loading={triggerMutation.isPending}
                onClick={() => void handleTrigger()}
              />
              <ActionIconButton
                label={subscription.enabled ? t('subscription.action.pause', '停用') : t('subscription.action.enable', '启用')}
                icon={subscription.enabled ? PauseCircle : PlayCircle}
                loading={updateMutation.isPending}
                onClick={() => void handleToggle()}
              />
              <ActionIconButton
                label={t('subscription.action.viewChannel', '查看渠道')}
                icon={ExternalLink}
                onClick={() => navigate(`/config/channels/${subscription.channel_id}`)}
              />
              <ActionIconButton
                label={t('common.edit', '编辑')}
                icon={Edit3}
                onClick={() => setEditing(true)}
              />
              <ActionIconButton
                label={t('common.delete', '删除')}
                icon={Trash2}
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => void handleDelete()}
              />
            </div>
          </div>
        </header>

        {/* Sub-tabs */}
        <div
          role="tablist"
          aria-label={t('subscriptionDetail.tabsLabel', '订阅详情视图')}
          className="flex items-center gap-1 border-b px-4 pb-0 pt-2"
          style={{ borderColor: 'var(--border)' }}
        >
          {buildSubTabs().map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={subTab === tab.id}
              onClick={() => setSubTab(tab.id)}
              className="rounded-t px-2.5 py-1 text-xs"
              style={{
                background: subTab === tab.id ? 'var(--accent-soft)' : 'transparent',
                color: subTab === tab.id ? 'var(--accent)' : 'var(--text-3)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {subTab === 'overview' && (
            <SubscriptionDetailContent
              row={subscription}
            />
          )}
          {subTab === 'history' && (
            <HistoryTab
              items={historyData?.items ?? []}
              total={historyData?.total ?? 0}
              isLoading={historyLoading}
              isRefreshing={historyFetching}
              onRefresh={() => refetchHistory()}
            />
          )}
        </div>
      </div>

      {/* ── 右侧 Context Panel ── */}
      {/* TODO: 等待 X-Crosscut setContextPanel */}
      <aside
        className="hidden w-56 shrink-0 border-l xl:block"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <div className="truncate text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {subscription.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {subscription.channel?.name ?? `#${subscription.channel_id}`}
          </div>
        </div>
        <SubscriptionContextBody
          row={subscription}
          neighbors={neighbors}
          channelId={subscription.channel_id}
          onNavigate={(nextId) => navigate(`/config/subscriptions/${nextId}`)}
          onJumpChannel={() => navigate(`/config/channels/${subscription.channel_id}`)}
        />
      </aside>

      {/* ── 编辑表单 ── */}
      <SubscriptionEditDialog
        open={editing}
        subscription={subscription}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
      />
    </div>
  )
}

// ============================================================================
// 编辑表单（内联，待 X-Crosscut EntityFormDialog 替换）
// ============================================================================

function SubscriptionEditDialog({
  open,
  subscription,
  onClose,
  onSubmit,
}: {
  open: boolean
  subscription: Subscription
  onClose: () => void
  onSubmit: (payload: UpdateSubscriptionPayload) => Promise<void>
}) {
  const [name, setName] = useState(subscription.name)
  const [eventTypes, setEventTypes] = useState<string[]>(subscription.event_types)
  const [description, setDescription] = useState(subscription.description ?? '')
  const [enabled, setEnabled] = useState(subscription.enabled)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setName(subscription.name)
    setEventTypes(subscription.event_types)
    setDescription(subscription.description ?? '')
    setEnabled(subscription.enabled)
  }, [subscription])

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
        event_types: eventTypes,
        description: description || undefined,
        enabled,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('subscription.form.editTitle', '编辑订阅')}>
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div>
          <label htmlFor="edit-sub-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.name', '名称')} *
          </label>
          <Input
            id="edit-sub-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
          <label htmlFor="edit-sub-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.description', '描述')}
          </label>
          <Input
            id="edit-sub-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            {submitting ? t('common.saving', '保存中…') : t('common.saveChanges', '保存修改')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ============================================================================
// 触发历史 Tab（P13）
// ============================================================================

function HistoryTab({
  items,
  total,
  isLoading,
  isRefreshing,
  onRefresh,
}: {
  items: SubscriptionHistoryItem[]
  total: number
  isLoading: boolean
  isRefreshing: boolean
  onRefresh: () => unknown
}) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-xs" style={{ color: 'var(--text-3)' }}>
        {t('common.loading', '加载中…')}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          {t('subscriptionDetail.history.count', '共 {n} 条记录', { n: total })}
        </span>
        <RefreshButton
          onClick={onRefresh}
          loading={isRefreshing}
          ariaLabel={t('subscriptionDetail.history.refresh', '刷新触发历史')}
        />
      </div>

      {items.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}
        >
          {t('subscriptionDetail.history.empty', '暂无触发记录')}
        </div>
      ) : (
        <div className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                {[
                  t('subscriptionDetail.history.col.triggerAt', '触发时间'),
                  t('subscriptionDetail.history.col.status', '状态'),
                  t('subscriptionDetail.history.col.eventType', '事件类型'),
                  t('subscriptionDetail.history.col.message', '消息'),
                  t('subscriptionDetail.history.col.duration', '耗时'),
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-2)' }}>
                    {fmtDateTime(item.trigger_at)}
                  </td>
                  <td className="px-3 py-2">
                    <HistoryStatusChip status={item.status} />
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--text-3)' }}>
                    <span title={item.event_type ?? undefined}>{eventTypeLabel(item.event_type)}</span>
                  </td>
                  <td className="max-w-xs truncate px-3 py-2" style={{ color: 'var(--text-2)' }}>
                    {item.message ?? '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-3)' }}>
                    {item.duration_ms != null ? `${item.duration_ms} ms` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HistoryStatusChip({ status }: { status: SubscriptionHistoryItem['status'] }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    success: { label: t('subscriptionDetail.history.status.success', '成功'), bg: 'var(--success-soft)', color: 'var(--success)' },
    failed:  { label: t('subscriptionDetail.history.status.failed', '失败'),  bg: 'var(--danger-soft)',  color: 'var(--danger)' },
    skipped: { label: t('subscriptionDetail.history.status.skipped', '跳过'), bg: 'var(--bg-surface-2)', color: 'var(--text-3)' },
  }
  const { label, bg, color } = map[status] ?? { label: status, bg: 'var(--bg-surface-2)', color: 'var(--text-3)' }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: bg, color }}>
      {label}
    </span>
  )
}

// suppress unused import
void subscriptionTabLabel
void fmtRelative
