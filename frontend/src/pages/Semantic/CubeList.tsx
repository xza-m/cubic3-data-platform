import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Blocks,
  ChevronLeft,
  ChevronRight,
  Eye,
  PlusCircle,
  Search,
} from 'lucide-react'
import {
  describeCube,
  getBatchMaterializeStatus,
  listCubes,
  listViews,
  type CubeDetail,
  type CubeSummary,
} from '@/api/semantic'
import {
  SemanticEmptyState,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticSurface,
} from '@/components/Semantic/workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useUrlState } from '@/hooks/useUrlState'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'

type ObjectKind = 'cube' | 'view'

const PAGE_SIZE_OPTIONS = [9, 18, 36]

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

function CubeManagementSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-[42rem] rounded-3xl" />
    </div>
  )
}

function inferCubeCategory(item: CubeSummary) {
  if (item.type === 'dimension') return '维度模型'
  if (item.type === 'fact') return '事实模型'
  return item.measure_count > 2 ? '事实模型' : '维度模型'
}

function formatSummaryTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

function PaginationBar({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPageChange: (value: number) => void
  onPageSizeChange: (value: number) => void
}) {
  const safePageCount = Math.max(pageCount, 1)

  return (
    <div className="flex flex-col gap-3 border-t border-[hsl(var(--workbench-outline))] px-4 py-4">
      <div className="text-sm text-[hsl(var(--workbench-muted-foreground))]">
        共 {total} 条，当前第 {Math.min(page, safePageCount)} / {safePageCount} 页
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--workbench-muted-foreground))]">
          <span>每页</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-9 w-[92px] rounded-full border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.88)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} 条
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/80"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= safePageCount}
            className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/80"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function DetailMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]">{value}</div>
    </div>
  )
}

