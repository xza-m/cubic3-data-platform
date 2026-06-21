// frontend/src/v2/pages/apps/_shared/execution-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// 执行记录详情内容 shared 组件（Peek panel + ExecutionDetail 复用）。

import type { ReactNode } from 'react'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import { t } from '@v2/i18n'
import type { AppExecution } from '@v2/api/instances'
import { ExecStatusChip } from './instance-content'
import { appCodeLabel } from '@v2/lib/appLabels'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'
import { TechnicalValue } from '@v2/components/common/TechnicalValue'
import { technicalIdLabel } from '@v2/lib/displayLabels'

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
// 耗时格式化
// ============================================================================

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m}m ${rem}s`
}

// ============================================================================
// 执行记录 tab label（在 tab strip 中展示）
// ============================================================================

export function executionTabLabel(row: AppExecution): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
        {technicalIdLabel(t('exec.tab.recordPrefix', '执行记录 '), row.id)}
      </span>
      {row.instance && (
        <span className="truncate">{row.instance.name}</span>
      )}
    </span>
  )
}

// ============================================================================
// 执行详情内容
// ============================================================================

export interface ExecutionActions {
  onViewInstance?: () => void
  onViewApp?: () => void
}

export function ExecutionDetailContent({
  execution,
  actions,
}: {
  execution: AppExecution
  actions?: ExecutionActions
}) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      {(actions?.onViewInstance || actions?.onViewApp) && (
        <div className="flex items-center gap-2">
          {actions.onViewInstance && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={actions.onViewInstance}>
              {t('exec.action.view_instance', '查看实例')}
            </button>
          )}
          {actions.onViewApp && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={actions.onViewApp}>
              {t('exec.action.view_app', '查看应用')}
            </button>
          )}
        </div>
      )}

      <Section title={t('exec.section.basic', '基础信息')}>
        <Row label={t('exec.field.id', '执行记录')} value={<TechnicalValue value={execution.id} />} />
        <Row
          label={t('exec.field.instance', '实例')}
          value={
            execution.instance ? (
              <>
                {appCodeLabel(execution.instance.app_code)}
                {' · '}
                {execution.instance.name}
              </>
            ) : (
              t('exec.instance.unknown', '未知实例')
            )
          }
        />
        {execution.app && (
          <Row label={t('exec.field.app', '应用')} value={execution.app.name} />
        )}
        <Row
          label={t('exec.field.status', '状态')}
          value={<ExecStatusChip status={execution.status} />}
        />
        <Row
          label={t('exec.field.trigger', '触发方式')}
          value={execution.trigger_display_name || t('exec.trigger.unknown', '未知触发')}
        />
      </Section>

      <Section title={t('exec.section.timing', '时间 & 耗时')}>
        <Row
          label={t('exec.field.started_at', '开始时间')}
          value={execution.started_at ? fmtDateTime(execution.started_at) : '-'}
        />
        <Row
          label={t('exec.field.ended_at', '结束时间')}
          value={execution.ended_at ? fmtDateTime(execution.ended_at) : '-'}
        />
        <Row
          label={t('exec.field.duration', '耗时')}
          value={fmtDuration(execution.duration_ms)}
        />
      </Section>

      {execution.error_message && (
        <Section title={t('exec.section.error', '错误信息')}>
          <p
            className="rounded border p-2 text-xs leading-4"
            style={{
              background: 'var(--danger-soft)',
              borderColor: 'var(--danger)',
              color: 'var(--danger)',
            }}
          >
            {execution.error_message}
          </p>
        </Section>
      )}

      {execution.output && Object.keys(execution.output).length > 0 && (
        <Section title={t('exec.section.output', '输出')}>
          <StructuredDetails
            title={t('exec.output.detailTitle', '查看输出详情')}
            value={execution.output}
            summary={t('exec.output.summary', '输出字段 {count} 个', {
              count: Object.keys(execution.output).length,
            })}
          />
        </Section>
      )}
    </div>
  )
}

// ============================================================================
// Peek 摘要用（轻量）
// ============================================================================

export function ExecutionPeekContent({ execution }: { execution: AppExecution }) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      <Section title={t('exec.section.basic', '基础信息')}>
        <Row label={t('exec.field.id', '执行记录')} value={<TechnicalValue value={execution.id} />} />
        <Row
          label={t('exec.field.status', '状态')}
          value={<ExecStatusChip status={execution.status} />}
        />
        <Row
          label={t('exec.field.trigger', '触发方式')}
          value={execution.trigger_display_name ?? execution.trigger_type}
        />
        <Row
          label={t('exec.field.started_at', '开始')}
          value={execution.started_at ? fmtRelative(execution.started_at) : '-'}
        />
        <Row
          label={t('exec.field.duration', '耗时')}
          value={fmtDuration(execution.duration_ms)}
        />
      </Section>
      {execution.error_message && (
        <Section title={t('exec.section.error', '错误')}>
          <p className="leading-5" style={{ color: 'var(--danger)' }}>
            {execution.error_message}
          </p>
        </Section>
      )}
    </div>
  )
}
