// frontend/src/v2/pages/apps/_shared/instance-content.tsx
//
// 实例详情内容 shared 组件（Peek panel + InstanceDetail 复用）。
// B-back-2: health 字段暂不展示，待后端上线后启用。

import type { ReactNode } from 'react'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'
import type { AppInstance } from '@v2/api/instances'

// ============================================================================
// 工具
// ============================================================================

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {title}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <dt className="shrink-0 text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
      </dt>
      <dd className="truncate text-right text-xs" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

// ============================================================================
// 实例状态 chip
// ============================================================================

export function InstanceStatusChip({ enabled }: { enabled: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-px text-xs font-medium"
      style={{
        background: enabled ? 'var(--success-soft)' : 'var(--bg-surface-2)',
        color: enabled ? 'var(--success)' : 'var(--text-3)',
      }}
    >
      {enabled
        ? t('instance.status.enabled', '运行中')
        : t('instance.status.disabled', '已停止')}
    </span>
  )
}

// ============================================================================
// 执行状态 chip（execution status）
// ============================================================================

export function ExecStatusChip({ status }: { status: string }) {
  const MAP: Record<string, { bg: string; color: string; label: string }> = {
    success: { bg: 'var(--success-soft)', color: 'var(--success)', label: t('exec.status.success', '成功') },
    failed: { bg: 'var(--danger-soft)', color: 'var(--danger)', label: t('exec.status.failed', '失败') },
    running: { bg: 'var(--accent-soft)', color: 'var(--accent)', label: t('exec.status.running', '运行中') },
    pending: { bg: 'var(--bg-surface-2)', color: 'var(--text-3)', label: t('exec.status.pending', '等待中') },
  }
  const s = MAP[status] ?? { bg: 'var(--bg-surface-2)', color: 'var(--text-3)', label: status }
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-px text-xs font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// ============================================================================
// 调度类型 label
// ============================================================================

export function scheduleLabel(type: string): string {
  const MAP: Record<string, string> = {
    manual: t('schedule.manual', '手动'),
    cron: t('schedule.cron', '定时（cron）'),
    event: t('schedule.event', '事件触发'),
  }
  return MAP[type] ?? type
}

// ============================================================================
// 实例详情内容
// ============================================================================

export interface InstanceContentActions {
  onViewApp?: () => void
  onViewExecutions?: () => void
  onEnable?: () => void
  onDisable?: () => void
  onExecute?: () => void
}

export function InstanceDetailContent({
  instance,
}: {
  instance: AppInstance
}) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      <Section title={t('instance.section.basic', '基础信息')}>
        <Row label={t('instance.field.id', 'ID')} value={instance.id} />
        <Row label={t('instance.field.app_code', '应用')} value={<code>{instance.app_code}</code>} />
        {instance.app && (
          <Row label={t('instance.field.app_name', '应用名')} value={instance.app.name} />
        )}
        <Row label={t('instance.field.owner', '所有者')} value={instance.owner} />
        <Row
          label={t('instance.field.status', '状态')}
          value={<InstanceStatusChip enabled={instance.enabled} />}
        />
        {/* B-back-2: health 字段暂不展示 — TODO(B-back-2) */}
        <Row
          label={t('instance.field.schedule', '调度')}
          value={scheduleLabel(instance.schedule_type)}
        />
      </Section>

      <Section title={t('instance.section.execution', '执行统计')}>
        <Row
          label={t('instance.field.last_exec', '最近执行')}
          value={instance.last_execution_at ? fmtRelative(instance.last_execution_at) : '-'}
        />
        <Row
          label={t('instance.field.last_status', '最近状态')}
          value={
            instance.last_execution_status ? (
              <ExecStatusChip status={instance.last_execution_status} />
            ) : (
              '-'
            )
          }
        />
        {instance.stats && (
          <>
            <Row label={t('instance.field.total', '执行次数')} value={instance.stats.total_executions} />
            <Row
              label={t('instance.field.success_rate', '成功率')}
              value={`${instance.stats.success_rate}%`}
            />
          </>
        )}
      </Section>

      <Section title={t('instance.section.time', '时间')}>
        <Row
          label={t('instance.field.created_at', '创建时间')}
          value={fmtDateTime(instance.created_at)}
        />
        <Row
          label={t('instance.field.updated_at', '更新时间')}
          value={fmtDateTime(instance.updated_at)}
        />
      </Section>

      {instance.description && (
        <Section title={t('instance.section.desc', '描述')}>
          <p className="leading-5" style={{ color: 'var(--text-2)' }}>
            {instance.description}
          </p>
        </Section>
      )}
    </div>
  )
}

// ============================================================================
// Peek 摘要用（轻量）
// ============================================================================

export function InstancePeekContent({ instance }: { instance: AppInstance }) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      <Section title={t('instance.section.basic', '基础信息')}>
        <Row label={t('instance.field.app_code', '应用')} value={<code>{instance.app_code}</code>} />
        <Row label={t('instance.field.owner', '所有者')} value={instance.owner} />
        <Row
          label={t('instance.field.status', '状态')}
          value={<InstanceStatusChip enabled={instance.enabled} />}
        />
        <Row
          label={t('instance.field.schedule', '调度')}
          value={scheduleLabel(instance.schedule_type)}
        />
        <Row
          label={t('instance.field.last_exec', '最近执行')}
          value={instance.last_execution_at ? fmtRelative(instance.last_execution_at) : '-'}
        />
      </Section>
    </div>
  )
}
