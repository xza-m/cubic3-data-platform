// frontend/src/v2/pages/data/_shared/datasource-detail-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// Datasource Peek (L2) 与 DatasourceDetail (L3) 共用的详情内容。
// 字段对齐：DatasourceResponse (datasource_schemas.py)
// drop-frontend: capabilities / rating / installs — 后端无设计 see plan §3.4

import type { ReactNode } from 'react'
import type { Datasource } from '@v2/api/datasources'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────

export function connectionStatusChip(status: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    connected:    { label: t('datasourceDetailContent.conn.connected', '已连接'),    tone: 'success' },
    disconnected: { label: t('datasourceDetailContent.conn.disconnected', '未连接'), tone: 'neutral' },
    error:        { label: t('datasourceDetailContent.conn.error', '异常'),          tone: 'danger' },
    testing:      { label: t('datasourceDetailContent.conn.testing', '测试中'),      tone: 'warning' },
  }
  const { label = status, tone = 'neutral' } = map[status] ?? {}
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: `var(--${tone}-soft, var(--bg-surface-2))`,
        color: `var(--${tone}, var(--text-2))`,
      }}
    >
      {label}
    </span>
  )
}

export function sourceTypeChip(type: string): ReactNode {
  const toneMap: Record<string, string> = {
    mysql:       'accent',
    maxcompute:  'violet',
    postgresql:  'success',
    clickhouse:  'warning',
  }
  const tone = toneMap[type.toLowerCase()] ?? 'neutral'
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{
        background: `var(--${tone}-soft, var(--bg-surface-2))`,
        color: `var(--${tone}, var(--text-2))`,
      }}
    >
      {type}
    </span>
  )
}

export function datasourceTabLabel(item: Datasource): ReactNode {
  const dotColor =
    item.connection_status === 'connected'
      ? 'var(--success)'
      : item.connection_status === 'error'
        ? 'var(--danger)'
        : 'var(--text-3)'
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="truncate">{item.name}</span>
    </span>
  )
}

// ── 主内容组件 ────────────────────────────────────────────────────────────────

export function DatasourceDetailContent({ item }: { item: Datasource }) {
  return (
    <div className="px-4 py-3.5">
      <Section title={t('datasourceDetailContent.section.basic', '基础信息')}>
        <dl
          className="divide-y rounded-md border text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label="ID"                                                     value={item.id} />
          <Row label={t('datasourceDetailContent.row.type', '类型')}          value={sourceTypeChip(item.source_type)} />
          <Row label={t('datasourceDetailContent.row.active', '启用')}        value={item.is_active ? t('datasourceDetailContent.yes', '是') : t('datasourceDetailContent.no', '否')} />
          <Row label={t('datasourceDetailContent.row.conn', '连通')}          value={connectionStatusChip(item.connection_status)} />
          <Row label={t('datasourceDetailContent.row.createdBy', '创建人')}   value={item.created_by} />
          <Row label={t('datasourceDetailContent.row.createdAt', '创建时间')} value={fmtDateTime(item.created_at)} />
          <Row label={t('datasourceDetailContent.row.updatedAt', '更新时间')} value={fmtDateTime(item.updated_at)} />
          <Row label={t('datasourceDetailContent.row.lastTest', '最近测试')}  value={fmtDateTime(item.last_test_at)} />
        </dl>
      </Section>

      {item.description ? (
        <Section title={t('datasourceDetailContent.section.description', '描述')}>
          <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>
            {item.description}
          </p>
        </Section>
      ) : null}

      <Section title={t('datasourceDetailContent.section.connConfig', '连接配置（已脱敏）')}>
        <pre
          className="max-h-64 overflow-auto rounded-md border p-2 text-[11px] leading-4"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-2)',
          }}
        >
          {JSON.stringify(item.connection_config, null, 2)}
        </pre>
      </Section>

      {item.last_test_error ? (
        <Section title={t('datasourceDetailContent.section.lastTestError', '最近测试错误')}>
          <p className="text-xs leading-5" style={{ color: 'var(--danger)' }}>
            {item.last_test_error}
          </p>
        </Section>
      ) : null}
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div
        className="mb-1.5 text-[10px] font-medium uppercase tracking-wide"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-2.5 py-1.5"
      style={{ borderColor: 'var(--border)' }}
    >
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value ?? '—'}
      </dd>
    </div>
  )
}
