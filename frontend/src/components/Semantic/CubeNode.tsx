import { Handle, Position, type NodeProps } from '@xyflow/react'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { cn } from '@/lib/utils'

interface CubeNodeData {
  name: string
  title: string
  type: 'fact' | 'dimension'
  dimensions: number
  measures: number
  status?: string
  sourceBindingSummary?: {
    source_name?: string
    database?: string
  }
  stateSummary?: {
    sync_status?: 'ok' | 'warn' | 'error' | string
  }
  [key: string]: unknown
}

export function CubeNode({ data, selected }: NodeProps) {
  const d = data as CubeNodeData
  const isFact = d.type === 'fact'

  return (
    <div
      className={cn(
        'rounded-xl border-2 bg-card px-4 py-3 shadow-sm transition-all w-48',
        selected && 'ring-2 ring-ring',
        isFact
          ? 'border-[hsl(var(--semantic-fact))]'
          : 'border-[hsl(var(--semantic-dim))]',
      )}
      role="button"
      tabIndex={0}
      aria-label={`Cube: ${d.title} (${d.name}), ${d.dimensions} 维度, ${d.measures} 指标`}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold',
            isFact
              ? 'bg-[hsl(var(--semantic-fact-bg))] text-[hsl(var(--semantic-fact))]'
              : 'bg-[hsl(var(--semantic-dim-bg))] text-[hsl(var(--semantic-dim))]',
          )}
          aria-hidden="true"
        >
          {isFact ? '■' : '●'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{d.title}</p>
          <p
            className="text-[10px] text-muted-foreground truncate"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {d.name}
          </p>
        </div>
      </div>
      <div
        className="flex gap-3 text-[10px] text-muted-foreground"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span>{d.dimensions}D</span>
        <span>{d.measures}M</span>
        {d.status && <span>{getSemanticStatusLabel(d.status)}</span>}
      </div>
      {(d.sourceBindingSummary?.source_name || d.sourceBindingSummary?.database) && (
        <div className="mt-2 text-[10px] text-muted-foreground truncate">
          {d.sourceBindingSummary?.source_name || '未命名数据源'}
          {d.sourceBindingSummary?.database ? ` · ${d.sourceBindingSummary.database}` : ''}
        </div>
      )}
    </div>
  )
}
