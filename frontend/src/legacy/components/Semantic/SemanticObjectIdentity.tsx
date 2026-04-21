import { cn } from '@/lib/utils'

export function SemanticObjectIdentity({
  title,
  code,
  description,
  meta = [],
  className,
}: {
  title: string
  code: string
  description?: string | null
  meta?: Array<string | null | undefined>
  className?: string
}) {
  const visibleMeta = meta.filter(Boolean) as string[]

  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="truncate text-[14px] font-semibold leading-5 text-[hsl(var(--workbench-ink))]" title={title}>
        {title}
      </div>
      <div className="truncate font-mono text-[12px] leading-4 text-[hsl(var(--workbench-muted-foreground))]" title={code}>
        {code}
      </div>
      {description ? (
        <div className="truncate text-[12px] leading-5 text-[hsl(var(--workbench-muted-foreground))]" title={description}>
          {description}
        </div>
      ) : null}
      {visibleMeta.length ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
          {visibleMeta.map((item) => (
            <span key={item} className="truncate">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
