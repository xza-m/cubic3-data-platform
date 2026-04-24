// frontend/src/v2/pages/data/_shared/dataset-detail-content.tsx
//
// Dataset Peek (L2) 与 DatasetDetail (L3) 共用的详情内容。
// 字段对齐：DatasetResponse / DatasetFieldSchema (dataset_schemas.py)
// drop-frontend: 无（后端字段均已对齐）
// 字段 profile（distinct/null 比）由 GET /api/v1/data-center/datasets/:id/profile 提供。

import type { ReactNode } from 'react'
import type { Dataset, DatasetField } from '@v2/api/datasets'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────
//
// 本文件同时导出 Chip helpers（返回 ReactNode）与 DatasetDetailContent 组件，
// 是历史形成的共享约定（Peek/L3 两个入口共用同一套渲染逻辑）。
// Fast Refresh 对此会告警，但这些 helper 不是 React 组件，忽略 warning 即可。
/* eslint-disable react-refresh/only-export-components */

export function datasetTypeChip(type: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    physical: { label: t('datasetDetail.type.physical', '物理表'), tone: 'accent' },
    virtual:  { label: t('datasetDetail.type.virtual', '虚拟'),    tone: 'violet' },
    file:     { label: t('datasetDetail.type.file', '文件'),       tone: 'warning' },
  }
  const { label = type, tone = 'neutral' } = map[type] ?? {}
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

export function syncStatusChip(status: string): ReactNode {
  const map: Record<string, { label: string; tone: string }> = {
    synced:  { label: t('datasetDetail.sync.synced', '已同步'),  tone: 'success' },
    syncing: { label: t('datasetDetail.sync.syncing', '同步中'), tone: 'warning' },
    failed:  { label: t('datasetDetail.sync.failed', '失败'),    tone: 'danger' },
    pending: { label: t('datasetDetail.sync.pending', '待同步'), tone: 'neutral' },
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

export function datasetTabLabel(item: Dataset): ReactNode {
  const dotColor =
    item.sync_status === 'synced'
      ? 'var(--success)'
      : item.sync_status === 'failed'
        ? 'var(--danger)'
        : item.sync_status === 'syncing'
          ? 'var(--warning)'
          : 'var(--text-3)'
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span className="truncate">{item.dataset_name}</span>
    </span>
  )
}

// ── 主内容组件 ────────────────────────────────────────────────────────────────

export function DatasetDetailContent({ item }: { item: Dataset }) {
  const fields = item.fields ?? []
  return (
    <div className="px-4 py-3.5">
      <Section title={t('datasetDetail.section.basic', '基础信息')}>
        <dl
          className="divide-y rounded-md border text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <Row label={t('datasetDetail.field.code', '编码')}      value={<code>{item.dataset_code}</code>} />
          <Row label={t('datasetDetail.field.name', '名称')}      value={item.dataset_name} />
          <Row label={t('datasetDetail.field.type', '类型')}      value={datasetTypeChip(item.dataset_type)} />
          <Row label={t('datasetDetail.field.owner', '负责人')}   value={item.owner} />
          <Row label={t('datasetDetail.field.physicalTable', '物理表')} value={item.physical_table} />
          <Row label={t('datasetDetail.field.syncStatus', '同步状态')} value={syncStatusChip(item.sync_status)} />
          <Row label={t('datasetDetail.field.fieldCount', '字段数')}   value={item.field_count ?? fields.length} />
          <Row label={t('datasetDetail.field.lastSync', '最近同步')}   value={fmtDateTime(item.last_sync_at)} />
          <Row label={t('datasetDetail.field.updatedAt', '更新时间')}  value={fmtDateTime(item.updated_at)} />
        </dl>
      </Section>

      {item.description ? (
        <Section title={t('datasetDetail.section.description', '描述')}>
          <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>
            {item.description}
          </p>
        </Section>
      ) : null}

      {item.sql_query ? (
        <Section title={t('datasetDetail.section.sql', 'SQL')}>
          <pre
            className="max-h-64 overflow-auto rounded-md border p-2 text-[11px] leading-4"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
            }}
          >
            {item.sql_query}
          </pre>
        </Section>
      ) : null}

      {item.sync_error ? (
        <Section title={t('datasetDetail.section.syncError', '同步错误')}>
          <p className="text-xs leading-5" style={{ color: 'var(--danger)' }}>
            {item.sync_error}
          </p>
        </Section>
      ) : null}

      {fields.length > 0 ? (
        <Section
          title={
            <span className="flex items-center justify-between">
              <span>{t('datasetDetail.section.fields', '字段')}</span>
              <span style={{ color: 'var(--text-3)' }}>{fields.length}</span>
            </span>
          }
        >
          <ul className="space-y-1">
            {fields.slice(0, 30).map((f, i) => (
              <FieldRow key={f.physical_name + i} field={f} />
            ))}
            {fields.length > 30 ? (
              <li className="px-2 py-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                {t('datasetDetail.fieldMore', '… 还有 {n} 个字段', { n: fields.length - 30 })}
              </li>
            ) : null}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function FieldRow({ field }: { field: DatasetField }) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded border px-2 py-1.5 text-[11px]"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="min-w-0">
        <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>
          {field.physical_name}
        </div>
        {field.display_name ? (
          <div className="truncate" style={{ color: 'var(--text-3)' }}>
            {field.display_name}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Chip tone="neutral">{field.data_type}</Chip>
        {field.business_type ? <Chip tone="accent">{field.business_type}</Chip> : null}
      </div>
    </li>
  )
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        background: `var(--${tone}-soft, var(--bg-surface-2))`,
        color: `var(--${tone}, var(--text-2))`,
      }}
    >
      {children}
    </span>
  )
}

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
