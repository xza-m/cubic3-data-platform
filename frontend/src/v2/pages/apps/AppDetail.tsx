// frontend/src/v2/pages/apps/AppDetail.tsx
//
// 应用详情页（L3）。
// 接口：GET /api/v1/apps/:code
//       GET /api/v1/app-executions?app_code=:code
// drop-frontend（see plan §3.4）:
//   - App.rating              — 无展示
//   - App.installs            — 无展示
//   - App.capabilities Tab    — 无展示（后端无此字段）
//   - "安装/卸载"按钮         → 改为"创建实例"按钮

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Play } from 'lucide-react'
import { t } from '@v2/i18n'
import { fmtDateTime } from '@v2/lib/format'
import { useApp } from '@v2/hooks/apps'
import { useExecutions } from '@v2/hooks/instances'
import { HealthChip } from '@v2/components/HealthChip'
import { AppStatusChip, metaOf } from './_shared/app-card'
import { ExecStatusChip } from './_shared/instance-content'
import { fmtDuration } from './_shared/execution-content'
import { appCategoryLabel } from '@v2/lib/appLabels'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'
import { TechnicalValue } from '@v2/components/common/TechnicalValue'

type Tab = 'overview' | 'runs' | 'config'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: t('appdetail.tab.overview', '总览') },
  { id: 'runs', label: t('appdetail.tab.runs', '执行记录') },
  { id: 'config', label: t('appdetail.tab.config', '配置') },
  // drop-frontend: App.capabilities Tab — see plan §3.4
]

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded border p-3 text-center"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
      </div>
      <div className="mt-1 text-base font-semibold" style={{ color: 'var(--text-1)' }}>
        {value}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-xs" style={{ color: 'var(--text-3)' }}>
        {label}
      </dt>
      <dd className="truncate text-right text-xs" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function schemaSummary(schema: Record<string, unknown> | null): string {
  if (!schema) return t('app.no_config_schema', '该应用未定义配置结构')
  const properties = schema.properties && typeof schema.properties === 'object'
    ? Object.keys(schema.properties as Record<string, unknown>).length
    : 0
  const required = Array.isArray(schema.required) ? schema.required.length : 0
  return t('appdetail.configSchema.summary', '配置项 {properties} 个，必填 {required} 个', {
    properties,
    required,
  })
}

