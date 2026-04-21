import type { ReactNode } from 'react'
import { PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SemanticPreviewPanel({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <aside
      className={cn(
        'h-full border-l border-[hsl(var(--workbench-outline))] bg-[rgba(246,249,252,0.88)]',
        className,
      )}
      data-testid={testId ?? 'semantic-preview-panel'}
    >
      <div className="border-b border-[hsl(var(--workbench-outline))] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[hsl(var(--workbench-ink))]">
              <PanelRight className="h-3.5 w-3.5 text-[hsl(var(--workbench-muted-foreground))]" />
              {title}
            </div>
            {description ? (
              <p className="text-[11px] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
                {description}
              </p>
            ) : null}
          </div>
          {actions}
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </aside>
  )
}

export function SemanticPreviewSection({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
        {label}
      </div>
      {children}
    </section>
  )
}

export function SemanticPreviewMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/86 px-3 py-2.5"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
            {item.label}
          </div>
          <div className="mt-1 text-[13px] font-semibold leading-5 text-[hsl(var(--workbench-ink))]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SemanticPreviewFacts({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>
}) {
  return (
    <div className="overflow-hidden rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/84">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            'flex items-start justify-between gap-3 px-3 py-2.5',
            index > 0 && 'border-t border-[hsl(var(--workbench-outline))]',
          )}
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
            {item.label}
          </div>
          <div className="text-right text-[12px] font-medium leading-5 text-[hsl(var(--workbench-ink))]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
