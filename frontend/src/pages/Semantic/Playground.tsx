/**
 * Playground —— 模型浏览与消费验证工作区
 *
 * 对标 Cube Playground，提供模型的维度/指标成员级别浏览、搜索，
 * 以及跨工作区跳转（IDE / Visual Model）。
 *
 * 对象归属规则：Cube/View 在这里 **看**，在 IDE **改**，在 Visual Model 作为节点引用。
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Blocks,
  Eye,
  ExternalLink,
  FileCode,
  GitBranch,
  Hash,
  Key,
  Search,
  Tag,
} from 'lucide-react'
import {
  describeCube,
  describeView,
  getBatchMaterializeStatus,
  listCubes,
  listViews,
  type CubeDetail,
  type CubeSummary,
  type DimensionInfo,
  type MaterializeStatus,
  type MeasureInfo,
  type ViewSummary,
} from '@/api/semantic'
import { useUrlState } from '@/hooks/useUrlState'
import {
  SemanticEmptyState,
  SemanticPageHeader,
  SemanticPageShell,
} from '@/components/Semantic/workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'

type ObjectKind = 'cube' | 'view'
type MemberTab = 'dimensions' | 'measures'

interface ViewData {
  name: string
  title: string
  description?: string
  public: boolean
  cubes: Array<{
    join_path: string
    includes: string[] | '*'
    excludes: string[]
    prefix: boolean
  }>
  diagnostics?: Array<{ level: string; message: string }>
}

/* ── skeleton ── */

function PlaygroundSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
        <Skeleton className="h-[44rem] rounded-2xl" />
        <Skeleton className="h-[44rem] rounded-2xl" />
        <Skeleton className="h-[44rem] rounded-2xl" />
      </div>
    </div>
  )
}

/* ── helpers ── */

function inferCubeType(detail?: CubeDetail) {
  if (!detail) return '未知'
  return Object.keys(detail.measures).length > 2 ? '事实模型' : '维度模型'
}


/* ── object list (left pane) ── */

function ObjectBrowser({
  kind,
  setKind,
  items,
  selectedName,
  onSelect,
  query,
  onQueryChange,
  matStatuses,
}: {
  kind: ObjectKind
  setKind: (kind: ObjectKind) => void
  items: Array<CubeSummary | ViewSummary>
  selectedName: string
  onSelect: (name: string) => void
  query: string
  onQueryChange: (q: string) => void
  matStatuses?: Record<string, MaterializeStatus>
}) {
  return (
    <section className="flex flex-col rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm">
      {/* toolbar */}
      <div className="border-b border-[hsl(var(--workbench-outline))] px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex rounded-full border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-0.5">
            {([
              { value: 'cube' as const, label: 'Cubes', icon: Blocks },
              { value: 'view' as const, label: 'Views', icon: Eye },
            ]).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setKind(item.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  kind === item.value
                    ? 'bg-[hsl(var(--workbench-accent))] text-white'
                    : 'text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))]',
                )}
              >
                <item.icon className="h-3 w-3" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={kind === 'cube' ? '搜索 Cube、维度或指标...' : '搜索 View...'}
            className="h-8 pl-8 text-xs"
            data-testid="playground-search"
          />
        </div>
      </div>

      {/* list */}
      <div className="max-h-[44rem] flex-1 space-y-1 overflow-y-auto p-2">
        {items.length ? (
          items.map((item) => {
            const isActive = item.name === selectedName
            const Icon = kind === 'cube' ? Blocks : Eye
            const isCube = kind === 'cube'
            const cubeSummary = isCube ? (item as CubeSummary) : undefined
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => onSelect(item.name)}
                data-testid={`playground-item-${item.name}`}
                className={cn(
                  'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-[hsl(var(--workbench-accent-soft))] ring-1 ring-[hsl(var(--workbench-accent))]/20'
                    : 'hover:bg-[hsl(var(--workbench-panel))]',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 rounded-md border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] p-1.5">
                    <Icon className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[hsl(var(--workbench-ink))]">
                      {item.title}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
                      {item.name}
                    </div>
                    <div
                      className="mt-1.5 flex gap-3 text-[11px] text-[hsl(var(--workbench-muted-foreground))]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {cubeSummary ? (
                        <>
                          <span>{cubeSummary.dimension_count} 维度</span>
                          <span>{cubeSummary.measure_count} 指标</span>
                        </>
                      ) : (
                        <>
                          <span>{(item as ViewSummary).cube_count} Cube</span>
                          <span>
                            {matStatuses?.[item.name]?.materialized ? '已发布' : '未发布'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {cubeSummary?.status && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {getSemanticStatusLabel(cubeSummary.status)}
                    </Badge>
                  )}
                </div>
              </button>
            )
          })
        ) : (
          <div className="px-3 py-10 text-center text-sm text-[hsl(var(--workbench-muted-foreground))]">
            没有匹配项
          </div>
        )}
      </div>
    </section>
  )
}

