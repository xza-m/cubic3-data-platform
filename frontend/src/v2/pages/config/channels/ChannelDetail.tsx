// frontend/src/v2/pages/config/channels/ChannelDetail.tsx
//
// 渠道详情页（L3）。
// 接口：GET /api/v1/channels/:id  PUT  DELETE  POST enable/disable
// 对齐后端：app/interfaces/api/v1/channels.py

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Send, XCircle } from 'lucide-react'
import { Chip, Dialog, Input, Skeleton, Switch, useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import {
  useChannel,
  useChannels,
  useDeleteChannel,
  useUpdateChannel,
  useTestChannel,
} from '@v2/hooks/channels'
import type { Channel, CreateChannelPayload, ChannelTestResult } from '@v2/api/channels'
import {
  CHANNEL_TYPE_LABEL,
  channelTypeChip,
  channelTabLabel,
  ChannelDetailContent,
  ChannelContextBody,
} from '../_shared/channel-content'

// TODO: 等待 X-Crosscut 提供 useAppShell 布局 hook —— 当前用 document.title 占位
// import { useAppShell } from '@v2/layout/AppShell'

export default function ChannelDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()

  const { data: channel, isLoading } = useChannel(numericId)
  const { data: listData } = useChannels()
  const rows = listData?.items ?? []

  const updateMutation = useUpdateChannel()
  const deleteMutation = useDeleteChannel()
  const testMutation = useTestChannel()
  const [editing, setEditing] = useState(false)
  const [testResult, setTestResult] = useState<ChannelTestResult | null>(null)

  // 更新 document title（X-Crosscut openTab 就绪后替换）
  useEffect(() => {
    if (channel) document.title = `${channel.name} · 渠道`
  }, [channel])

  // 邻接导航
  const neighbors = useMemo(() => {
    if (!channel || rows.length === 0) return { prev: null, next: null }
    const idx = rows.findIndex((r) => r.id === channel.id)
    return { prev: rows[idx - 1] ?? null, next: rows[idx + 1] ?? null }
  }, [rows, channel])

  const handleUpdate = async (payload: CreateChannelPayload) => {
    if (!channel) return
    await updateMutation.mutateAsync({ id: channel.id, payload })
    toast.show({ tone: 'success', title: t('channel.toast.updated', '已保存修改'), description: channel.name })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!channel) return
    if (!window.confirm(t('channel.confirm.delete', `删除渠道「${channel.name}」？`))) return
    await deleteMutation.mutateAsync(channel.id)
    toast.show({ tone: 'warning', title: t('channel.toast.deleted', '已删除'), description: channel.name })
    navigate('/config/channels')
  }

  const handleToggle = async () => {
    if (!channel) return
    const payload = { enabled: !channel.enabled }
    await updateMutation.mutateAsync({ id: channel.id, payload })
  }

  const handleTest = async () => {
    if (!channel) return
    setTestResult(null)
    const result = await testMutation.mutateAsync(channel.id)
    setTestResult(result)
    if (result.ok) {
      toast.show({ tone: 'success', title: t('channel.toast.testOk', '测试发送成功'), description: channel.name })
    } else {
      toast.show({ tone: 'danger', title: t('channel.toast.testFailed', '测试发送失败'), description: result.message })
    }
  }

  // ── 守门 ──
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('channel.error.invalidId', '非法的渠道 ID')}
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

  if (!channel) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500">
        {t('channel.error.notFound', `未找到渠道 #${numericId}`)}
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
              onClick={() => navigate('/config/channels')}
              className="inline-flex items-center gap-1 text-xs hover:underline focus-visible:ring-2"
              style={{ color: 'var(--text-3)' }}
            >
              <ArrowLeft size={11} aria-hidden />
              {t('channel.nav.backToList', '返回渠道列表')}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ background: 'var(--accent)' }}
              aria-hidden
            >
              CH
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {channel.name}
                </span>
                {channelTypeChip(channel.channel_type)}
                {channel.enabled
                  ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
                  : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>}
              </div>
              <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                {t('common.updatedAt', '更新时间')}：{fmtRelative(channel.updated_at)}
              </p>
            </div>
            {/* 顶栏操作 */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[color:var(--bg-hover)] focus-visible:ring-2"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('common.edit', '编辑')}
              </button>
              {/* P12: 测试发送 — POST /api/v1/channels/:id/test */}
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={testMutation.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 disabled:opacity-50"
              >
                <Send size={11} aria-hidden />
                {testMutation.isPending ? t('common.testing', '测试中…') : t('channel.action.test', '发送测试')}
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {testResult && (
            <TestResultBanner result={testResult} onClose={() => setTestResult(null)} />
          )}
          <ChannelDetailContent
            row={channel}
            actions={{
              onTest: () => void handleTest(),
              onToggle: () => void handleToggle(),
              onEdit: () => setEditing(true),
              onDelete: () => void handleDelete(),
            }}
          />
        </div>
      </div>

      {/* ── 右侧 Context Panel ── */}
      {/* TODO: 等待 X-Crosscut setContextPanel — 当前内联渲染 */}
      <aside
        className="hidden w-56 shrink-0 border-l xl:block"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          <div className="truncate text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {channel.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {CHANNEL_TYPE_LABEL[channel.channel_type]}
          </div>
        </div>
        <ChannelContextBody
          row={channel}
          neighbors={neighbors}
          onNavigate={(nextId) => navigate(`/config/channels/${nextId}`)}
        />
      </aside>

      {/* ── 编辑表单 ── */}
      <ChannelEditDialog
        open={editing}
        channel={channel}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
      />
    </div>
  )
}

