import { Filter, Search } from 'lucide-react'
import type { CubeSummary } from '@/api/semantic'
import { SemanticFilterChips } from '@/components/Semantic/SemanticToolbar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

export type DomainLibraryFilter = 'all' | 'attention' | 'recent'

export function DomainCubeLibrary({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  cubes,
  onDragStart,
}: {
  search: string
  onSearchChange: (value: string) => void
  filter: DomainLibraryFilter
  onFilterChange: (value: DomainLibraryFilter) => void
  counts: Record<DomainLibraryFilter, number>
  cubes: CubeSummary[]
  onDragStart: (cubeName: string) => (event: React.DragEvent<HTMLButtonElement>) => void
}) {
  return (
    <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.84)] p-4">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]" style={{ fontFamily: 'var(--font-workbench-display)' }}>
            Cube 资源库
          </div>
          <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
            只显示当前可加入领域的 Cube。拖入画布后，在右侧继续完成 Join 配置。
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            name="cube_library_search"
            autoComplete="off"
            placeholder="搜索 Cube…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="搜索可加入领域的 Cube"
            className="border-[hsl(var(--workbench-outline))] bg-white pl-9"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
            <Filter className="h-3.5 w-3.5" />
            资源过滤
          </div>
          <SemanticFilterChips
            value={filter}
            onChange={onFilterChange}
            items={[
              { value: 'all', label: '全部', count: counts.all },
              { value: 'attention', label: '待检查', count: counts.attention },
              { value: 'recent', label: '最近变更', count: counts.recent },
            ]}
          />
        </div>

        <div className="max-h-[calc(100vh-23rem)] space-y-2 overflow-auto pr-1">
          {cubes.map((cube) => (
            <button
              key={cube.name}
              type="button"
              draggable
              data-testid={`domain-library-cube-${cube.name}`}
              onDragStart={onDragStart(cube.name)}
              className="w-full rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/92 p-3 text-left transition-colors hover:border-[hsl(var(--workbench-accent))]/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{cube.title}</div>
                  <div className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{cube.name}</div>
                </div>
                <Badge variant="outline">{getSemanticStatusLabel(cube.status || 'draft')}</Badge>
              </div>
              <div className="mt-3 flex gap-3 text-[11px] text-[hsl(var(--workbench-muted-foreground))]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span>{cube.dimension_count} 维度</span>
                <span>{cube.measure_count} 指标</span>
              </div>
            </button>
          ))}
          {cubes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[hsl(var(--workbench-outline))] bg-white/92 p-4 text-xs text-[hsl(var(--workbench-muted-foreground))]">
              当前没有可加入的 Cube，可能都已在本领域中或检索条件过窄。
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