/* ── member table (center pane) ── */

function DimensionRow({ name, info }: { name: string; info: DimensionInfo }) {
  return (
    <tr className="border-b border-[hsl(var(--workbench-outline))]/50 last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {info.primary_key && <span title="主键"><Key className="h-3 w-3 text-amber-500" /></span>}
          <span className="font-mono text-xs text-[hsl(var(--workbench-ink))]">{name}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
        {info.title}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className="text-[10px]">{info.type}</Badge>
      </td>
      <td className="px-3 py-2">
        {info.enum && (
          <span className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
            枚举 {Object.keys(info.enum).length}
          </span>
        )}
      </td>
    </tr>
  )
}

function MeasureRow({ name, info }: { name: string; info: MeasureInfo }) {
  return (
    <tr className="border-b border-[hsl(var(--workbench-outline))]/50 last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {info.certified && (
            <span className="rounded-sm bg-emerald-100 px-1 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              ✓
            </span>
          )}
          <span className="font-mono text-xs text-[hsl(var(--workbench-ink))]">{name}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
        {info.title}
      </td>
      <td className="px-3 py-2">
        <Badge variant="secondary" className="text-[10px]">{info.type}</Badge>
      </td>
      <td className="px-3 py-2 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
        {info.format || info.unit || '—'}
      </td>
    </tr>
  )
}

