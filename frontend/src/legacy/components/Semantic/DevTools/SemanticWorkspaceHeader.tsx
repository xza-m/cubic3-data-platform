import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SemanticWorkspaceHeader({
  title,
  description,
  items,
  actions,
  testId,
}: {
  title: string
  description: string
  items: Array<{
    label: string
    value: ReactNode
    tone?: 'default' | 'accent' | 'warning'
  }>
  actions?: ReactNode
  testId?: string
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-4 border-b border-[hsl(var(--workbench-outline))] px-6 py-4"
      data-testid={testId ?? 'semantic-workspace-header'}
    >
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--workbench-muted-foreground))]">
          工作区
        </div>
        <div className="text-lg font-semibold text-[hsl(var(--workbench-ink))]">{title}</div>
        <p className="max-w-2xl text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">{description}</p>
      </div>

      <div className="flex flex-wrap items-start justify-end gap-2">
        {items.map((item) => {
          const toneClassName = {
            default: 'bg-[hsl(var(--workbench-surface-2))] text-[hsl(var(--workbench-ink))]',
            accent: 'bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]',
            warning: 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]',
          }[item.tone || 'default']

          return (
            <div
              key={item.label}
              className={cn(
                'min-w-[8.5rem] rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] px-3 py-2',
                toneClassName,
              )}
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
                {item.label}
              </div>
              <div className="mt-1 text-sm font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.value}
              </div>
            </div>
          )
        })}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
