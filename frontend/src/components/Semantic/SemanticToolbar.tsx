import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SemanticToolbar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-b border-[hsl(var(--workbench-outline))] bg-[rgba(248,250,252,0.9)] px-5 py-4',
        className,
      )}
      data-testid="semantic-toolbar"
    >
      {children}
    </div>
  )
}

export function SemanticToolbarGroup({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
}

export function SemanticFilterChips<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{
    value: T
    label: string
    count?: number
  }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="semantic-filter-chips">
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'border-[hsl(var(--workbench-accent))]/18 bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]'
                : 'border-[hsl(var(--workbench-outline))] bg-white/88 text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))]',
            )}
            data-testid={`semantic-filter-chip-${item.value}`}
            aria-pressed={active}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span className="rounded-full bg-[hsl(var(--workbench-panel))] px-1.5 py-0.5 text-[10px] leading-none text-[hsl(var(--workbench-muted-foreground))]">
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
