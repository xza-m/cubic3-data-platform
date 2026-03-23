import { useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Blocks, ChevronLeft, ChevronRight, GitBranch } from 'lucide-react'
import {
  describeCube,
  getBatchMaterializeStatus,
  listCubes,
  listViews,
  type CubeDetail,
} from '@/api/semantic'
import { CubePreviewPanel } from '@/components/Semantic/CubeList/CubePreviewPanel'
import { CubeTable } from '@/components/Semantic/CubeList/CubeTable'
import { CubeToolbar } from '@/components/Semantic/CubeList/CubeToolbar'
import {
  formatSummaryTime,
  getCubeAttentionReasons,
  getCubeRowPriority,
  isCubeInDomain,
  isCubeSourceBound,
  matchesCubeBinding,
  matchesCubeDomain,
  matchesCubeFocus,
  matchesCubeQuery,
  matchesCubeStatus,
  matchesViewQuery,
  type CubeBindingFilter,
  type CubeDomainFilter,
  type CubeFocusFilter,
  type CubeStatusFilter,
} from '@/components/Semantic/CubeList/cubeListUtils'
import {
  SemanticEmptyState,
  SemanticPageHeader,
  SemanticPageShell,
  SemanticStatusBanner,
  SemanticSurface,
  type SemanticValidationSummary,
} from '@/components/Semantic/workbench'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUrlState } from '@/hooks/useUrlState'

type ObjectKind = 'cube' | 'view'

const PAGE_SIZE_OPTIONS = [10, 20, 40]

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
      <Skeleton className="h-28 rounded-3xl" />
      <Skeleton className="h-[42rem] rounded-3xl" />
    </div>
  )
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
    <div className="flex flex-col gap-3 border-t border-[hsl(var(--workbench-outline))] px-5 py-4">
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

