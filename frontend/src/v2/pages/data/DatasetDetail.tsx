// frontend/src/v2/pages/data/DatasetDetail.tsx
//
// 数据集详情全屏页（L3）。包含概览 / Schema / 预览 / 血缘四个 Tab。
// 对接 GET /api/v1/data-center/datasets/:id?include_fields=true

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Database, ExternalLink, Pencil, RefreshCcw, RotateCw, ScanSearch } from 'lucide-react'
import { useDataset, useDatasets, useSyncDatasetSchema, useDatasetProfile, useRefreshDatasetProfile } from '@v2/hooks/datasets'
import type { Dataset, DatasetField, DatasetProfileColumn } from '@v2/api/datasets'
import {
  DatasetDetailContent,
  datasetTabLabel,
  datasetTypeChip,
  syncStatusChip,
} from './_shared/dataset-detail-content'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

function buildTabs() {
  return [
    { id: 'overview', label: t('datasetDetail.tab.overview', '概览') },
    { id: 'schema',   label: 'Schema' },
    { id: 'profile',  label: t('datasetDetail.tab.profile', '字段画像') },
    { id: 'lineage',  label: t('datasetDetail.tab.lineage', '血缘') },
  ] as const
}

type TabId = 'overview' | 'schema' | 'profile' | 'lineage'

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [tab, setTab] = useState<TabId>('overview')

  const { data, isLoading, isError, error, refetch, isFetching } = useDataset(numericId, true)
  const { data: listData } = useDatasets({ page: 1, page_size: 100 })
  const syncSchema = useSyncDatasetSchema()
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useDatasetProfile(numericId)
  const refreshProfile = useRefreshDatasetProfile()

  useEffect(() => {
    if (!data) return
    setBreadcrumbs([
      t('datasetDetail.breadcrumb.data', '数据'),
      t('datasetDetail.breadcrumb.datasets', '数据集'),
      data.dataset_name,
    ])
  }, [data, setBreadcrumbs])

  useEffect(() => {
    if (!data) return
    openTab({
      id: `dataset:${data.id}`,
      label: datasetTabLabel(data),
      to: `/data-center/datasets/${data.id}`,
      closeable: true,
      onClose: () => {
        navigate('/data-center/datasets')
        return true
      },
    })
  }, [data, openTab, navigate])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/data-center/datasets')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> {t('datasetDetail.action.back', '返回列表')}
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />{' '}
          {t('datasetDetail.action.reload', '重新加载')}
        </button>
        {data ? (
          <>
            <button
              type="button"
              onClick={() => syncSchema.mutate(data.id)}
              disabled={syncSchema.isPending}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              <RotateCw size={12} className={syncSchema.isPending ? 'animate-spin' : ''} />
              {t('datasetDetail.action.syncSchema', '同步 Schema')}
            </button>
            <button
              type="button"
              onClick={() => refreshProfile.mutate(data.id)}
              disabled={refreshProfile.isPending}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              <ScanSearch size={12} className={refreshProfile.isPending ? 'animate-spin' : ''} />
              {t('datasetDetail.action.refreshProfile', '刷新画像')}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(`/data-center/datasets/${numericId}/edit`)}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Pencil size={12} /> {t('datasetDetail.action.edit', '编辑')}
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, navigate, data, syncSchema, numericId, refreshProfile])

  const neighbors = useMemo(() => {
    const items = listData?.items ?? []
    if (!data) return { prev: null as Dataset | null, next: null as Dataset | null }
    const idx = items.findIndex((it) => it.id === data.id)
    if (idx < 0) return { prev: null, next: null }
    return { prev: items[idx - 1] ?? null, next: items[idx + 1] ?? null }
  }, [listData?.items, data])

  useEffect(() => {
    if (!data) return
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <Database size={12} style={{ color: 'var(--text-3)' }} />
          {data.dataset_name}
        </div>
      ),
      subtitle: `${data.dataset_type} · #${data.id}`,
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('datasetDetail.context.status', '状态')}</CtxLabel>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {datasetTypeChip(data.dataset_type)}
              {syncStatusChip(data.sync_status)}
            </div>
          </section>
          <section>
            <CtxLabel>{t('datasetDetail.context.neighbors', '邻接导航')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <NeighborBtn
                label={
                  neighbors.prev
                    ? `← ${neighbors.prev.dataset_name}`
                    : t('datasetDetail.neighbor.noPrev', '没有上一项')
                }
                disabled={!neighbors.prev}
                onClick={neighbors.prev ? () => navigate(`/data-center/datasets/${neighbors.prev!.id}`) : undefined}
              />
              <NeighborBtn
                label={
                  neighbors.next
                    ? `${neighbors.next.dataset_name} →`
                    : t('datasetDetail.neighbor.noNext', '没有下一项')
                }
                disabled={!neighbors.next}
                onClick={neighbors.next ? () => navigate(`/data-center/datasets/${neighbors.next!.id}`) : undefined}
              />
            </div>
          </section>
          <section>
            <CtxLabel>{t('datasetDetail.context.references', '下游引用')}</CtxLabel>
            <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
              {t(
                'datasetDetail.context.refsHint',
                '通过 /api/v1/cubes?source_dataset_id={id} 查询关联 Cube。',
                { id: data.id },
              )}
            </p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
              style={{ color: 'var(--text-2)' }}
            >
              <ExternalLink size={11} /> {t('datasetDetail.action.viewRefs', '查看引用关系')}
            </button>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [data, neighbors, setContextPanel, navigate])

  if (!Number.isFinite(numericId)) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('datasetDetail.state.invalidId', '非法的数据集 ID')}
      </div>
    )
  }
  if (isLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        {t('datasetDetail.state.loading', '加载中…')}
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {error instanceof Error ? error.message : t('datasetDetail.state.loadFailed', '加载失败')}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          {t('datasetDetail.action.retry', '重试')}
        </button>
      </div>
    )
  }
  const tabs = buildTabs()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b px-4 py-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            DS
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <span className="truncate">{data.dataset_name}</span>
              {datasetTypeChip(data.dataset_type)}
              {syncStatusChip(data.sync_status)}
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <code>{data.dataset_code}</code> · #{data.id} ·{' '}
              <code>GET /api/v1/data-center/datasets/{data.id}</code>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === item.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === item.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {tab === 'overview' && <DatasetDetailContent item={data} />}
        {tab === 'schema' && <SchemaTab fields={data.fields ?? []} />}
        {tab === 'profile' && (
          <ProfileTab
            columns={profile?.columns ?? []}
            rowCount={profile?.row_count ?? 0}
            generatedAt={profile?.generated_at ?? null}
            isLoading={profileLoading}
            onRefresh={() => void refetchProfile()}
          />
        )}
        {tab === 'lineage' && <LineageTab item={data} />}
      </div>
    </div>
  )
}

