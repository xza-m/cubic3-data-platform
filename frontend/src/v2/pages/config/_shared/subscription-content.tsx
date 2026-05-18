// frontend/src/v2/pages/config/_shared/subscription-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// 订阅详情内容组件 —— Peek panel 与 L3 Detail 共用。
// 对齐后端：app/domain/entities/config/subscription.py
//
// drop-frontend: type(指标/查询/应用/事件) / target / schedule / owner / last_triggered_at
//   — demo 有但后端无此字段，见 plan §3.4。
//   后端使用 event_types(数组) / app_instance_id / channel_id / delivery_config 代替。

import type { ReactNode } from 'react'
import { Edit3, ExternalLink, PauseCircle, Play, PlayCircle, Trash2 } from 'lucide-react'
import { ActionIconButton } from '@v2/components/ActionIconButton'
import { IdentityName } from '@v2/components/IdentityName'
import { Chip } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import type { Subscription } from '@v2/api/subscriptions'
import { eventTypeLabel } from './event-labels'

// ============================================================================
// Tab label
// ============================================================================

export function subscriptionTabLabel(row: Subscription): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span className="truncate">{row.name}</span>
      <Chip tone={row.enabled ? 'success' : 'neutral'}>
        {row.enabled ? t('common.enabled', '启用') : t('common.disabled', '已停')}
      </Chip>
    </span>
  )
}

// ============================================================================
// 操作接口
// ============================================================================

export interface SubscriptionActions {
  onTrigger?: () => void
  onToggle?: () => void
  onJumpChannel?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

// ============================================================================
// 详情内容体（Peek / Detail 共用）
// ============================================================================

export function SubscriptionDetailContent({
  row,
  actions,
}: {
  row: Subscription
  actions?: SubscriptionActions
}) {
  const hasActions = Boolean(
    actions?.onTrigger ||
    actions?.onToggle ||
    actions?.onJumpChannel ||
    actions?.onEdit ||
    actions?.onDelete,
  )

  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionIconButton
            label={t('subscription.action.triggerFull', '立即触发此订阅')}
            icon={Play}
            variant="primary"
            onClick={actions?.onTrigger}
          />
          <ActionIconButton
            label={
              row.enabled
                ? t('subscription.action.pause', '暂停')
                : t('subscription.action.enable', '启用')
            }
            icon={row.enabled ? PauseCircle : PlayCircle}
            onClick={actions?.onToggle}
          />
          {actions?.onJumpChannel ? (
            <ActionIconButton
              label={t('subscription.action.viewChannel', '查看渠道')}
              icon={ExternalLink}
              onClick={actions.onJumpChannel}
            />
          ) : null}
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

      <DetailSection title={t('subscription.section.basic', '基础信息')}>
        <DetailRow label={t('common.id', '编号')} value={<code>#{row.id}</code>} />
        <DetailRow label={t('common.name', '名称')} value={row.name} />
        <DetailRow
          label={t('common.status', '状态')}
          value={
            row.enabled
              ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
              : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>
          }
        />
        <DetailRow
          label={t('subscription.field.appInstanceId', '应用实例')}
          value={
            row.app_instance
              ? <code>{row.app_instance.app_name ?? row.app_instance.app_code} #{row.app_instance_id}</code>
              : <code>#{row.app_instance_id}</code>
          }
        />
        <DetailRow
          label={t('subscription.field.channelId', '渠道')}
          value={
            row.channel
              ? <code>{row.channel.name} #{row.channel_id}</code>
              : <code>#{row.channel_id}</code>
          }
        />
        <DetailRow
          label={t('common.createdBy', '创建人')}
          value={<IdentityName value={row.created_by} displayName={row.created_by_display_name} />}
        />
        <DetailRow label={t('common.updatedAt', '更新时间')} value={fmtRelative(row.updated_at)} />
        <DetailRow label={t('common.createdAt', '创建时间')} value={fmtDateTime(row.created_at)} />
      </DetailSection>

      {row.description ? (
        <DetailSection title={t('common.description', '描述')}>
          <p style={{ color: 'var(--text-2)' }}>{row.description}</p>
        </DetailSection>
      ) : null}

      <DetailSection title={t('subscription.section.eventTypes', '订阅事件')}>
        {row.event_types.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.event_types.map((et) => (
              <Chip key={et} tone="violet">
                <span title={et}>{eventTypeLabel(et)}</span>
              </Chip>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>—</span>
        )}
      </DetailSection>

      {Object.keys(row.filter_conditions ?? {}).length > 0 ? (
        <DetailSection title={t('subscription.section.filterConditions', '过滤条件')}>
          <pre
            className="overflow-auto rounded border p-2 text-xs leading-4"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {JSON.stringify(row.filter_conditions, null, 2)}
          </pre>
        </DetailSection>
      ) : null}

      {Object.keys(row.delivery_config ?? {}).length > 0 ? (
        <DetailSection title={t('subscription.section.deliveryConfig', '投递配置')}>
          <pre
            className="overflow-auto rounded border p-2 text-xs leading-4"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {JSON.stringify(row.delivery_config, null, 2)}
          </pre>
        </DetailSection>
      ) : null}
    </div>
  )
}

// ============================================================================
// Context Panel 摘要（详情页右侧）
// ============================================================================

export function SubscriptionContextBody({
  row,
  neighbors,
  channelId,
  onNavigate,
  onJumpChannel,
}: {
  row: Subscription
  neighbors: { prev: Subscription | null; next: Subscription | null }
  channelId: number | null
  onNavigate: (id: number) => void
  onJumpChannel?: () => void
}) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('common.status', '状态')}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {row.enabled
            ? <Chip tone="success">{t('common.enabled', '启用')}</Chip>
            : <Chip tone="neutral">{t('common.disabled', '已停')}</Chip>}
        </div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          {t('subscription.section.eventTypes', '订阅事件')}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {row.event_types.length > 0
            ? row.event_types.map((et) => (
                <Chip key={et} tone="violet">
                  <span title={et}>{eventTypeLabel(et)}</span>
                </Chip>
              ))
            : <span style={{ color: 'var(--text-3)' }}>—</span>}
        </div>
      </section>
      {channelId ? (
        <section>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            {t('subscription.section.channel', '关联渠道')}
          </div>
          <div className="mt-2">
            <NeighborButton
              label={`→ ${row.channel?.name ?? `渠道 #${channelId}`}`}
              onClick={onJumpChannel}
            />
          </div>
        </section>
      ) : null}
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