// ============================================================================
// 测试结果横幅（P12）— 对齐 W2 DatasourceDetail TestResultBanner 设计语言
// ============================================================================

function TestResultBanner({
  result,
  onClose,
}: {
  result: ChannelTestResult
  onClose: () => void
}) {
  return (
    <div
      className="mx-4 mt-4 flex items-start gap-3 rounded-lg border p-3"
      style={{
        background: result.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
        borderColor: result.ok ? 'var(--success)' : 'var(--danger)',
      }}
      role="alert"
    >
      {result.ok ? (
        <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
      ) : (
        <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
      )}
      <div className="flex-1 text-xs">
        <div className="font-semibold" style={{ color: result.ok ? 'var(--success)' : 'var(--danger)' }}>
          {result.ok ? '发送成功' : '发送失败'}
          {result.latency_ms > 0 && (
            <span className="ml-2 font-normal" style={{ color: 'var(--text-3)' }}>
              耗时 {result.latency_ms} ms
            </span>
          )}
        </div>
        <div className="mt-0.5" style={{ color: 'var(--text-2)' }}>{result.message}</div>
        {result.error_code && (
          <div className="mt-1" style={{ color: 'var(--text-3)' }}>
            错误码：<code>{result.error_code}</code>
          </div>
        )}
        <div className="mt-0.5" style={{ color: 'var(--text-3)' }}>
          {fmtDateTime(result.sent_at)}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-xs hover:underline focus-visible:ring-2"
        style={{ color: 'var(--text-3)', flexShrink: 0 }}
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  )
}

// ============================================================================
// 编辑表单（内联，待 X-Crosscut EntityFormDialog 替换）
// ============================================================================

function ChannelEditDialog({
  open,
  channel,
  onClose,
  onSubmit,
}: {
  open: boolean
  channel: Channel
  onClose: () => void
  onSubmit: (payload: CreateChannelPayload) => Promise<void>
}) {
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description ?? '')
  const [enabled, setEnabled] = useState(channel.enabled)
  const [submitting, setSubmitting] = useState(false)

  // 同步 channel prop 变化
  useEffect(() => {
    setName(channel.name)
    setDescription(channel.description ?? '')
    setEnabled(channel.enabled)
  }, [channel])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({
        name,
        channel_type: channel.channel_type,
        description: description || undefined,
        config: channel.config,
        enabled,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('channel.form.editTitle', '编辑渠道')}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div>
          <label htmlFor="edit-ch-name" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.name', '名称')} *
          </label>
          <Input
            id="edit-ch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="edit-ch-desc" className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
            {t('common.description', '描述')}
          </label>
          <Input
            id="edit-ch-desc"
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
            disabled={submitting}
            className="rounded-md bg-[color:var(--accent)] px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t('common.saving', '保存中…') : t('common.save', '保存修改')}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// suppress unused imports from shared module
void channelTabLabel
void fmtRelative
