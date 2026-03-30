import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Search } from 'lucide-react'
import type { CubeSummary } from '@/api/semantic'
import { CubePreviewPanel } from '@/components/Semantic/CubeList/CubePreviewPanel'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type {
  CubeDomainFilter,
  CubeFocusFilter,
  CubeSortOption,
  CubeStatusFilter,
  CubeTypeFilter,
} from '@/components/Semantic/CubeList/cubeListUtils'
import { Skeleton } from '@/components/ui/skeleton'
import { useCubeList } from '@/hooks/semantic-ia'
import { useUrlState } from '@/hooks/useUrlState'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

/* ── Status badge ── */

function StatusBadge({ status }: { status?: string }) {
  const label = getSemanticStatusLabel(status)
  const isActive = (status || '').toLowerCase() === 'active'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        isActive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-amber-50 text-amber-700'
      }`}
    >
      {isActive ? (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      ) : null}
      {label}
    </span>
  )
}

/* ── Table row ── */

function CubeRow({
  cube,
  onSelect,
}: {
  cube: CubeSummary & { view_count?: number }
  onSelect: (name: string) => void
}) {
  const totalFields = cube.dimension_count + cube.measure_count
  return (
    <div
      className="flex items-center gap-4 border-b border-slate-100 px-5 py-3.5 transition-colors hover:bg-slate-50/60"
    >
      {/* Cube 名称 */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onSelect(cube.name)}
          className="truncate text-[13px] font-medium text-blue-600 hover:underline"
        >
          {cube.title || cube.name}
        </button>
      </div>
      {/* SQL 表 */}
      <div className="w-[260px] shrink-0">
        <span className="block truncate font-mono text-[13px] text-foreground" title={cube.table || '—'}>
          {cube.table || '—'}
        </span>
      </div>
      {/* 维度 */}
      <div className="w-[72px] shrink-0 text-center text-[13px] font-medium tabular-nums text-foreground">
        {cube.dimension_count}
      </div>
      {/* 指标 */}
      <div className="w-[72px] shrink-0 text-center text-[13px] font-medium tabular-nums text-foreground">
        {cube.measure_count}
      </div>
      {/* 字段 */}
      <div className="w-[72px] shrink-0 text-center text-[13px] tabular-nums text-muted-foreground">
        {totalFields}
      </div>
      {/* 状态 */}
      <div className="flex w-[100px] shrink-0 items-center justify-center">
        <StatusBadge status={cube.status} />
      </div>
      {/* 操作 */}
      <div className="flex w-[112px] shrink-0 items-center justify-center gap-3 text-xs text-muted-foreground">
        <Link to={`/semantic/cubes/${cube.name}/edit`} className="hover:text-foreground">编辑</Link>
        <button type="button" onClick={() => onSelect(cube.name)} className="hover:text-foreground">预览</button>
      </div>
    </div>
  )
}

/* ── Loading skeleton ── */

function CubeManagementSkeleton() {
  return (
    <div className="space-y-6 px-10 py-8">
      <Skeleton className="h-14 w-[400px] rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-[32rem] rounded-xl" />
    </div>
  )
}

/* ── Main page ── */

export default function CubeList() {
  const [, setSearchParams] = useSearchParams()
  const [query] = useUrlState<string>('q', '')
  const [page, setPage] = useUrlState<string>('page', '1')
  const [pageSize] = useUrlState<string>('page_size', '10')
  const [selectedName, setSelectedName] = useUrlState<string>('name', '')
  const [focus] = useUrlState<CubeFocusFilter>('focus', 'all')
  const [status] = useUrlState<CubeStatusFilter>('status', 'all')
  const [cubeType] = useUrlState<CubeTypeFilter>('cube_type', 'all')
  const [domain] = useUrlState<CubeDomainFilter>('domain', 'all')
  const [sort] = useUrlState<CubeSortOption>('sort', 'priority')

  const updateListState = useCallback((updates: Record<string, string>) => {
    const defaults: Record<string, string> = {
      q: '', page: '1', page_size: '10', name: '', focus: 'all',
      status: 'all', cube_type: 'all', domain: 'all', sort: 'priority',
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === defaults[key]) next.delete(key)
        else next.set(key, value)
      })
      return next
    }, { replace: true })
  }, [setSearchParams])

  const {
    isLoading,
    currentCubes,
    selectedCube,
    cubeDetail,
    cubeDetailLoading,
  } = useCubeList({
    query, page, pageSize, focus, status, cubeType, domain, sort,
    selectedName, setPage, setSelectedName,
  })

  if (isLoading) {
    return <CubeManagementSkeleton />
  }

  return (
    <div className="flex h-full flex-col gap-6 px-10 py-8" data-testid="cube-management-page">
      {/* ── Header row ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground">Cube 管理</h1>
          <p className="text-sm text-muted-foreground">管理语义模型 Cube 的定义、维度与指标</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
          <Link
            to="/semantic/cubes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white shadow-[0_2px_8px_#2563EB30] transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            新建 Cube
          </Link>
        </div>
      </div>

      {/* ── Filter row ── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex w-[280px] items-center gap-2 rounded-lg bg-muted px-3.5 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索 Cube 名称..."
            defaultValue={query}
            onChange={(e) => updateListState({ q: e.target.value, page: '1', name: '' })}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => updateListState({ status: e.target.value, page: '1', name: '' })}
          className="rounded-lg bg-muted px-3.5 py-2 text-[13px] text-muted-foreground outline-none"
        >
          <option value="all">全部状态</option>
          <option value="active">已发布</option>
          <option value="draft">草稿</option>
          <option value="deprecated">已废弃</option>
        </select>

        {/* Domain filter */}
        <select
          value={domain}
          onChange={(e) => updateListState({ domain: e.target.value, page: '1', name: '' })}
          className="rounded-lg bg-muted px-3.5 py-2 text-[13px] text-muted-foreground outline-none"
        >
          <option value="all">所属领域</option>
          <option value="assigned">已分配</option>
          <option value="unassigned">未分配</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-hidden rounded-xl bg-white shadow-[0_2px_24px_#0F172A08]">
        {/* Table header */}
        <div className="flex items-center gap-4 border-b border-border bg-slate-50/80 px-5 py-3.5">
          <div className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">Cube 名称</div>
          <div className="w-[260px] shrink-0 text-xs font-semibold text-muted-foreground">SQL 表</div>
          <div className="w-[72px] shrink-0 text-center text-xs font-semibold text-muted-foreground">维度</div>
          <div className="w-[72px] shrink-0 text-center text-xs font-semibold text-muted-foreground">指标</div>
          <div className="w-[72px] shrink-0 text-center text-xs font-semibold text-muted-foreground">字段</div>
          <div className="w-[100px] shrink-0 text-center text-xs font-semibold text-muted-foreground">状态</div>
          <div className="w-[112px] shrink-0 text-center text-xs font-semibold text-muted-foreground">操作</div>
        </div>

        {/* Table body */}
        <div className="overflow-y-auto">
          {currentCubes.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              没有命中当前条件的 Cube
            </div>
          ) : (
            currentCubes.map((cube) => (
              <CubeRow
                key={cube.name}
                cube={cube}
                onSelect={setSelectedName}
              />
            ))
          )}
        </div>
      </div>

      <Sheet open={Boolean(selectedCube)} onOpenChange={(open) => {
        if (!open) setSelectedName('')
      }}>
        <SheetContent side="right" className="w-[min(92vw,28rem)] overflow-y-auto sm:max-w-[28rem]">
          <SheetHeader className="mb-4">
            <SheetTitle>{selectedCube?.title || selectedCube?.name || 'Cube 详情'}</SheetTitle>
            <SheetDescription>查看当前 Cube 的字段摘要、状态、所属领域与最近变更。</SheetDescription>
          </SheetHeader>
          {selectedCube ? (
            <CubePreviewPanel
              selectedCube={selectedCube}
              cubeDetail={cubeDetail}
              cubeDetailLoading={cubeDetailLoading}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
