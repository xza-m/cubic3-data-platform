import { Blocks, MoreVertical, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ResourcePagination } from '@/components/Semantic/ResourcePagination'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface SemanticResourceTreeItem {
  key: string
  label: string
  meta: string
}

export interface SemanticResourceTreeGroup {
  kind: string
  label: string
  count: number
  items: SemanticResourceTreeItem[]
}

export function SemanticResourceTree({
  search,
  onSearchChange,
  groups,
  collapsed,
  onToggleCollapsed,
  selectedCode,
  onSelect,
}: {
  search: string
  onSearchChange: (value: string) => void
  groups: SemanticResourceTreeGroup[]
  collapsed?: boolean
  onToggleCollapsed?: () => void
  selectedCode: string
  onSelect: (kind: 'cube', key: string) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(1)
  const hasItems = groups.some((group) => group.items.length > 0)
  const visibleGroup = groups[0] ?? null
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil((visibleGroup?.items.length ?? 0) / pageSize))
  const pagedItems = useMemo(
    () => visibleGroup?.items.slice((page - 1) * pageSize, page * pageSize) ?? [],
    [page, pageSize, visibleGroup],
  )

  useEffect(() => {
    setPage(1)
  }, [search, visibleGroup?.kind])

  if (collapsed) {
    return (
      <aside className="flex items-start justify-center border-r border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface))] px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--workbench-outline))] bg-white text-[hsl(var(--workbench-muted-foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
          aria-label="展开 Cube 资源库"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.84)]">
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate whitespace-nowrap text-[18px] font-semibold leading-none text-[hsl(var(--workbench-ink))]">
              Cube 资源库
            </div>
            <div className="rounded-full bg-[hsl(var(--workbench-surface-2))] px-2 py-0.5 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
              {visibleGroup?.count ?? 0}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
              aria-label="聚焦 Cube 搜索"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
              aria-label="折叠 Cube 资源库"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索 Cube..."
            className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white pl-10"
            data-testid="semantic-resource-search"
          />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {visibleGroup ? (
          <section className="space-y-2" data-testid={`semantic-resource-group-${visibleGroup.kind}`}>
            {visibleGroup.items.length > 0 ? (
              <div className="space-y-2">
                {pagedItems.map((item) => {
                  const isActive = selectedCode === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect('cube', item.key)}
                      className={cn(
                        'w-full rounded-[var(--workbench-radius-sm)] border p-3 text-left transition-colors',
                        isActive
                          ? 'border-[hsl(var(--workbench-accent))]/30 bg-[hsl(var(--workbench-accent-soft))] shadow-[0_6px_18px_rgba(37,99,235,0.08)]'
                          : 'border-[hsl(var(--workbench-outline))] bg-white/92 hover:border-[hsl(var(--workbench-outline-strong))] hover:bg-white',
                      )}
                      data-testid={`semantic-resource-item-${visibleGroup.kind}-${item.key}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          isActive ? 'bg-white text-[hsl(var(--workbench-accent))]' : 'bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-muted-foreground))]',
                        )}>
                          <Blocks className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.label}</div>
                          <div className="mt-1 truncate text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.meta}</div>
                        </div>
                        <MoreVertical className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--workbench-muted-foreground))]" />
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/56 px-3 py-3 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                当前筛选下没有匹配资源。
              </div>
            )}
          </section>
        ) : null}

        <ResourcePagination page={page} pageCount={pageCount} onChange={setPage} />

        {!hasItems ? (
          <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/62 px-4 py-6 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
            没有匹配的语义对象。请调整搜索词，或切回其它对象类型继续排查。
          </div>
        ) : null}
      </div>
    </aside>
  )
}
