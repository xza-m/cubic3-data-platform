// frontend/src/v2/pages/semantic/cubes/Cubes.tsx
//
// Semantic Cubes 列表页 (L0)：Grid + Table 视图，Peek Panel。
// 接口：GET /api/v1/semantic/cubes
//
// drop-frontend: Cube 卡片不展示"下游 BI 数量"（backend has no design for downstream BI count — see plan §3.4）
// B-back-7: cube derivative counts 上线前，dimension/measure count 取 describe detail 的 .length

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes,
  Grid3x3,
  LayoutList,
  Plus,
  Search,
  GitBranch,
  TrendingUp,
} from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Card, CardBody, Chip, Input, Select } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
// 等待 X-Crosscut：@v2/components/PeekPanel
import { PeekPanel } from '@v2/components/PeekPanel'
import { ListPagination } from '@v2/components/ListPagination'
// 等待 X-Crosscut：@v2/layout/AppShell, @v2/layout/Inspector
import { useAppShell } from '@v2/layout/AppShell'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { fmtNum, fmtRelative } from '@v2/lib/format'
import { useCubeList, useCubeDetail } from '@v2/hooks/semantic'
import { CubeDetailContent, StatusChip } from '@v2/pages/semantic/_shared/cube-detail-content'
import type { CubeSummary } from '@v2/api/semantic'

const STATUS_OPTIONS = [
  { value: '', label: t('status.all', '全部状态') },
  { value: 'active', label: t('status.active', '已上线') },
  { value: 'review', label: t('status.review', '待审核') },
  { value: 'draft', label: t('status.draft', '草稿') },
  { value: 'deprecated', label: t('status.deprecated', '已弃用') },
]
const LIST_PAGE_SIZE = 20

