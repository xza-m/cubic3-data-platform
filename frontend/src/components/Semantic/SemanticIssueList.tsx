import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SemanticIssueList({
  blockers = [],
  hints = [],
  emptyText = '当前没有需要额外处理的问题。',
}: {
  blockers?: string[]
  hints?: string[]
  emptyText?: string
}) {
  const hasIssues = blockers.length > 0 || hints.length > 0

  if (!hasIssues) {
    return (
      <div className="rounded-[var(--workbench-radius-sm)] border border-dashed border-[hsl(var(--workbench-outline))] bg-white/72 px-4 py-4 text-sm text-[hsl(var(--workbench-muted-foreground))]">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="space-y-2.5" data-testid="semantic-issue-list">
      {blockers.map((item) => (
        <div
          key={`blocker-${item}`}
          className="flex items-start gap-3 rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-error))]/18 bg-[hsl(var(--semantic-error))]/8 px-4 py-3 text-sm text-[hsl(var(--semantic-error))]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{item}</span>
        </div>
      ))}

      {hints.map((item) => (
        <div
          key={`hint-${item}`}
          className={cn(
            'flex items-start gap-3 rounded-[var(--workbench-radius-sm)] border px-4 py-3 text-sm',
            blockers.length > 0
              ? 'border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-muted-foreground))]'
              : 'border-[hsl(var(--semantic-warn))]/18 bg-[hsl(var(--semantic-warn))]/8 text-[hsl(var(--workbench-ink))]',
          )}
        >
          {blockers.length > 0 ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--semantic-warn))]" />
          )}
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}