function CubeMemberBrowser({
  detail,
  memberFilter,
  onMemberFilterChange,
}: {
  detail?: CubeDetail
  memberFilter: string
  onMemberFilterChange: (v: string) => void
}) {
  const [tab, setTab] = useState<MemberTab>('dimensions')

  const dimensions = useMemo(() => {
    const entries = Object.entries(detail?.dimensions || {})
    const kw = memberFilter.trim().toLowerCase()
    if (!kw) return entries
    return entries.filter(
      ([key, val]) =>
        key.toLowerCase().includes(kw) || (val.title && val.title.toLowerCase().includes(kw)),
    )
  }, [detail?.dimensions, memberFilter])

  const measures = useMemo(() => {
    const entries = Object.entries(detail?.measures || {})
    const kw = memberFilter.trim().toLowerCase()
    if (!kw) return entries
    return entries.filter(
      ([key, val]) =>
        key.toLowerCase().includes(kw) || (val.title && val.title.toLowerCase().includes(kw)),
    )
  }, [detail?.measures, memberFilter])

  const totalDims = Object.keys(detail?.dimensions || {}).length
  const totalMeasures = Object.keys(detail?.measures || {}).length

  return (
    <div className="flex flex-col">
      {/* tab header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--workbench-outline))] px-4 py-2">
        <div className="flex gap-1">
          {([
            { value: 'dimensions' as const, label: `维度 (${totalDims})`, icon: Tag },
            { value: 'measures' as const, label: `指标 (${totalMeasures})`, icon: Hash },
          ]).map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                tab === item.value
                  ? 'bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]'
                  : 'text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))]',
              )}
            >
              <item.icon className="h-3 w-3" />
              {item.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            value={memberFilter}
            onChange={(e) => onMemberFilterChange(e.target.value)}
            placeholder="筛选成员..."
            className="h-7 w-44 pl-7 text-[11px]"
            data-testid="playground-member-filter"
          />
        </div>
      </div>

      {/* member table */}
      <div className="max-h-[38rem] overflow-y-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))]">
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--workbench-muted-foreground))]">
                名称
              </th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--workbench-muted-foreground))]">
                标题
              </th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--workbench-muted-foreground))]">
                类型
              </th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--workbench-muted-foreground))]">
                {tab === 'dimensions' ? '枚举' : '格式'}
              </th>
            </tr>
          </thead>
          <tbody>
            {tab === 'dimensions'
              ? dimensions.map(([key, info]) => (
                  <DimensionRow key={key} name={key} info={info} />
                ))
              : measures.map(([key, info]) => (
                  <MeasureRow key={key} name={key} info={info} />
                ))}
            {(tab === 'dimensions' ? dimensions : measures).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-[hsl(var(--workbench-muted-foreground))]">
                  {memberFilter ? '没有匹配的成员' : `暂无${tab === 'dimensions' ? '维度' : '指标'}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ViewMemberBrowser({ detail }: { detail?: ViewData }) {
  if (!detail) return null
  return (
    <div className="space-y-4 p-4">
      <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">引用 Cube 映射</div>
      {(detail.cubes || []).map((cubeRef) => (
        <div
          key={cubeRef.join_path}
          className="rounded-lg border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-3 py-3"
        >
          <div className="font-mono text-xs text-[hsl(var(--workbench-ink))]">
            {cubeRef.join_path}
          </div>
          <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
            includes:{' '}
            {Array.isArray(cubeRef.includes) ? cubeRef.includes.join(', ') : '全部字段'}
          </div>
        </div>
      ))}
      {detail.diagnostics && detail.diagnostics.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">诊断项</div>
          {detail.diagnostics.map((d, i) => (
            <div
              key={i}
              className={cn(
                'rounded-md border px-3 py-2 text-xs',
                d.level === 'error'
                  ? 'border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/8 text-[hsl(var(--semantic-error))]'
                  : 'border-[hsl(var(--semantic-warn))]/20 bg-[hsl(var(--semantic-warn))]/8 text-[hsl(var(--semantic-warn))]',
              )}
            >
              {d.message}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── summary sidebar (right pane) ── */

function CubeSummaryPanel({
  detail,
  selectedName,
}: {
  detail?: CubeDetail
  selectedName: string
}) {
  if (!detail) return null

  const stats = [
    { label: '类型', value: inferCubeType(detail) },
    { label: '所属领域', value: detail.domain_name || '未归属' },
    { label: '维度', value: Object.keys(detail.dimensions).length },
    { label: '指标', value: Object.keys(detail.measures).length },
    { label: '关联', value: Object.keys(detail.joins || {}).length },
    { label: '来源表', value: detail.table },
  ]

  return (
    <aside className="flex flex-col rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm">
      {/* header */}
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
          Cube
        </div>
        <h2 className="mt-1 text-base font-semibold text-[hsl(var(--workbench-ink))]">
          {detail.title || selectedName}
        </h2>
        <div className="mt-0.5 font-mono text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
          {selectedName}
        </div>
        {detail.status && (
          <Badge variant="outline" className="mt-2">
            {getSemanticStatusLabel(detail.status)}
          </Badge>
        )}
      </div>

      {/* description */}
      {detail.description && (
        <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
          {detail.description}
        </div>
      )}

      {/* stats */}
      <div className="flex-1 space-y-1 px-4 py-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-1">
            <span className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
              {s.label}
            </span>
            <span className="text-xs font-medium text-[hsl(var(--workbench-ink))]">{s.value}</span>
          </div>
        ))}
      </div>

      {/* cross-workspace actions */}
      <div className="border-t border-[hsl(var(--workbench-outline))] px-4 py-3 space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))] mb-2">
          快捷操作
        </div>
        <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs" asChild>
          <Link to={`/semantic/cubes/${selectedName}`}>
            <Blocks className="h-3.5 w-3.5" />
            查看详情
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs" asChild>
          <Link to={`/semantic/cubes/${selectedName}/edit`}>
            <FileCode className="h-3.5 w-3.5" />
            IDE 编辑
          </Link>
        </Button>
        {detail.domain_id && (
          <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs" asChild>
            <Link to={`/semantic/domains/${detail.domain_id}`}>
              <GitBranch className="h-3.5 w-3.5" />
              进入画布
            </Link>
          </Button>
        )}
      </div>
    </aside>
  )
}

function ViewSummaryPanel({
  detail,
  selectedName,
  matStatus,
}: {
  detail?: ViewData
  selectedName: string
  matStatus?: MaterializeStatus
}) {
  if (!detail) return null

  const stats = [
    { label: '可见性', value: detail.public ? '公开' : '私有' },
    { label: '引用 Cube', value: detail.cubes?.length || 0 },
    { label: '发布状态', value: matStatus?.materialized ? '已发布' : '未发布' },
    { label: '诊断项', value: detail.diagnostics?.length || 0 },
  ]

  return (
    <aside className="flex flex-col rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm">
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
          View
        </div>
        <h2 className="mt-1 text-base font-semibold text-[hsl(var(--workbench-ink))]">
          {detail.title || selectedName}
        </h2>
        <div className="mt-0.5 font-mono text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
          {selectedName}
        </div>
        <Badge variant="outline" className="mt-2">
          {detail.public ? '公开' : '私有'}
        </Badge>
      </div>

      {detail.description && (
        <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
          {detail.description}
        </div>
      )}

      <div className="flex-1 space-y-1 px-4 py-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-1">
            <span className="text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
              {s.label}
            </span>
            <span className="text-xs font-medium text-[hsl(var(--workbench-ink))]">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-[hsl(var(--workbench-outline))] px-4 py-3 space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))] mb-2">
          快捷操作
        </div>
        <Button size="sm" variant="outline" className="w-full justify-start gap-2 text-xs" asChild>
          <Link to={`/semantic/views/${selectedName}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            查看 View 详情
          </Link>
        </Button>
      </div>
    </aside>
  )
}