function DetailListSection({
  title,
  count,
  emptyText,
  items,
}: {
  title: string
  count: number
  emptyText: string
  items: Array<{
    key: string
    title: string
    subtitle?: string
    tag?: string
  }>
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-base font-semibold text-[hsl(var(--workbench-ink))]">
          {title}
        </div>
        <span className="text-sm text-[hsl(var(--workbench-muted-foreground))]">({count})</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] px-4 py-5 text-sm text-[hsl(var(--workbench-muted-foreground))]">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-white/86">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--workbench-outline))] px-4 py-3.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-mono text-[0.98rem] text-[hsl(var(--workbench-ink))]">{item.key}</div>
                <div className="mt-1 text-sm text-[hsl(var(--workbench-muted-foreground))]">{item.title}</div>
                {item.subtitle ? (
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.subtitle}</div>
                ) : null}
              </div>
              {item.tag ? (
                <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]">
                  {item.tag}
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function CubeList() {
  const [kind, setKind] = useUrlState<ObjectKind>('kind', 'cube')
  const [query, setQuery] = useUrlState<string>('q', '')
  const [page, setPage] = useUrlState<string>('page', '1')
  const [pageSize, setPageSize] = useUrlState<string>('page_size', '9')
  const [selectedName, setSelectedName] = useUrlState<string>('name', '')

  const pageNumber = parsePositiveInt(page, 1)
  const pageSizeNumber = parsePositiveInt(pageSize, 9)
  const trimmedQuery = query.trim()

  const { data: cubeSummaryData } = useQuery({
    queryKey: ['semantic', 'cube-card-summary'],
    queryFn: async () => {
      const [cubesRes, viewsRes] = await Promise.all([listCubes(), listViews()])
      return {
        cubes: cubesRes.data.cubes ?? [],
        views: viewsRes.data.views ?? [],
      }
    },
  })

  const {
    data: cubesData,
    isLoading: cubesLoading,
  } = useQuery({
    queryKey: ['semantic', 'cubes', { q: trimmedQuery, page: pageNumber, pageSize: pageSizeNumber }],
    queryFn: async () => (
      await listCubes({
        q: trimmedQuery || undefined,
        page: pageNumber,
        page_size: pageSizeNumber,
      })
    ).data,
    enabled: kind === 'cube',
  })

  const {
    data: viewsData,
    isLoading: viewsLoading,
  } = useQuery({
    queryKey: ['semantic', 'views', { q: trimmedQuery, page: pageNumber, pageSize: pageSizeNumber }],
    queryFn: async () => (
      await listViews({
        q: trimmedQuery || undefined,
        page: pageNumber,
        page_size: pageSizeNumber,
      })
    ).data,
    enabled: kind === 'view',
  })

  const { data: materializeStatusMap } = useQuery({
    queryKey: ['semantic', 'materialize-status'],
    queryFn: async () => (await getBatchMaterializeStatus()).data,
    enabled: kind === 'view',
  })

  const cubes = cubesData?.cubes ?? []
  const views = viewsData?.views ?? []
  const total = kind === 'cube' ? (cubesData?.total ?? 0) : (viewsData?.total ?? 0)
  const pageCount = kind === 'cube' ? (cubesData?.page_count ?? 0) : (viewsData?.page_count ?? 0)
  const isLoading = kind === 'cube' ? cubesLoading : viewsLoading

  const summaryCubes = cubeSummaryData?.cubes ?? []
  const summaryViews = cubeSummaryData?.views ?? []
  const factCount = summaryCubes.filter((item) => inferCubeCategory(item) === '事实模型').length
  const dimensionCount = summaryCubes.filter((item) => inferCubeCategory(item) === '维度模型').length

  const pageMeta = useMemo(() => {
    return {
      total,
      pageCount: Math.max(pageCount, total === 0 ? 1 : 0),
    }
  }, [pageCount, total])

  useEffect(() => {
    if (pageCount > 0 && pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  useEffect(() => {
    const currentItems = kind === 'cube' ? cubes : views
    if (!currentItems.length) {
      if (selectedName) {
        setSelectedName('')
      }
      return
    }
    if (!selectedName || !currentItems.some((item) => item.name === selectedName)) {
      setSelectedName(currentItems[0].name)
    }
  }, [cubes, kind, selectedName, setSelectedName, views])

  const selectedCube = useMemo(
    () => cubes.find((item) => item.name === selectedName) ?? cubes[0] ?? null,
    [cubes, selectedName],
  )
  const selectedView = useMemo(
    () => views.find((item) => item.name === selectedName) ?? views[0] ?? null,
    [selectedName, views],
  )

  const { data: cubeDetail, isLoading: cubeDetailLoading } = useQuery({
    queryKey: ['semantic', 'cube-detail-pane', selectedName],
    queryFn: async () => (await describeCube(selectedName)).data as CubeDetail,
    enabled: kind === 'cube' && !!selectedName,
  })

  if (isLoading) {
    return <CubeManagementSkeleton />
  }

  const measureItems = cubeDetail
    ? Object.entries(cubeDetail.measures).map(([key, value]) => ({
        key,
        title: value.title,
        subtitle: value.description || value.type,
        tag: value.type,
      }))
    : []

  const dimensionItems = cubeDetail
    ? Object.entries(cubeDetail.dimensions).map(([key, value]) => ({
        key,
        title: value.title,
        subtitle: value.primary_key ? '主键字段' : value.enum ? `${Object.keys(value.enum).length} 个枚举值` : value.type,
        tag: value.type,
      }))
    : []

  const activeCubeName = cubeDetail?.name ?? selectedCube?.name ?? ''
  const activeCubeTitle = cubeDetail?.title ?? selectedCube?.title ?? ''
  const activeCubeDescription = cubeDetail?.description || selectedCube?.description || '当前 Cube 还没有补充业务说明。'
  const activeCubeStatus = cubeDetail?.status || selectedCube?.status || 'draft'

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="Cube 管理"
        description="按资源浏览器方式查看 Cube 与 View，左侧选择对象，右侧阅读摘要并继续设计。"
        status="ready"
        eyebrow="Cube Studio"
        meta={
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{factCount} 个事实模型</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{dimensionCount} 个维度模型</Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">{summaryViews.length} 个 View</Badge>
          </>
        }
        actions={
          <Button asChild className="h-10 rounded-full px-4 shadow-[0_14px_28px_rgba(67,97,238,0.16)]">
            <Link to="/semantic/cubes/new">
              <PlusCircle className="mr-1.5 h-4 w-4" />
              新建 Cube
            </Link>
          </Button>
        }
      />

      <SemanticSurface bodyClassName="p-0">
        <div className="border-b border-[hsl(var(--workbench-outline))] px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-full border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.96)] p-1">
                {([
                  { value: 'cube', label: 'Cube', icon: Blocks },
                  { value: 'view', label: 'View', icon: Eye },
                ] as const).map((item) => {
                  const Icon = item.icon
                  const active = kind === item.value
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setKind(item.value)
                        setPage('1')
                        setSelectedName('')
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                        active
                          ? 'bg-[hsl(var(--workbench-accent))] text-white'
                          : 'text-[hsl(var(--workbench-muted-foreground))]',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--workbench-surface-2))] px-2.5 py-1">
                  {kind === 'cube' ? `${total} 个模型` : `${total} 个 View`}
                </span>
              </div>
            </div>
            <div className="flex w-full max-w-[30rem] items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
                <Input
                  name="semantic_object_search"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage('1')
                    setSelectedName('')
                  }}
                  placeholder={kind === 'cube' ? '搜索 Cube 名称、说明或所属领域…' : '搜索 View 名称或说明…'}
                  className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white pl-9"
                  data-testid="cube-management-search"
                />
              </div>
              {kind === 'cube' && selectedCube ? (
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white px-4"
                >
                  <Link to={`/semantic/cubes/${selectedCube.name}/edit`}>继续设计</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid min-h-[42rem] xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(250,252,255,0.72)]">
            <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
                {kind === 'cube' ? 'Models' : 'Views'}
              </div>
            </div>
            <div className="max-h-[34rem] space-y-1.5 overflow-auto p-3">
              {(kind === 'cube' ? cubes : views).map((item) => {
                const active = item.name === selectedName
                const isCube = kind === 'cube'
                const cube = item as CubeSummary
                const category = isCube ? inferCubeCategory(cube) : null
                return (
                  <div
                    key={item.name}
                    data-testid={`cube-management-item-${item.name}`}
                    className={cn(
                      'rounded-[var(--workbench-radius-sm)] border px-4 py-3 transition-all',
                      active
                        ? 'border-[hsl(var(--workbench-accent))]/25 bg-[hsl(var(--workbench-accent-soft))]'
                        : 'border-transparent bg-white/80 hover:border-[hsl(var(--workbench-outline))] hover:bg-white',
                    )}
                  >
                    <button type="button" onClick={() => setSelectedName(item.name)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[0.98rem] font-semibold text-[hsl(var(--workbench-ink))]">{item.title}</div>
                          <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.name}</div>
                        </div>
                        <div className={cn('rounded-lg p-2', active ? 'bg-white text-[hsl(var(--workbench-accent))]' : 'bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]')}>
                          {isCube ? <Blocks className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                        {item.description || '当前对象还没有补充说明。'}
                      </div>
                    </button>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {isCube ? (
                        <>
                          <Badge variant="outline" className="border-transparent bg-white/94 text-[hsl(var(--workbench-muted-foreground))]">
                            {category}
                          </Badge>
                          <Badge variant="outline" className="border-transparent bg-white/94 text-[hsl(var(--workbench-muted-foreground))]">
                            {cube.dimension_count} 维度 / {cube.measure_count} 指标
                          </Badge>
                        </>
                      ) : (
                        <Badge variant="outline" className="border-transparent bg-white/94 text-[hsl(var(--workbench-muted-foreground))]">
                          {(item as any).cube_count} 个引用 Cube
                        </Badge>
                      )}
                    </div>
                    {isCube ? (
                      <div className="mt-3 flex items-center justify-end">
                        <Button asChild variant="outline" size="sm" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/86">
                          <Link to={`/semantic/cubes/${item.name}/edit`} data-testid={`cube-open-design-${item.name}`}>
                            进入设计
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              {(kind === 'cube' ? cubes : views).length === 0 ? (
                <SemanticEmptyState
                  icon={kind === 'cube' ? <Blocks className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                  title={kind === 'cube' ? '没有命中当前条件的 Cube' : '没有命中当前条件的 View'}
                  description={trimmedQuery ? '试试更短的关键词，或者清空搜索条件后重新浏览。' : '当前还没有可浏览的对象。'}
                />
              ) : null}
            </div>
            <PaginationBar
              page={pageNumber}
              pageCount={pageMeta.pageCount}
              total={pageMeta.total}
              pageSize={pageSizeNumber}
              onPageChange={(nextPage) => setPage(String(nextPage))}
              onPageSizeChange={(nextPageSize) => {
                setPage('1')
                setPageSize(String(nextPageSize))
              }}
            />
          </aside>

          <section className="bg-[rgba(255,255,255,0.84)]">
            {kind === 'cube' ? (
              selectedCube ? (
                cubeDetailLoading ? (
                  <div className="space-y-4 px-6 py-6">
                    <Skeleton className="h-24 rounded-2xl" />
                    <Skeleton className="h-20 rounded-2xl" />
                    <Skeleton className="h-64 rounded-2xl" />
                  </div>
                ) : (
                  <>
                    <div className="border-b border-[hsl(var(--workbench-outline))] px-6 py-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-[1.6rem] font-semibold tracking-[-0.04em] text-[hsl(var(--workbench-ink))]" data-semantic-display="true">
                              {activeCubeTitle}
                            </h3>
                            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]">
                              {getSemanticStatusLabel(activeCubeStatus)}
                            </Badge>
                          </div>
                          <div className="font-mono text-sm text-[hsl(var(--workbench-muted-foreground))]">{activeCubeName}</div>
                          <p className="max-w-3xl text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                            {activeCubeDescription}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild className="rounded-full px-4">
                            <Link to={`/semantic/cubes/${activeCubeName}/edit`}>进入设计</Link>
                          </Button>
                          <Button asChild variant="outline" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/84 px-4">
                            <Link to={`/semantic/cubes/${activeCubeName}`}>查看详情</Link>
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <DetailMetric label="所属领域" value={cubeDetail?.domain_name || selectedCube.domain_name || '未归属'} />
                        <DetailMetric label="物理表" value={cubeDetail?.table || selectedCube.table || '未绑定'} />
                        <DetailMetric
                          label="维度 / 指标"
                          value={
                            cubeDetail
                              ? `${Object.keys(cubeDetail.dimensions).length} / ${Object.keys(cubeDetail.measures).length}`
                              : `${selectedCube.dimension_count} / ${selectedCube.measure_count}`
                          }
                        />
                        <DetailMetric label="最近变更" value={formatSummaryTime(cubeDetail?.state_summary?.updated_at || selectedCube.state_summary?.updated_at)} />
                      </div>

                      {cubeDetail ? (
                        <div className="grid gap-6 xl:grid-cols-2">
                          <DetailListSection
                            title="指标 Measures"
                            count={measureItems.length}
                            emptyText="当前没有定义指标。"
                            items={measureItems}
                          />
                          <DetailListSection
                            title="维度 Dimensions"
                            count={dimensionItems.length}
                            emptyText="当前没有定义维度。"
                            items={dimensionItems}
                          />
                        </div>
                      ) : (
                        <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/72 px-4 py-5 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                          当前先展示模型摘要；如需继续维护维度、指标和关联，请直接进入设计页。
                        </div>
                      )}
                    </div>
                  </>
                )
              ) : (
                <SemanticEmptyState
                  icon={<Blocks className="h-6 w-6" />}
                  title="先从左侧选择一个 Cube"
                  description="右侧会展示当前模型的维度、指标和基础摘要。"
                />
              )
            ) : selectedView ? (
              <>
                <div className="border-b border-[hsl(var(--workbench-outline))] px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[1.6rem] font-semibold tracking-[-0.04em] text-[hsl(var(--workbench-ink))]" data-semantic-display="true">
                          {selectedView.title}
                        </h3>
                        <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]">
                          {selectedView.public ? '公开' : '私有'}
                        </Badge>
                      </div>
                      <div className="font-mono text-sm text-[hsl(var(--workbench-muted-foreground))]">{selectedView.name}</div>
                      <p className="max-w-3xl text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                        {selectedView.description || '当前 View 还没有补充业务说明。'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button asChild className="rounded-full px-4" data-testid={`cube-open-design-${selectedView.name}`}>
                        <Link to={`/semantic/views/${selectedView.name}`}>查看 View</Link>
                      </Button>
                      <Button asChild variant="outline" className="rounded-full border-[hsl(var(--workbench-outline))] bg-white/84 px-4">
                        <Link to="/semantic/tools">打开开发工具</Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 px-6 py-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <DetailMetric label="引用 Cube" value={selectedView.cube_count} />
                    <DetailMetric label="发布状态" value={materializeStatusMap?.[selectedView.name]?.materialized ? '已发布' : '未发布'} />
                    <DetailMetric label="可见性" value={selectedView.public ? '公开' : '私有'} />
                  </div>
                  <div className="rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.86)] px-4 py-4 text-sm leading-7 text-[hsl(var(--workbench-muted-foreground))]">
                    View 用于统一消费语义对象，通常与上游 Cube 配套维护。
                  </div>
                </div>
              </>
            ) : (
              <SemanticEmptyState
                icon={<Eye className="h-6 w-6" />}
                title="先从左侧选择一个 View"
                description="右侧会展示当前 View 的基本信息和可用动作。"
              />
            )}
          </section>
        </div>
      </SemanticSurface>
    </SemanticPageShell>
  )
}
