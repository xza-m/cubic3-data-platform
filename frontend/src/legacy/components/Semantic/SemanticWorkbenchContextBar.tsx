import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SemanticWorkbenchContextBar({
  items,
  actions,
  className,
  testId,
}: {
  items: Array<{
    label: string
    value: ReactNode
    tone?: 'default' | 'accent' | 'warning'
  }>
  actions?: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[var(--workbench-radius)] border border-[hsl(var(--workbench-outline))] bg-[rgba(248,250,252,0.92)] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]',
        className,
      )}
      data-testid={testId ?? 'semantic-workbench-context-bar'}
    >
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {items.map((item) => {
          const toneClassName = {
            default: 'bg-white/88 text-[hsl(var(--workbench-ink))]',
            accent: 'bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]',
            warning: 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))]',
          }[item.tone || 'default']

          return (
            <div
              key={item.label}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-[hsl(var(--workbench-outline))] px-3 py-2 text-xs',
                toneClassName,
              )}
            >
              <span className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]">
                {item.label}
              </span>
              <span className="text-sm font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.value}
              </span>
            </div>
          )
        })}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
