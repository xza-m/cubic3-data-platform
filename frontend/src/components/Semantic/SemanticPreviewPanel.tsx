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
      <div className="border-b border-[hsl(var(--workbench-outline))] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
              <PanelRight className="h-4 w-4 text-[hsl(var(--workbench-muted-foreground))]" />
              {title}
            </div>
            {description ? (
              <p className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                {description}
              </p>
            ) : null}
          </div>
          {actions}
        </div>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
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
    <section className="space-y-2.5">
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
          className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-white/86 px-3.5 py-3"
        >
          <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
            {item.label}
          </div>
          <div className="mt-1.5 text-sm font-semibold text-[hsl(var(--workbench-ink))]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
