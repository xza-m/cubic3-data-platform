import { cn } from '@/lib/utils'

export function SemanticStructureSummary({
  items,
  className,
}: {
  items: Array<{ label: string; value: string | number }>
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-[hsl(var(--workbench-muted-foreground))]', className)}>
      {items.map((item) => (
        <span key={item.label}>
          {item.value} {item.label}
        </span>
      ))}
    </div>
  )
}