export default function AppDetail() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: app, isLoading, isError } = useApp(code)
  const { data: execPage } = useExecutions({
    app_code: code,
    page: 1,
    page_size: 20,
  })
  const execs = execPage?.items ?? []

  if (isLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('state.loading', '加载中…')}
      </div>
    )
  }

  if (isError || !app) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3"
      >
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {t('state.not_found', '应用不存在或加载失败')}
        </p>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => navigate('/apps')}
        >
          <ArrowLeft size={12} />
          {t('action.back', '返回')}
        </button>
      </div>
    )
  }

  const meta = metaOf(app.category)
  const Icon = meta.icon
  const categoryLabel = appCategoryLabel(app.category)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Detail header */}
      <header
        className="border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-white"
            style={{ background: meta.color }}
          >
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {app.name}
              </span>
              <AppStatusChip enabled={app.enabled} />
              <HealthChip health={app.health} />
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {/* drop-frontend: App.rating — see plan §3.4 */}
              {app.author && <span>{app.author}</span>}
              {app.author && <span className="mx-1.5">·</span>}
              <span>{categoryLabel}</span>
              {app.version && <span className="mx-1.5">v{app.version}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => navigate('/apps')}
            >
              <ArrowLeft size={12} />
              {t('action.back_to_market', '返回市场')}
            </button>
            {/* drop-frontend: "安装/卸载"按钮 → 改为"创建实例" — see plan §3.4 */}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() =>
                navigate(`/apps/instances/new?app_code=${encodeURIComponent(app.code)}`, { state: { app_code: app.code } })
              }
            >
              <Play size={12} />
              {t('action.create_instance', '创建实例')}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-3 flex items-center gap-1">
          {TABS.map((t_) => (
            <button
              key={t_.id}
              type="button"
              className="rounded px-2.5 py-1 text-xs transition-colors"
              style={{
                background: tab === t_.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === t_.id ? 'var(--accent)' : 'var(--text-2)',
              }}
              onClick={() => setTab(t_.id)}
            >
              {t_.label}
            </button>
          ))}
        </div>
      </header>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'overview' && (
          <div className="grid gap-3 md:grid-cols-2">
            {/* Description */}
            <div
              className="rounded-md border p-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('appdetail.section.desc', '说明')}
              </div>
              <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>
                {app.description ?? t('app.no_description', '暂无描述')}
              </p>
            </div>

            {/* Stats */}
            <div
              className="rounded-md border p-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('appdetail.section.stats', '使用统计')}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatCard
                  label={t('app.instance_count', '实例数')}
                  value={app.instance_count ?? '-'}
                />
                <StatCard
                  label={t('app.active_instance_count', '运行中')}
                  value={app.active_instance_count ?? '-'}
                />
                <StatCard
                  label={t('app.total_execution_count', '总执行')}
                  value={app.total_execution_count ?? '-'}
                />
              </div>
            </div>

            {/* Meta info */}
            <div
              className="rounded-md border p-4 md:col-span-2"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('appdetail.section.meta', '元数据')}
              </div>
              <dl>
                <Row label={t('app.field.category', '分类')} value={categoryLabel} />
                <Row label={t('app.field.author', '作者')} value={app.author ?? '-'} />
                <Row label={t('app.field.version', '版本')} value={app.version ?? '-'} />
                <Row
                  label={t('app.field.created_at', '创建时间')}
                  value={fmtDateTime(app.created_at)}
                />
                <Row
                  label={t('app.field.updated_at', '更新时间')}
                  value={fmtDateTime(app.updated_at)}
                />
              </dl>
            </div>
          </div>
        )}

        {/* drop-frontend: App.capabilities Tab — see plan §3.4 */}

        {tab === 'runs' && (
          <div
            className="rounded-md border"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                {t('appdetail.section.runs', '执行记录')}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => navigate(`/apps/executions?app_code=${app.code}`)}
              >
                {t('action.view_all', '查看全部')}
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
                    <th className="px-4 py-2 text-left font-normal">{t('exec.field.record', '执行记录')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.status', '状态')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.trigger', '触发')}</th>
                  <th className="px-4 py-2 text-left font-normal">{t('exec.field.started_at', '开始')}</th>
                  <th className="px-4 py-2 text-right font-normal">{t('exec.field.duration', '耗时')}</th>
                </tr>
              </thead>
              <tbody>
                {execs.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-t transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => navigate(`/apps/executions/${e.id}`)}
                  >
                    <td className="px-4 py-2">
                      <TechnicalValue value={e.id} label={t('exec.field.recordShort', '记录')} />
                    </td>
                    <td className="px-4 py-2">
                      <ExecStatusChip status={e.status} />
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                      {e.trigger_display_name}
                    </td>
                    <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>
                      {fmtDateTime(e.started_at)}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtDuration(e.duration_ms)}</td>
                  </tr>
                ))}
                {execs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-xs"
                      style={{ color: 'var(--text-3)' }}
                    >
                      {t('state.no_runs', '暂无执行记录')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'config' && (
          <div
            className="rounded-md border p-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('appdetail.section.config_schema', '配置结构')}
            </div>
            {app.config_schema ? (
              <StructuredDetails
                title={t('appdetail.configSchema.detailTitle', '查看结构详情')}
                value={app.config_schema}
                summary={
                  <>
                    {schemaSummary(app.config_schema)}
                    {app.updated_at ? ` · ${t('common.updatedAt', '更新时间')} ${fmtDateTime(app.updated_at)}` : ''}
                  </>
                }
              />
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {t('app.no_config_schema', '该应用未定义配置结构')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
