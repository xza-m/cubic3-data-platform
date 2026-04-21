import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { JoinEdgeData } from '@/components/Semantic/joinEdgeTypes'

export function JoinEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  ...rest
}: EdgeProps<Edge<JoinEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const label = data?.relationship || ''
  const status = String(data?.status || 'normal')
  const statusLabel = status === 'missing' ? '缺失' : status === 'conflict' ? '冲突' : '正常'
  const stroke = status === 'missing'
    ? 'hsl(var(--semantic-warn))'
    : status === 'conflict'
      ? 'hsl(var(--semantic-error))'
      : 'hsl(var(--semantic-ok))'

  return (
    <>
      <BaseEdge
        path={edgePath}
        {...rest}
        style={{
          stroke,
          strokeWidth: selected ? 2.6 : 2,
          strokeDasharray: status === 'missing' ? '7 4' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className={cn(
            'absolute pointer-events-auto rounded-md border px-2 py-0.5 text-[10px] shadow-sm cursor-pointer transition-colors',
            status === 'missing'
              ? 'bg-[hsl(var(--semantic-warn))]/10 text-[hsl(var(--semantic-warn))] border-[hsl(var(--semantic-warn))]/20'
              : status === 'conflict'
                ? 'bg-[hsl(var(--semantic-error))]/10 text-[hsl(var(--semantic-error))] border-[hsl(var(--semantic-error))]/20'
                : 'bg-[hsl(var(--semantic-ok))]/10 text-[hsl(var(--semantic-ok))] border-[hsl(var(--semantic-ok))]/20',
          )}
          style={{
            fontFamily: 'var(--font-mono)',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          role="button"
          tabIndex={0}
          aria-label={`关联: ${label}，状态: ${statusLabel}`}
        >
          {label} · {statusLabel}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
