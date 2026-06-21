// frontend/src/v2/pages/config/_shared/channel-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// 渠道详情内容组件 —— Peek panel 与 L3 Detail 共用。
// 对齐后端：app/domain/entities/config/channel.py
//
// drop-frontend: owner / success_rate / last_sent_at / endpoint 字段
//   — demo 有但后端无此字段，见 plan §3.4。
// drop-frontend: dingtalk / sms 渠道类型
//   — 后端 ChannelType 只有 feishu / email / webhook / oss。

import type { ReactNode } from 'react'
import { Edit3, Power, PowerOff, Send, Trash2 } from 'lucide-react'
import { ActionIconButton } from '@v2/components/ActionIconButton'
import { IdentityName } from '@v2/components/IdentityName'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'
import { Chip, type ChipTone } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import type { Channel, ChannelType } from '@v2/api/channels'

// ============================================================================
// 渠道类型元数据（对齐后端 ChannelType）
// ============================================================================

export const CHANNEL_TYPE_LABEL: Record<ChannelType, string> = {
  feishu: t('channel.type.feishu', '飞书'),
  email: t('channel.type.email', '邮件'),
  webhook: t('channel.type.webhook', 'Webhook'),
  oss: t('channel.type.oss', 'OSS'),
}

export const CHANNEL_TYPE_TONE: Record<ChannelType, ChipTone> = {
  feishu: 'violet',
  email: 'neutral',
  webhook: 'success',
  oss: 'accent',
}

export function channelTypeChip(type: ChannelType): ReactNode {
  return (
    <Chip tone={CHANNEL_TYPE_TONE[type] ?? 'neutral'}>
      {CHANNEL_TYPE_LABEL[type] ?? t('channel.type.unknown', '未知渠道')}
    </Chip>
  )
}

export function channelTabLabel(row: Channel): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span className="truncate">{row.name}</span>
      {channelTypeChip(row.channel_type)}
    </span>
  )
}

// ============================================================================
// 操作接口
// ============================================================================

export interface ChannelActions {
  onTest?: () => void
  onToggle?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

// ============================================================================
// 详情内容体（Peek / Detail 共用）
// ============================================================================

export function ChannelDetailContent({
  row,
  actions,
}: {
  row: Channel
  actions?: ChannelActions
}) {
  const hasActions = Boolean(actions?.onTest || actions?.onToggle || actions?.onEdit || actions?.onDelete)

  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionIconButton
            label={t('channel.action.sendTest', '发送测试消息')}
            icon={Send}
            variant="primary"
            onClick={actions?.onTest}
          />
          <ActionIconButton
            label={row.enabled ? t('channel.action.disable', '禁用') : t('channel.action.enable', '启用')}
            icon={row.enabled ? PowerOff : Power}
            onClick={actions?.onToggle}
          />
          {actions?.onEdit ? (
            <ActionIconButton
              label={t('common.edit', '编辑')}
              icon={Edit3}
              onClick={actions.onEdit}
            />
          ) : null}
          {actions?.onDelete ? (
            <ActionIconButton
              label={t('common.delete', '删除')}
              icon={Trash2}
              variant="danger"
              onClick={actions.onDelete}
            />
          ) : null}
        </div>
      ) : null}

      <DetailSection title={t('channel.section.basic', '基础信息')}>
        <DetailRow label={t('common.name', '名称')} value={row.name} />
        <DetailRow label={t('channel.field.type', '类型')} value={channelTypeChip(row.channel_type)} />
        <DetailRow
          label={t('common.status', '状态')}
          value={
            row.enabled
              ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
              : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>
          }
        />
        <DetailRow
          label={t('common.createdBy', '创建人')}
          value={<IdentityName value={row.created_by} displayName={row.created_by_display_name} />}
        />
        <DetailRow
          label={t('common.updatedAt', '更新时间')}
          value={fmtRelative(row.updated_at)}
        />
        <DetailRow
          label={t('common.createdAt', '创建时间')}
          value={fmtDateTime(row.created_at)}
        />
      </DetailSection>

      {row.description ? (
        <DetailSection title={t('common.description', '描述')}>
          <p style={{ color: 'var(--text-2)' }}>{row.description}</p>
        </DetailSection>
      ) : null}

      <DetailSection title={t('channel.section.config', '渠道配置')}>
        <StructuredDetails
          title={t('channel.config.detailTitle', '查看配置详情')}
          value={row.config}
          summary={channelConfigSummary(row)}
        />
      </DetailSection>
    </div>
  )
}

// ============================================================================
// 列表页 Context Panel 的摘要（右侧邻接导航）
// ============================================================================

export function ChannelContextBody({
  row,
  neighbors,
  onNavigate,
}: {
  row: Channel
  neighbors: { prev: Channel | null; next: Channel | null }
  onNavigate: (id: number) => void
}) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('common.status', '状态')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {channelTypeChip(row.channel_type)}
          {row.enabled
            ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
            : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>}
        </div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('common.meta', '元数据')}
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <CtxPair
            label={t('common.createdBy', '创建人')}
            value={<IdentityName value={row.created_by} displayName={row.created_by_display_name} />}
          />
          <CtxPair label={t('common.updatedAt', '更新')} value={fmtRelative(row.updated_at)} />
        </dl>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('common.neighbors', '邻接导航')}
        </div>
        <div className="mt-2 space-y-1.5">
          <NeighborButton
            label={neighbors.prev ? `← ${neighbors.prev.name}` : t('common.noPrev', '没有上一项')}
            disabled={!neighbors.prev}
            onClick={neighbors.prev ? () => onNavigate(neighbors.prev!.id) : undefined}
          />
          <NeighborButton
            label={neighbors.next ? `${neighbors.next.name} →` : t('common.noNext', '没有下一项')}
            disabled={!neighbors.next}
            onClick={neighbors.next ? () => onNavigate(neighbors.next!.id) : undefined}
          />
        </div>
      </section>
    </div>
  )
}

// ============================================================================
// 内部原子组件
// ============================================================================

function DetailSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {title}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>{value}</dd>
    </div>
  )
}

function channelConfigSummary(row: Channel): string {
  const config = row.config ?? {}
  const keyCount = Object.keys(config).length
  const target =
    row.channel_type === 'email'
      ? t('channel.config.emailTarget', '收件人配置')
      : row.channel_type === 'oss'
        ? t('channel.config.ossTarget', '存储桶配置')
        : t('channel.config.webhookTarget', 'Webhook 配置')
  return `${CHANNEL_TYPE_LABEL[row.channel_type]} · ${target} · ${t('channel.config.keyCount', '{count} 项', { count: keyCount })}`
}

function CtxPair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>{value}</dd>
    </div>
  )
}

function NeighborButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-1)] focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
