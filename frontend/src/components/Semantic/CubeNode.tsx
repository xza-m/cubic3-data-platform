import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Box } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CubeNodeData {
  name: string
  title: string
  type: 'fact' | 'dimension'
  dimensions: number
  measures: number
  /** Actual field name arrays — optional, shown when available */
  dimensionFields?: string[]
  measureFields?: string[]
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

  const dimFields = d.dimensionFields ?? []
  const msrFields = d.measureFields ?? []
  const hasFields = dimFields.length > 0 || msrFields.length > 0

  return (
    <div
      className={cn(
        'w-[200px] rounded-[10px] bg-white shadow-sm transition-all',
        selected
          ? 'border-2 border-blue-500 shadow-[0_4px_16px_#2563EB18] ring-1 ring-blue-300/30'
          : 'border border-border shadow-[0_2px_12px_#0F172A0A]',
      )}
      role="button"
      tabIndex={0}
      aria-label={`Cube: ${d.title} (${d.name}), ${d.dimensions} 维度, ${d.measures} 指标`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-border" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-border" />

      {/* ── Header ── */}
      <div
        className={cn(
          'flex items-center gap-2 rounded-t-[10px] px-3.5 py-3',
          isFact || selected ? 'bg-blue-50' : 'bg-slate-50',
        )}
      >
        <Box className={cn('h-4 w-4 shrink-0', isFact || selected ? 'text-blue-500' : 'text-muted-foreground')} />
        <span className={cn('truncate text-[13px] font-semibold', isFact || selected ? 'text-blue-600' : 'text-foreground')}>
          {d.title}
        </span>
      </div>

      {/* ── Fields ── */}
      {hasFields ? (
        <div className="flex flex-col gap-[3px] px-3.5 py-2">
          {dimFields.map((f) => (
            <div key={f} className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-blue-500" />
              <span className="truncate text-[11px] text-muted-foreground">{f}</span>
            </div>
          ))}
          {msrFields.map((f) => (
            <div key={f} className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-violet-500" />
              <span className="truncate text-[11px] text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3.5 py-2">
          <div className="flex gap-3 text-[11px] text-muted-foreground" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <span>{d.dimensions} 维度</span>
            <span>{d.measures} 指标</span>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="border-t border-slate-100 px-3.5 py-1.5">
        <span className="text-[9px] text-muted-foreground">
          {d.dimensions} 维度 · {d.measures} 指标
        </span>
      </div>
    </div>
  )
}
