import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export type DomainCanvasLens = 'all' | 'issues' | 'selection'

export function DomainGraphLegend({
  lens,
  onLensChange,
}: {
  lens: DomainCanvasLens
  onLensChange: (value: DomainCanvasLens) => void
}) {
  return (
    <div className="absolute right-4 top-4 z-10 flex flex-wrap items-center gap-2">
      <div className="rounded-full border border-[hsl(var(--workbench-outline))] bg-white/92 px-3 py-2 text-xs text-[hsl(var(--workbench-muted-foreground))] shadow-sm">
        <span className="mr-2 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[hsl(var(--semantic-error))]" />冲突</span>
        <span className="mr-2 inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[hsl(var(--semantic-warn))]" />待补字段</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[hsl(var(--workbench-accent))]" />当前焦点</span>
      </div>

      <div className="inline-flex items-center rounded-full border border-[hsl(var(--workbench-outline))] bg-white/92 p-1 shadow-sm">
        {([
          { value: 'all', label: '全部' },
          { value: 'issues', label: '仅看异常' },
          { value: 'selection', label: '聚焦当前' },
        ] as const).map((item) => (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onLensChange(item.value)}
            className={lens === item.value ? 'rounded-full bg-[hsl(var(--workbench-accent-soft))] text-[hsl(var(--workbench-accent))]' : 'rounded-full'}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <Badge variant="outline" className="border-transparent bg-white/92 shadow-sm">
        点击连线编辑 Join
      </Badge>
    </div>
  )
}
