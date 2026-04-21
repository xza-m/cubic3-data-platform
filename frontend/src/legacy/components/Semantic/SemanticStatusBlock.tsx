import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function SemanticStatusBlock({
  status,
  hint,
  warning = false,
}: {
  status: string
  hint?: string | null
  warning?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Badge
        variant="outline"
        className="h-5.5 border-transparent bg-[hsl(var(--workbench-panel))] px-2 text-[10px] text-[hsl(var(--workbench-ink))]"
      >
        {status}
      </Badge>
      {hint ? (
        <div
          className={cn(
            'line-clamp-2 text-[11px] leading-4',
            warning ? 'text-[hsl(var(--semantic-warn))]' : 'text-[hsl(var(--workbench-muted-foreground))]',
          )}
          title={hint}
        >
          {hint}
        </div>
      ) : null}
    </div>
  )
}