export default function Cubes() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [peekName, setPeekName] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const cubeListQuery = useCubeList()
  const allCubes = useMemo<CubeSummary[]>(() => cubeListQuery.data?.cubes ?? [], [cubeListQuery.data])

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return allCubes.filter((c) => {
      if (status && c.status !== status) return false
      if (q && !`${c.title} ${c.name} ${c.domain_name ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [allCubes, keyword, status])
  const pageCount = Math.max(1, Math.ceil(rows.length / LIST_PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * LIST_PAGE_SIZE
    return rows.slice(start, start + LIST_PAGE_SIZE)
  }, [rows, safePage])

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    const byDomain: Record<string, number> = {}
    for (const c of allCubes) {
      byStatus[c.status ?? 'draft'] = (byStatus[c.status ?? 'draft'] || 0) + 1
      if (c.domain_name) byDomain[c.domain_name] = (byDomain[c.domain_name] || 0) + 1
    }
    return { byStatus, byDomain }
  }, [allCubes])

  useEffect(() => {
    setPage(1)
  }, [keyword, status])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.cubes', 'Cube')])
  }, [setBreadcrumbs])

  useEffect(() => {
    setTopBarActions(
      <>
        <RefreshButton
          onClick={() => cubeListQuery.refetch()}
          loading={cubeListQuery.isFetching}
          ariaLabel={t('cube.action.refresh', '刷新 Cube 列表')}
        />
        <Button size="sm" variant="primary" onClick={() => navigate('/semantic/cubes/new')}>
          <Plus size={12} /> {t('cube.create', '新建 Cube')}
        </Button>
      </>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, navigate, cubeListQuery])

  useEffect(() => {
    setContextPanel(null)
    return () => setContextPanel(null)
  }, [setContextPanel])

  const openPeek = (name: string) => setPeekName(name)
  const closePeek = () => setPeekName(null)

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="scroll-thin flex-1 overflow-auto p-5">
        <CubeSummaryBar
          cubeTotal={allCubes.length}
          active={stats.byStatus.active ?? 0}
          review={stats.byStatus.review ?? 0}
          draft={stats.byStatus.draft ?? 0}
        />

        {/* 工具栏 */}
        <div className="mt-4 mb-3 flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
              aria-hidden
            />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('cube.searchPlaceholder', '搜索 Cube 名称 / 标题…')}
              className="pl-7"
              aria-label={t('cube.searchLabel', '搜索 Cube')}
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-36"
            aria-label={t('cube.statusFilter', '状态筛选')}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="flex-1" />
          <span className="text-xs text-3">
            {rows.length} / {allCubes.length}
          </span>
          <div
            className="flex items-center gap-0.5 rounded-md border p-0.5"
            style={{ borderColor: 'var(--border)' }}
          >
            <Button
              size="sm"
              variant={view === 'grid' ? 'primary' : 'ghost'}
              onClick={() => setView('grid')}
              aria-label={t('view.grid', '卡片视图')}
            >
              <Grid3x3 size={12} />
            </Button>
            <Button
              size="sm"
              variant={view === 'list' ? 'primary' : 'ghost'}
              onClick={() => setView('list')}
              aria-label={t('view.list', '列表视图')}
            >
              <LayoutList size={12} />
            </Button>
          </div>
        </div>

        {/* 主体 */}
        {cubeListQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
        ) : cubeListQuery.isError ? (
          <Card>
            <CardBody className="px-6 py-12 text-center text-sm text-danger">
              {t('error.loadFailed', '加载失败，请重试')}
            </CardBody>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardBody className="px-6 py-12 text-center text-xs text-3">
              {t('cube.empty', '没有匹配的 Cube。')}{' '}
              <button
                className="mx-1 underline"
                style={{ color: 'var(--accent)' }}
                onClick={() => {
                  setKeyword('')
                  setStatus('')
                }}
                type="button"
              >
                {t('action.clearFilter', '清空筛选')}
              </button>
            </CardBody>
          </Card>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pagedRows.map((c) => (
              <CubeCard
                key={c.name}
                cube={c}
                onOpen={() => openPeek(c.name)}
                active={c.name === peekName}
              />
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <table className="wb-table">
              <thead>
                <tr>
                  <th>Cube</th>
                  <th>{t('cube.domain', '业务上下文')}</th>
                  <th>{t('cube.factTable', '事实表')}</th>
                  <th className="text-right">{t('cube.dimensionCountShort', '维度')}</th>
                  <th className="text-right">{t('cube.measureCountShort', '指标')}</th>
                  <th>{t('cube.status', '状态')}</th>
                  <th>{t('cube.lastModified', '最近更新')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((c) => (
                  <tr
                    key={c.name}
                    onClick={() => openPeek(c.name)}
                    style={{
                      cursor: 'pointer',
                      background:
                        c.name === peekName ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined,
                    }}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="obj-dot" style={{ background: 'var(--violet)' }}>
                          CB
                        </div>
                        <div>
                          <div className="font-medium text-1">{c.title}</div>
                          <div className="font-mono text-xs text-3">{c.name}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {c.domain_name ? <Chip tone="violet">{c.domain_name}</Chip> : <span className="text-3">—</span>}
                    </td>
                    <td>
                      <code className="font-mono text-xs">{c.fact_table ?? '—'}</code>
                    </td>
                    <td className="text-right tabular-nums">{fmtNum(c.dimension_count ?? 0)}</td>
                    <td className="text-right tabular-nums">{fmtNum(c.measure_count ?? 0)}</td>
                    <td>
                      {c.status ? <StatusChip status={c.status} /> : <span className="text-3">—</span>}
                    </td>
                    <td className="text-xs text-3" title={c.last_modified_at ?? undefined}>
                      {c.last_modified_at ? fmtRelative(c.last_modified_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <ListPagination
          page={safePage}
          pageSize={LIST_PAGE_SIZE}
          total={rows.length}
          onPageChange={setPage}
        />
      </div>

      {peekName ? (
        <CubePeek
          name={peekName}
          onClose={closePeek}
          onOpenFull={() => navigate(`/semantic/cubes/${peekName}`)}
          navigate={navigate}
        />
      ) : null}
    </div>
  )
}

function CubePeek({
  name,
  onClose,
  onOpenFull,
  navigate,
}: {
  name: string
  onClose: () => void
  onOpenFull: () => void
  navigate: (to: string) => void
}) {
  const detailQuery = useCubeDetail(name)
  const cube = detailQuery.data

  return (
    <PeekPanel
      open
      onClose={onClose}
      onOpenFull={onOpenFull}
      title={cube?.title ?? name}
      subtitle={cube ? <span className="font-mono">{cube.name} {cube.fact_table ? `· ${cube.fact_table}` : ''}</span> : null}
      badges={
        cube?.status ? (
          <span className="flex items-center gap-1">
            <StatusChip status={cube.status} />
            {cube.domain_name ? <Chip tone="violet">{cube.domain_name}</Chip> : null}
          </span>
        ) : null
      }
      size="medium"
    >
      {detailQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-3">{t('common.loading', '加载中…')}</div>
      ) : detailQuery.isError ? (
        <div className="px-4 py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
      ) : cube ? (
        <CubeDetailContent
          cube={cube}
          actions={{
            onOpenDesigner: () => { navigate(`/semantic/cubes/${cube.name}/edit`); onClose() },
            onJumpOntology: () => { navigate('/semantic/ontology/objects'); onClose() },
            onRunDiagnose: () => {
              navigate(`/semantic/workbench?tab=query&object=${encodeURIComponent(cube.name)}`)
              onClose()
            },
          }}
        />
      ) : null}
    </PeekPanel>
  )
}

function CubeSummaryBar({
  cubeTotal,
  active,
  review,
  draft,
}: {
  cubeTotal: number
  active: number
  review: number
  draft: number
}) {
  return (
    <div
      className="rounded-md border px-4 py-3"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-surface)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-1">
            <GitBranch size={14} /> Cube
          </div>
          <div className="mt-1 text-xs text-3">
            {t('cube.summaryDesc', '维护可复用的数据语义资产，统一管理事实表、维度、度量和发布状态。')}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-right">
          <SummaryMetric label={t('cube.total', 'Cube 总数')} value={cubeTotal} />
          <SummaryMetric label={t('status.active', '已上线')} value={active} tone="success" />
          <SummaryMetric label={t('status.review', '待审核')} value={review} tone="warning" />
          <SummaryMetric label={t('status.draft', '草稿')} value={draft} />
        </div>
      </div>
    </div>
  )
}

function SummaryMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'success' | 'warning'
}) {
  const color = tone === 'success' ? 'var(--success)' : tone === 'warning' ? 'var(--warning)' : 'var(--text-1)'
  return (
    <div className="min-w-16">
      <div className="text-[11px] text-3">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums" style={{ color }}>
        {fmtNum(value)}
      </div>
    </div>
  )
}

function CubeCard({
  cube,
  onOpen,
  active,
}: {
  cube: CubeSummary
  onOpen: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left transition-shadow hover:shadow-md focus-visible:ring-2"
      style={{ outlineColor: 'var(--accent)' }}
    >
      <Card
        className="h-full"
        style={
          active
            ? {
                borderColor: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface))',
              }
            : undefined
        }
      >
        <CardBody>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <div className="obj-dot shrink-0" style={{ background: 'var(--violet)' }}>
                CB
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-1">{cube.title}</div>
                {cube.domain_name ? (
                  <div className="mt-1">
                    <Chip tone="violet">{cube.domain_name}</Chip>
                  </div>
                ) : null}
              </div>
            </div>
            {cube.status ? <StatusChip status={cube.status} /> : null}
          </div>

          {cube.description ? (
            <p className="mb-3 text-xs text-3 line-clamp-2">{cube.description}</p>
          ) : null}

          {/* B-back-7: server-enriched counts. 不要 fallback 到 detail.length（避免 N+1） */}
          <div className="flex items-center gap-3 border-t pt-2 text-xs text-3" style={{ borderColor: 'var(--border)' }}>
            <span className="flex items-center gap-1" title={t('cube.dimensionCount', '维度数')}>
              <Boxes size={11} /> {fmtNum(cube.dimension_count ?? 0)}
            </span>
            <span className="flex items-center gap-1" title={t('cube.measureCount', '指标数')}>
              <TrendingUp size={11} /> {fmtNum(cube.measure_count ?? 0)}
            </span>
            {(cube.downstream_bi_count ?? 0) > 0 ? (
              <span className="flex items-center gap-1" title={t('cube.downstreamBi', '下游 BI 数')}>
                <GitBranch size={11} /> {fmtNum(cube.downstream_bi_count ?? 0)}
              </span>
            ) : null}
            <div className="flex-1" />
            {cube.last_modified_at ? (
              <span title={cube.last_modified_at}>{fmtRelative(cube.last_modified_at)}</span>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </button>
  )
}