/* ── main ── */

export default function Playground() {
  const [kind, setKind] = useUrlState<ObjectKind>('kind', 'cube')
  const [selectedName, setSelectedName] = useUrlState<string>('name', '')
  const [query, setQuery] = useUrlState<string>('q', '')
  const [memberFilter, setMemberFilter] = useState('')

  const { data: cubesData, isLoading: cubesLoading } = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })
  const { data: viewsData, isLoading: viewsLoading } = useQuery({
    queryKey: ['semantic', 'views'],
    queryFn: async () => (await listViews()).data,
  })
  const { data: matStatusData } = useQuery({
    queryKey: ['semantic', 'materialize-status'],
    queryFn: async () => (await getBatchMaterializeStatus()).data,
    enabled: !viewsLoading,
  })

  const cubes = cubesData?.cubes ?? []
  const views = viewsData?.views ?? []
  const isLoading = cubesLoading || viewsLoading

  // filter objects by search (including member name match for cubes)
  const filteredCubes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return cubes.filter((cube) => {
      if (!keyword) return true
      return [cube.name, cube.title, cube.description || '', cube.domain_name || ''].some((v) =>
        v.toLowerCase().includes(keyword),
      )
    })
  }, [cubes, query])

  const filteredViews = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return views.filter((view) => {
      if (!keyword) return true
      return [view.name, view.title, view.description || ''].some((v) =>
        v.toLowerCase().includes(keyword),
      )
    })
  }, [query, views])

  // auto-select first item
  useEffect(() => {
    const currentItems = kind === 'cube' ? filteredCubes : filteredViews
    if (!currentItems.length) return
    if (!selectedName || !currentItems.some((item) => item.name === selectedName)) {
      setSelectedName(currentItems[0].name)
    }
  }, [filteredCubes, filteredViews, kind, selectedName, setSelectedName])

  // fetch selected object detail
  const { data: cubeDetail } = useQuery({
    queryKey: ['semantic', 'cube', selectedName],
    queryFn: async () => (await describeCube(selectedName)).data as CubeDetail,
    enabled: kind === 'cube' && !!selectedName,
  })
  const { data: viewDetail } = useQuery({
    queryKey: ['semantic', 'view', selectedName],
    queryFn: async () => (await describeView(selectedName)).data as ViewData,
    enabled: kind === 'view' && !!selectedName,
  })

  // reset member filter when selection changes
  useEffect(() => {
    setMemberFilter('')
  }, [selectedName])

  if (isLoading) return <PlaygroundSkeleton />

  const currentItems = kind === 'cube' ? filteredCubes : filteredViews
  const currentMatStatus: MaterializeStatus | undefined =
    kind === 'view' ? matStatusData?.[selectedName] : undefined

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="Playground"
        description="浏览模型的维度、指标与归属信息。查看成员定义后可跳转到 IDE 编辑或 Visual Model 查看关系。"
        status="ready"
        meta={
          <>
            <Badge variant="outline">{cubes.length} Cubes</Badge>
            <Badge variant="outline">{views.length} Views</Badge>
          </>
        }
        actions={
          <Button asChild>
            <Link to="/semantic/cubes/new">新建 Cube</Link>
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_260px]">
        {/* left: object browser */}
        <ObjectBrowser
          kind={kind}
          setKind={setKind}
          items={currentItems}
          selectedName={selectedName}
          onSelect={setSelectedName}
          query={query}
          onQueryChange={setQuery}
          matStatuses={matStatusData}
        />

        {/* center: member browser */}
        <section className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] shadow-sm">
          {!selectedName ? (
            <SemanticEmptyState
              icon={<Blocks className="h-6 w-6" />}
              title="选择一个模型查看成员"
              description="从左侧选择 Cube 或 View 后，查看维度、指标等详细定义。"
            />
          ) : kind === 'cube' ? (
            <CubeMemberBrowser
              detail={cubeDetail}
              memberFilter={memberFilter}
              onMemberFilterChange={setMemberFilter}
            />
          ) : (
            <ViewMemberBrowser detail={viewDetail} />
          )}
        </section>

        {/* right: summary sidebar */}
        {selectedName ? (
          kind === 'cube' ? (
            <CubeSummaryPanel detail={cubeDetail} selectedName={selectedName} />
          ) : (
            <ViewSummaryPanel
              detail={viewDetail}
              selectedName={selectedName}
              matStatus={currentMatStatus}
            />
          )
        ) : (
          <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))]" />
        )}
      </div>
    </SemanticPageShell>
  )
}
