import { Blocks, FolderTree, GitBranch, Layers3, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { SemanticObjectKind } from '@/lib/semantic-workbench'
import { cn } from '@/lib/utils'

export interface SemanticResourceTreeItem {
  key: string
  label: string
  meta: string
}

export interface SemanticResourceTreeGroup {
  kind: SemanticObjectKind
  label: string
  count: number
  items: SemanticResourceTreeItem[]
}

const iconMap = {
  catalog: FolderTree,
  domain: GitBranch,
  cube: Blocks,
  view: Layers3,
} as const

export function SemanticResourceTree({
  search,
  onSearchChange,
  groups,
  selectedKind,
  selectedCode,
  onSelect,
}: {
  search: string
  onSearchChange: (value: string) => void
  groups: SemanticResourceTreeGroup[]
  selectedKind: SemanticObjectKind
  selectedCode: string
  onSelect: (kind: SemanticObjectKind, key: string) => void
}) {
  const hasItems = groups.some((group) => group.items.length > 0)

  return (
    <aside className="border-r border-[hsl(var(--workbench-outline))] bg-[rgba(249,251,254,0.82)]">
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
          Resource Tree
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索 Catalog / Domain / Cube / View"
            className="h-10 rounded-full border-[hsl(var(--workbench-outline))] bg-white pl-10"
            data-testid="semantic-resource-search"
          />
        </div>
      </div>

      <div className="space-y-4 p-4">
        {groups.map((group) => {
          const Icon = iconMap[group.kind]
          return (
            <section key={group.kind} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
                  {group.label}
                </div>
                <div
                  className="rounded-full border border-[hsl(var(--workbench-outline))] bg-white/82 px-2 py-0.5 text-[11px] text-[hsl(var(--workbench-muted-foreground))]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {group.count}
                </div>
              </div>

              {group.items.length > 0 ? (
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = selectedKind === group.kind && selectedCode === item.key
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onSelect(group.kind, item.key)}
                        className={cn(
                          'w-full rounded-[var(--workbench-radius-sm)] border px-3 py-2.5 text-left transition-colors',
                          isActive
                            ? 'border-[hsl(var(--workbench-accent))]/25 bg-[hsl(var(--workbench-accent-soft))]'
                            : 'border-transparent bg-white/68 hover:border-[hsl(var(--workbench-outline))] hover:bg-white',
                        )}
                        data-testid={`semantic-resource-item-${group.kind}-${item.key}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[hsl(var(--workbench-ink))]">{item.label}</div>
                            <div className="mt-1 truncate text-xs text-[hsl(var(--workbench-muted-foreground))]">{item.meta}</div>
                          </div>
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
          )
        })}

        {!hasItems ? (
          <div className="rounded-[var(--workbench-radius)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/62 px-4 py-6 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
            没有匹配的语义对象。请调整搜索词，或切回其它对象类型继续排查。
          </div>
        ) : null}
      </div>
    </aside>
  )
}