export default function CubeList() {
  const [, setSearchParams] = useSearchParams()
  const [kind] = useUrlState<ObjectKind>('kind', 'cube')
  const [query] = useUrlState<string>('q', '')
  const [page, setPage] = useUrlState<string>('page', '1')
  const [pageSize, setPageSize] = useUrlState<string>('page_size', '10')
  const [selectedName, setSelectedName] = useUrlState<string>('name', '')
  const [focus] = useUrlState<CubeFocusFilter>('focus', 'all')
  const [status] = useUrlState<CubeStatusFilter>('status', 'all')
  const [binding] = useUrlState<CubeBindingFilter>('binding', 'all')
  const [domain] = useUrlState<CubeDomainFilter>('domain', 'all')

  const updateListState = useCallback((updates: Record<string, string>) => {
    const defaults: Record<string, string> = {
      kind: 'cube',
      q: '',
      page: '1',
      page_size: '10',
      name: '',
      focus: 'all',
      status: 'all',
      binding: 'all',
      domain: 'all',
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === defaults[key]) {
          next.delete(key)
        } else {
          next.set(key, value)
        }
      })
      return next
    }, { replace: true })
  }, [setSearchParams])

  const pageNumber = parsePositiveInt(page, 1)
  const pageSizeNumber = parsePositiveInt(pageSize, 10)
  const trimmedQuery = query.trim().toLowerCase()

  const {
    data: summaryData,
    isLoading,
  } = useQuery({
    queryKey: ['semantic', 'cube-workbench-summary'],
    queryFn: async () => {
      const [cubesRes, viewsRes, materializeRes] = await Promise.all([
        listCubes(),
        listViews(),
        getBatchMaterializeStatus(),
      ])

      return {
        cubes: cubesRes.data.cubes ?? [],
        views: viewsRes.data.views ?? [],
        materializeStatusMap: materializeRes.data ?? {},
      }
    },
  })

  const summaryCubes = summaryData?.cubes ?? []
  const summaryViews = summaryData?.views ?? []
  const materializeStatusMap = summaryData?.materializeStatusMap

  const focusCounts = useMemo(() => ({
    all: summaryCubes.length,
    attention: summaryCubes.filter((item) => getCubeAttentionReasons(item).length > 0).length,
    unbound: summaryCubes.filter((item) => !isCubeSourceBound(item)).length,
    undomained: summaryCubes.filter((item) => !isCubeInDomain(item)).length,
    recent: summaryCubes.filter((item) => matchesCubeFocus(item, 'recent')).length,
  }), [summaryCubes])

  const filteredCubes = useMemo(() => {
    return [...summaryCubes]
      .filter((item) => matchesCubeQuery(item, trimmedQuery))
      .filter((item) => matchesCubeFocus(item, focus))
      .filter((item) => matchesCubeStatus(item, status))
      .filter((item) => matchesCubeBinding(item, binding))
      .filter((item) => matchesCubeDomain(item, domain))
      .sort((left, right) => {
        const priorityDiff = getCubeRowPriority(left) - getCubeRowPriority(right)
        if (priorityDiff !== 0) return priorityDiff
        const leftTime = left.state_summary?.updated_at ? new Date(left.state_summary.updated_at).getTime() : 0
        const rightTime = right.state_summary?.updated_at ? new Date(right.state_summary.updated_at).getTime() : 0
        return rightTime - leftTime
      })
  }, [summaryCubes, trimmedQuery, focus, status, binding, domain])

  const filteredViews = useMemo(() => {
    return [...summaryViews]
      .filter((item) => matchesViewQuery(item, trimmedQuery))
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'))
  }, [summaryViews, trimmedQuery])

  const total = kind === 'cube' ? filteredCubes.length : filteredViews.length
  const pageCount = Math.max(1, Math.ceil(total / pageSizeNumber))

  useEffect(() => {
    if (pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  const currentCubes = useMemo(() => {
    const start = (pageNumber - 1) * pageSizeNumber
    return filteredCubes.slice(start, start + pageSizeNumber)
  }, [filteredCubes, pageNumber, pageSizeNumber])

  const currentViews = useMemo(() => {
    const start = (pageNumber - 1) * pageSizeNumber
    return filteredViews.slice(start, start + pageSizeNumber)
  }, [filteredViews, pageNumber, pageSizeNumber])

  useEffect(() => {
    const currentItems = kind === 'cube' ? currentCubes : currentViews
    if (!currentItems.length) {
      if (selectedName) setSelectedName('')
      return
    }
    if (!selectedName || !currentItems.some((item) => item.name === selectedName)) {
      setSelectedName(currentItems[0].name)
    }
  }, [currentCubes, currentViews, kind, selectedName, setSelectedName])

  const selectedCube = useMemo(
    () => currentCubes.find((item) => item.name === selectedName) ?? currentCubes[0] ?? null,
    [currentCubes, selectedName],
  )
  const selectedView = useMemo(
    () => currentViews.find((item) => item.name === selectedName) ?? currentViews[0] ?? null,
    [currentViews, selectedName],
  )

  const { data: cubeDetail, isLoading: cubeDetailLoading } = useQuery({
    queryKey: ['semantic', 'cube-detail-pane', selectedCube?.name],
    queryFn: async () => (await describeCube(selectedCube!.name)).data as CubeDetail,
    enabled: kind === 'cube' && !!selectedCube?.name,
  })

  const attentionCount = focusCounts.attention
  const headerSummary = {
    readyCount: summaryCubes.length - attentionCount,
    boundCount: summaryCubes.filter((item) => isCubeSourceBound(item)).length,
    inDomainCount: summaryCubes.filter((item) => isCubeInDomain(item)).length,
  }

  const summaryBanner: SemanticValidationSummary = {
    status: attentionCount > 0 ? 'dirty' : 'ready',
    title: attentionCount > 0 ? '当前有待处理对象' : '当前模型状态稳定',
    description: attentionCount > 0
      ? '优先处理未绑定数据源、未归属领域、同步待检查和草稿待发布对象。'
      : '当前 Cube 工作列表没有明显阻塞项，可以继续做建模维护和定义确认。',
    blockers: [],
    hints: [],
    stats: [
      { label: '待处理', value: `${focusCounts.attention} 个` },
      { label: '已绑定来源', value: `${headerSummary.boundCount} 个` },
      { label: '已归属领域', value: `${headerSummary.inDomainCount} 个` },
      { label: '最近变更', value: `${focusCounts.recent} 个` },
    ],
  }

  if (isLoading) {
    return <CubeManagementSkeleton />
  }

  return (
    <SemanticPageShell>
      <SemanticPageHeader
        title="Cube 管理"
        description="按待处理优先查看 Cube 与 View。主表格用于筛查对象，右侧摘要用于判断当前状态和下一步动作。"
        status={attentionCount > 0 ? 'dirty' : 'ready'}
        eyebrow="Semantic Center"
        meta={(
          <>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
              待处理 {focusCounts.attention} 个
            </Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
              已绑定 {headerSummary.boundCount} 个
            </Badge>
            <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]">
              已归域 {headerSummary.inDomainCount} 个
            </Badge>
          </>
        )}
        actions={(
          <Button asChild variant="outline" className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white/86 px-4">
            <Link to="/semantic/modeling">
              <GitBranch className="mr-1.5 h-4 w-4" />
              打开领域建模
            </Link>
          </Button>
        )}
      />

      <SemanticStatusBanner summary={summaryBanner} />

      <SemanticSurface bodyClassName="p-0">
        <CubeToolbar
          kind={kind}
          query={query}
          total={total}
          focus={focus}
          status={status}
          binding={binding}
          domain={domain}
          focusCounts={focusCounts}
          onKindChange={(value) => {
            updateListState({
              kind: value,
              page: '1',
              name: '',
            })
          }}
          onQueryChange={(value) => {
            updateListState({
              q: value,
              page: '1',
              name: '',
            })
          }}
          onFocusChange={(value) => {
            updateListState({
              focus: value,
              page: '1',
              name: '',
            })
          }}
          onStatusChange={(value) => {
            updateListState({
              status: value,
              page: '1',
              name: '',
            })
          }}
          onBindingChange={(value) => {
            updateListState({
              binding: value,
              page: '1',
              name: '',
            })
          }}
          onDomainChange={(value) => {
            updateListState({
              domain: value,
              page: '1',
              name: '',
            })
          }}
        />

        <div className="grid min-h-[44rem] xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="flex min-w-0 flex-col bg-[rgba(255,255,255,0.9)]">
            {!total ? (
              <div className="px-5 py-6">
                <SemanticEmptyState
                  icon={<Blocks className="h-6 w-6" />}
                  title={kind === 'cube' ? '没有命中当前条件的 Cube' : '没有命中当前条件的 View'}
                  description={
                    trimmedQuery
                      ? '可以尝试缩短关键词，或切换快筛后重新查看。'
                      : '当前筛选条件下没有可展示的对象。'
                  }
                />
              </div>
            ) : (
              <>
                <CubeTable
                  kind={kind}
                  cubes={currentCubes}
                  views={currentViews}
                  selectedName={selectedName}
                  materializeStatusMap={materializeStatusMap}
                  onSelect={setSelectedName}
                />
                <PaginationBar
                  page={pageNumber}
                  pageCount={pageCount}
                  total={total}
                  pageSize={pageSizeNumber}
                  onPageChange={(nextPage) => setPage(String(nextPage))}
                  onPageSizeChange={(nextPageSize) => {
                    updateListState({
                      page: '1',
                      page_size: String(nextPageSize),
                    })
                  }}
                />
              </>
            )}
          </section>

          <CubePreviewPanel
            kind={kind}
            selectedCube={selectedCube}
            selectedView={selectedView}
            cubeDetail={cubeDetail}
            cubeDetailLoading={cubeDetailLoading}
            materializeStatusMap={materializeStatusMap}
          />
        </div>
      </SemanticSurface>
    </SemanticPageShell>
  )
}
