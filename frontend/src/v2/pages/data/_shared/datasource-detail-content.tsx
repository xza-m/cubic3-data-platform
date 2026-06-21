// frontend/src/v2/pages/data/_shared/datasource-detail-content.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// Datasource Peek (L2) 与 DatasourceDetail (L3) 共用的详情内容。
// 字段对齐：DatasourceResponse (datasource_schemas.py)
// drop-frontend: capabilities / rating / installs — 后端无设计 see plan §3.4

import type { ReactNode } from 'react'
import type { Datasource } from '@v2/api/datasources'
import { IdentityName } from '@v2/components/IdentityName'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'
import { datasourceTypeLabel, normalizeDatasourceType } from '@v2/lib/datasourceTypes'
import { fmtDateTime } from '@v2/lib/format'
import { isConnectedDatasourceStatus, normalizeDatasourceConnectionStatus } from '@v2/lib/factSources'
import { t } from '@v2/i18n'

// ── 徽章渲染助手 ──────────────────────────────────────────────────────────────

export function connectionStatusChip(status: string): ReactNode {
  const normalized = normalizeDatasourceConnectionStatus(status)
  const map: Record<string, { label: string; tone: string }> = {
    connected:    { label: t('datasourceDetailContent.conn.connected', '已连接'),    tone: 'success' },
    disconnected: { label: t('datasourceDetailContent.conn.disconnected', '未连接'), tone: 'neutral' },
    failed:       { label: t('datasourceDetailContent.conn.error', '异常'),          tone: 'danger' },
    pending:      { label: t('datasourceDetailContent.conn.testing', '测试中'),      tone: 'warning' },
    unknown:      { label: t('datasourceDetailContent.conn.unknown', '未知'),        tone: 'neutral' },
  }
  const { label = status, tone = 'neutral' } = map[normalized] ?? {}
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

export { datasourceTypeLabel }

type DatasourceGlyphSize = 'xs' | 'sm' | 'md'

const datasourceGlyphSizeClass: Record<DatasourceGlyphSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
}

interface DatasourceTypeVisual {
  label: string
  shortLabel: string
  color: string
  soft: string
  glyph: 'compute' | 'postgres' | 'mysql' | 'clickhouse' | 'database'
}

function datasourceTypeVisual(type: string): DatasourceTypeVisual {
  const normalized = normalizeDatasourceType(type)
  const map: Record<string, DatasourceTypeVisual> = {
    maxcompute: {
      label: datasourceTypeLabel('maxcompute'),
      shortLabel: 'MC',
      color: 'var(--violet, #7c3aed)',
      soft: 'var(--violet-soft, #ede9fe)',
      glyph: 'compute',
    },
    postgresql: {
      label: datasourceTypeLabel('postgresql'),
      shortLabel: 'PG',
      color: 'var(--success, #15803d)',
      soft: 'var(--success-soft, #dcfce7)',
      glyph: 'postgres',
    },
    mysql: {
      label: datasourceTypeLabel('mysql'),
      shortLabel: 'MY',
      color: 'var(--accent, #2563eb)',
      soft: 'var(--accent-soft, #dbeafe)',
      glyph: 'mysql',
    },
    clickhouse: {
      label: datasourceTypeLabel('clickhouse'),
      shortLabel: 'CH',
      color: 'var(--warning, #d97706)',
      soft: 'var(--warning-soft, #fef3c7)',
      glyph: 'clickhouse',
    },
  }
  return map[normalized] ?? {
    label: datasourceTypeLabel(type),
    shortLabel: (type || 'DS').slice(0, 2).toUpperCase(),
    color: 'var(--text-2)',
    soft: 'var(--bg-surface-2)',
    glyph: 'database',
  }
}