// ── Tab 内容 ──────────────────────────────────────────────────────────────────

function SchemaTab({ fields }: { fields: DatasetField[] }) {
  return (
    <div className="p-4">
      <div className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            Schema ({fields.length})
          </span>
        </div>
        {fields.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            {t('datasetDetail.schema.empty', '无字段')}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  t('datasetDetail.schema.col.field', '字段'),
                  t('datasetDetail.schema.col.type', '类型'),
                  t('datasetDetail.schema.col.businessType', '业务类型'),
                  t('datasetDetail.schema.col.sensitivity', '敏感级别'),
                  t('datasetDetail.schema.col.comment', '说明'),
                ].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.physical_name} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2"><code>{f.physical_name}</code></td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-2)' }}>{f.data_type}</td>
                  <td className="px-4 py-2">
                    {f.business_type ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        {f.business_type}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-2)' }}>{f.sensitivity_level}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-3)' }}>{f.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function ProfileTab({
  columns,
  rowCount,
  generatedAt,
  isLoading,
  onRefresh,
}: {
  columns: DatasetProfileColumn[]
  rowCount: number
  generatedAt: string | null
  isLoading: boolean
  onRefresh: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-xs" style={{ color: 'var(--text-3)' }}>
        {t('datasetDetail.profile.loading', '加载字段画像中…')}
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          {generatedAt ? t('datasetDetail.profile.generatedAt', '生成于 {time}', { time: fmtDateTime(generatedAt) }) : ''}
          {rowCount > 0
            ? `  ·  ${t('datasetDetail.profile.rowCount', '共 {n} 行', { n: rowCount.toLocaleString() })}`
            : ''}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <RefreshCcw size={11} /> {t('datasetDetail.profile.regenerate', '重新生成')}
        </button>
      </div>

      {columns.length === 0 ? (
        <div
          className="rounded-lg border p-8 text-center text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)', borderStyle: 'dashed' }}
        >
          {/* TODO: 后端 GET /api/v1/data-center/datasets/:id/profile 未就绪，点击"刷新画像"触发生成 */}
          {t(
            'datasetDetail.profile.empty',
            '暂无字段画像数据，请点击右上角"刷新画像"生成',
          )}
        </div>
      ) : (
        <div className="rounded-lg border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
                {[
                  t('datasetDetail.profile.col.name', '字段名'),
                  t('datasetDetail.profile.col.type', '类型'),
                  t('datasetDetail.profile.col.nullCount', 'null 数'),
                  t('datasetDetail.profile.col.distinct', '唯一值'),
                  t('datasetDetail.profile.col.min', '最小值'),
                  t('datasetDetail.profile.col.max', '最大值'),
                  t('datasetDetail.profile.col.dist', '非空分布'),
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const nullPct = rowCount > 0 ? col.null_count / rowCount : 0
                const notNullPct = 1 - nullPct
                return (
                  <tr key={col.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 font-medium">
                      <code style={{ color: 'var(--text-1)' }}>{col.name}</code>
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                      <span className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        {col.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {col.null_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-2)' }}>
                      {col.distinct_count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-3)' }}>
                      {col.min ?? '—'}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-3)' }}>
                      {col.max ?? '—'}
                    </td>
                    <td className="px-3 py-2 w-32">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg-surface-2)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${notNullPct * 100}%`, background: 'var(--success)' }}
                          />
                        </div>
                        <span className="w-8 text-right tabular-nums" style={{ color: 'var(--text-3)' }}>
                          {Math.round(notNullPct * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LineageTab({ item }: { item: Dataset }) {
  const currentLabel = t('datasetDetail.lineage.current', '当前')
  const cubeLine = t(
    'datasetDetail.lineage.cubeLine',
    'cube / app  (通过 /api/v1/cubes?source_dataset_id={id} 聚合)',
    { id: item.id },
  )
  return (
    <div className="p-4">
      <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)' }}>
        <p className="mb-3 text-xs font-medium" style={{ color: 'var(--text-1)' }}>
          {t('datasetDetail.lineage.title', '血缘关系')}
        </p>
        <pre className="text-xs leading-6" style={{ color: 'var(--text-2)' }}>
{`source: ${item.source_type ?? '—'} #${item.source_id ?? '—'}
   ↓
dataset: ${item.dataset_code}  ← ${currentLabel}
   ↓
${cubeLine}`}
        </pre>
      </div>
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function CtxLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>{children}</div>
}

function NeighborBtn({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded-md border px-2 py-1 text-left text-xs"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)', opacity: disabled ? 0.5 : 1 }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}

// suppress unused import
void fmtDateTime
