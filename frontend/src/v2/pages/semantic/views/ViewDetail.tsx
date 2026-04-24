// frontend/src/v2/pages/semantic/views/ViewDetail.tsx
//
// 语义 View 详情页。
// 接口：GET /api/v1/semantic/views/:name
//       GET /api/v1/semantic/views/:id/materialize/runs （P8 物化历史）
//
// View 物化触发按钮依赖后端返回的 materialized_at/materialize_status 字段。

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Loader2, Timer } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, CardHead, Chip, Skeleton } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/layout/AppShell, @v2/layout/Inspector
import { useAppShell } from '@v2/layout/AppShell'
import { ContextRow, ContextSection } from '@v2/layout/Inspector'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { useViewDetail, useViewMaterializeRuns, useMaterializeView } from '@v2/hooks/semantic'
import { useToast } from '@v2/components/ui/Toast'
import type { ViewMaterializeRun } from '@v2/api/semantic'

type Tab = 'overview' | 'cubes' | 'materialize'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: t('view.tab.overview', '概览') },
  { id: 'cubes', label: t('view.tab.cubes', 'Cube') },
  { id: 'materialize', label: t('view.tab.materialize', '物化历史') },
]

export default function ViewDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const [tab, setTab] = useState<Tab>('overview')

  const viewQuery = useViewDetail(name)
  const view = viewQuery.data
  const toast = useToast()

  // P8: 物化历史 — 使用 view.id（后端在 describe_view 响应中附带 materialized_at/materialize_status）
  const viewId = (view as Record<string, unknown>)?.id as number | undefined
  const [historyPage, setHistoryPage] = useState(1)
  const runsQuery = useViewMaterializeRuns(
    tab === 'materialize' && viewId ? viewId : undefined,
    { page: historyPage, page_size: 20 },
  )

  const materializeMutation = useMaterializeView()

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.views', 'View'), view?.name ?? name ?? ''])
  }, [setBreadcrumbs, view?.name, name])

  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/views')}>
          <ArrowLeft size={12} /> {t('action.back', '返回列表')}
        </Button>
        {/* 物化触发按钮 */}
        <Button
          size="sm"
          variant="primary"
          disabled={materializeMutation.isPending || !name}
          onClick={async () => {
            if (!name) return
            try {
              await materializeMutation.mutateAsync({ name })
              toast.show({ tone: 'success', title: t('view.materialize.triggered', '物化已触发') })
            } catch {
              toast.show({ tone: 'danger', title: t('view.materialize.failed', '物化触发失败') })
            }
          }}
        >
          {materializeMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Timer size={12} />}
          {t('view.materialize.trigger', '触发物化')}
        </Button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, name, materializeMutation, toast])

  useEffect(() => {
    if (!view) return
    setContextPanel({
      title: view.title ?? view.name,
      subtitle: 'View',
      body: (
        <>
          <ContextSection title={t('view.contextBasic', '基础')}>
            <ContextRow label={t('view.name', '名称')} value={<code>{view.name}</code>} />
            <ContextRow
              label={t('view.visibility', '可见性')}
              value={<Chip tone={view.public ? 'accent' : 'neutral'}>{view.public ? t('view.public', '公开') : t('view.private', '私有')}</Chip>}
            />
            <ContextRow label={t('view.cubeCount', 'Cube 数')} value={Array.isArray(view.cubes) ? view.cubes.length : '—'} />
          </ContextSection>
        </>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, view])

  if (viewQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-sm text-3">{t('loading', '加载中…')}</span>
      </div>
    )
  }

  if (viewQuery.isError || !view) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <span className="text-sm text-danger">{t('error.viewNotFound', 'View 不存在或加载失败')}</span>
        <Button size="sm" variant="ghost" onClick={() => navigate('/semantic/views')}>
          {t('action.back', '返回列表')}
        </Button>
      </div>
    )
  }

  const cubes = Array.isArray(view.cubes) ? view.cubes : []

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 头部 */}
      <div
        className="border-b px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="obj-dot" style={{ background: 'var(--accent)' }}>VW</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-1">
            {view.title ?? view.name}
            <Chip tone={view.public ? 'accent' : 'neutral'}>
              {view.public ? t('view.public', '公开') : t('view.private', '私有')}
            </Chip>
          </div>
          <div className="truncate text-xs text-3">
            <code>{view.name}</code>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div
        className="border-b px-4"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1">
          {TABS.map((tab_item) => (
            <button
              key={tab_item.id}
              type="button"
              onClick={() => setTab(tab_item.id)}
              className="rounded px-2.5 py-1.5 text-xs"
              style={{
                background: tab === tab_item.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === tab_item.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {t(`view.tab.${tab_item.id}`, tab_item.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-auto scroll-thin p-4">
        {tab === 'overview' ? (
          <div className="space-y-4">
            <Card>
              <CardHead title={t('view.basicInfo', '基础信息')} />
              <CardBody>
                <dl className="divide-y rounded-md border text-xs" style={{ borderColor: 'var(--border)' }}>
                  <InfoRow label={t('view.name', '名称')} value={<code>{view.name}</code>} />
                  {view.title ? <InfoRow label={t('view.title', '标题')} value={view.title} /> : null}
                  <InfoRow
                    label={t('view.visibility', '可见性')}
                    value={
                      <Chip tone={view.public ? 'accent' : 'neutral'}>
                        {view.public ? t('view.public', '公开') : t('view.private', '私有')}
                      </Chip>
                    }
                  />
                  {view.description ? (
                    <InfoRow label={t('view.description', '描述')} value={<span>{view.description as string}</span>} />
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          </div>
        ) : tab === 'cubes' ? (
          <Card>
            <CardHead title={t('view.cubesTitle', '关联 Cube ({n})', { n: cubes.length })} />
            <CardBody className="p-0">
              {cubes.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-3">{t('view.noCubes', '此 View 尚未关联任何 Cube')}</div>
              ) : (
                <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {cubes.map((cube, i) => {
                    const cubeName = typeof cube === 'string' ? cube : (cube as { cube_name?: string }).cube_name ?? String(cube)
                    return (
                      <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                        <CheckCircle2 size={12} style={{ color: 'var(--violet)' }} />
                        <code className="font-mono text-xs text-1">{cubeName}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/semantic/cubes/${cubeName}`)}
                        >
                          {t('action.view', '查看')}
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : tab === 'materialize' ? (
          // P8: 物化历史列表
          <MaterializeRunsList
            runs={runsQuery.data?.runs ?? []}
            total={runsQuery.data?.total ?? 0}
            page={historyPage}
            pageSize={20}
            pageCount={runsQuery.data?.page_count ?? 0}
            loading={runsQuery.isLoading}
            error={runsQuery.isError}
            noViewId={!viewId}
            onPageChange={setHistoryPage}
          />
        ) : null}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
      <dt className="text-xs text-3">{label}</dt>
      <dd className="text-xs text-1">{value}</dd>
    </div>
  )
}

// ─── P8: 物化运行历史列表 ──────────────────────────────────────────────────────

function StatusRunChip({ status }: { status: string }) {
  const Icon = status === 'success' ? CheckCircle2 : status === 'running' ? Loader2 : AlertCircle
  const tone = status === 'success' ? 'success' : status === 'running' ? 'accent' : 'danger'
  return (
    <Chip tone={tone} className="flex items-center gap-1">
      <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} />
      {status}
    </Chip>
  )
}

function formatDuration(startedAt: string, finishedAt?: string | null): string {
  if (!finishedAt) return '—'
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function MaterializeRunsList({
  runs,
  total,
  page,
  pageSize: _pageSize,
  pageCount,
  loading,
  error,
  noViewId,
  onPageChange,
}: {
  runs: ViewMaterializeRun[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  loading: boolean
  error: boolean
  noViewId: boolean
  onPageChange: (p: number) => void
}) {
  if (noViewId) {
    return (
      <div className="rounded border px-4 py-6 text-center text-xs text-3" style={{ borderColor: 'var(--border)' }}>
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        {t('view.materialize.noId', 'View 尚未关联数据库 ID，物化历史暂不可用。请先触发一次物化。')}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6 text-center text-sm text-danger">
        {t('error.loadFailed', '加载失败')}
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-3">
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        {t('view.materialize.empty', '暂无物化记录，点击"触发物化"开始首次物化')}
      </div>
    )
  }

  return (
    <Card>
      <CardHead title={t('view.materializeHistoryCount', '物化历史 · {n} 条', { n: total })} />
      <CardBody className="p-0">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.status', '状态')}</th>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.startedAt', '开始时间')}</th>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.finishedAt', '结束时间')}</th>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.duration', '耗时')}</th>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.rows', '行数')}</th>
              <th className="px-3 py-2 text-left font-medium text-3">{t('col.error', '错误')}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="px-3 py-2"><StatusRunChip status={run.status} /></td>
                <td className="px-3 py-2 text-2 font-mono">{new Date(run.started_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2 text-2 font-mono">
                  {run.finished_at ? new Date(run.finished_at).toLocaleString('zh-CN') : '—'}
                </td>
                <td className="px-3 py-2 text-2">{formatDuration(run.started_at, run.finished_at)}</td>
                <td className="px-3 py-2 text-2">{run.rows != null ? run.rows.toLocaleString() : '—'}</td>
                <td className="px-3 py-2 text-danger max-w-[200px] truncate" title={run.error ?? undefined}>
                  {run.error ? (
                    <span className="flex items-center gap-1">
                      <AlertCircle size={10} />
                      <span className="truncate">{run.error}</span>
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 分页 */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            <span className="text-3">
              {t('pagination.total', '共 {total} 条，第 {page} / {pageCount} 页', { total, page, pageCount })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                className="rail-btn disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => onPageChange(page + 1)}
                className="rail-btn disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
