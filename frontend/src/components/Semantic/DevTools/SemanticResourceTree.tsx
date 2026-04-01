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
      <aside className="flex items-start justify-center border-r border-[hsl(var(--workbench-outline))] bg-white px-2 py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[hsl(var(--workbench-outline))] bg-white text-[hsl(var(--workbench-muted-foreground))] shadow-sm transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
          aria-label="展开 Cube 资源库"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="border-r border-[hsl(var(--workbench-outline))] bg-white">
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex min-w-0 items-center rounded-lg bg-slate-100 p-1">
            <div className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm">
              Cube 库
            </div>
            <div className="px-2 text-[11px] text-[hsl(var(--workbench-muted-foreground))]">
              {visibleGroup?.count ?? 0}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
              aria-label="聚焦 Cube 搜索"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--workbench-muted-foreground))] transition-colors hover:bg-[hsl(var(--workbench-surface-2))]"
              aria-label="折叠 Cube 资源库"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1.5">
          <Search className="h-3 w-3 shrink-0 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索 Cube..."
            className="h-auto border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            data-testid="semantic-resource-search"
          />
        </div>
      </div>

      <div className="flex h-[calc(100%-7.5rem)] flex-col overflow-hidden px-2 pb-4">
        {visibleGroup ? (
          <section className="flex min-h-0 flex-1 flex-col" data-testid={`semantic-resource-group-${visibleGroup.kind}`}>
            {visibleGroup.items.length > 0 ? (
              <div className="flex-1 space-y-1 overflow-y-auto">
                {pagedItems.map((item) => {
                  const isActive = selectedCode === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect('cube', item.key)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-blue-50'
                          : 'hover:bg-muted',
                      )}
                      data-testid={`semantic-resource-item-${visibleGroup.kind}-${item.key}`}
                    >
                      <Blocks className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'text-blue-500' : 'text-muted-foreground',
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">{item.label}</div>
                        <div className="text-[11px] text-muted-foreground">{item.meta}</div>
                      </div>
                      <MoreVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-[hsl(var(--workbench-muted-foreground))]">
                当前筛选下没有匹配资源。
              </div>
            )}
          </section>
        ) : null}

        <div className="px-1 pt-2">
          <ResourcePagination page={page} pageCount={pageCount} onChange={setPage} />
        </div>

        {!hasItems ? (
          <div className="px-3 py-6 text-center text-xs text-[hsl(var(--workbench-muted-foreground))]">
            没有匹配的语义对象。
          </div>
        ) : null}
      </div>
    </aside>
  )
}