export function DatasourceTypeIcon({
  type,
  size = 'sm',
}: {
  type: string
  size?: DatasourceGlyphSize
}) {
  const visual = datasourceTypeVisual(type)
  const label = t('datasourceDetailContent.typeIcon.label', '{type} 连接图标', {
    type: visual.label,
  })
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex ${datasourceGlyphSizeClass[size]} shrink-0 items-center justify-center rounded-md`}
      style={{ background: visual.soft, color: visual.color }}
    >
      <DatasourceTypeGlyph type={type} size={size} decorative />
    </span>
  )
}

function DatasourceTypeGlyph({
  type,
  size,
  decorative = false,
}: {
  type: string
  size: DatasourceGlyphSize
  decorative?: boolean
}) {
  const visual = datasourceTypeVisual(type)
  const stroke = size === 'xs' ? 2.4 : 2
  const labelClass = size === 'xs' ? 'text-[7px]' : size === 'sm' ? 'text-[8px]' : 'text-[10px]'

  if (visual.glyph === 'compute') {
    return (
      <svg aria-hidden={decorative} viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="none">
        <path d="M7 8.5h10v7H7z" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
        <path d="M12 4v4.5M12 15.5V20M4 12h3M17 12h3" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    )
  }

  if (visual.glyph === 'postgres') {
    return (
      <svg aria-hidden={decorative} viewBox="0 0 24 24" className="h-[72%] w-[72%]" fill="none">
        <ellipse cx="12" cy="6.5" rx="6.5" ry="2.8" stroke="currentColor" strokeWidth={stroke} />
        <path d="M5.5 6.5v8c0 1.6 2.9 2.8 6.5 2.8s6.5-1.2 6.5-2.8v-8" stroke="currentColor" strokeWidth={stroke} />
        <path d="M5.5 10.5c0 1.6 2.9 2.8 6.5 2.8s6.5-1.2 6.5-2.8" stroke="currentColor" strokeWidth={stroke} />
      </svg>
    )
  }

  if (visual.glyph === 'mysql') {
    return (
      <svg aria-hidden={decorative} viewBox="0 0 24 24" className="h-[72%] w-[72%]" fill="none">
        <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
        <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" opacity=".65" />
      </svg>
    )
  }

  if (visual.glyph === 'clickhouse') {
    return (
      <svg aria-hidden={decorative} viewBox="0 0 24 24" className="h-[72%] w-[72%]" fill="none">
        <path d="M6 18V7M10 18V4M14 18V9M18 18v-6" stroke="currentColor" strokeWidth={stroke + 0.4} strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <span aria-hidden={decorative} className={`${labelClass} font-semibold leading-none`}>
      {visual.shortLabel}
    </span>
  )
}

export function datasourceTabLabel(item: Datasource): ReactNode {
  const dotColor =
    isConnectedDatasourceStatus(item.connection_status)
      ? 'var(--success)'
      : normalizeDatasourceConnectionStatus(item.connection_status) === 'failed'
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
          <Row label={t('datasourceDetailContent.row.type', '类型')}          value={datasourceTypeLabel(item.source_type)} />
          <Row label={t('datasourceDetailContent.row.active', '启用')}        value={item.is_active ? t('datasourceDetailContent.yes', '是') : t('datasourceDetailContent.no', '否')} />
          <Row label={t('datasourceDetailContent.row.conn', '连通')}          value={connectionStatusChip(item.connection_status)} />
          <Row
            label={t('datasourceDetailContent.row.createdBy', '创建人')}
            value={<IdentityName value={item.created_by} displayName={item.created_by_display_name} />}
          />
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
        <StructuredDetails
          title={t('datasourceDetailContent.connConfig.detailTitle', '查看脱敏配置')}
          value={item.connection_config}
          summary={<ConnectionConfigSummary config={item.connection_config} sourceType={item.source_type} />}
        />
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

function ConnectionConfigSummary({
  config,
  sourceType,
}: {
  config: Record<string, unknown>
  sourceType: string
}) {
  const host = safeConfigText(config, ['host', 'endpoint', 'server'])
  const database = safeConfigText(config, ['database', 'project', 'db'])
  const schema = safeConfigText(config, ['schema'])
  const authConfigured = ['username', 'user', 'access_key_id', 'client_id'].some((key) => hasConfigValue(config, key))
  return (
    <span>
      {datasourceTypeLabel(sourceType)}
      {host ? ` · ${host}` : ''}
      {database ? ` · ${database}` : ''}
      {schema ? ` / ${schema}` : ''}
      {` · ${authConfigured ? t('datasourceDetailContent.connConfig.authConfigured', '认证已配置') : t('datasourceDetailContent.connConfig.authMissing', '认证未配置')}`}
    </span>
  )
}

function safeConfigText(config: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function hasConfigValue(config: Record<string, unknown>, key: string): boolean {
  const value = config[key]
  return value != null && String(value).trim().length > 0
}
