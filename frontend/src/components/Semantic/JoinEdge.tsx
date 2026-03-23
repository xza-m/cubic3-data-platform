import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'

export function JoinEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  ...rest
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const label = (data as any)?.relationship || ''

  return (
    <>
      <BaseEdge path={edgePath} {...rest} className="!stroke-border" />
      <EdgeLabelRenderer>
        <div
          className="absolute pointer-events-auto rounded-md bg-card border px-1.5 py-0.5
                     text-[10px] text-muted-foreground shadow-sm
                     hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
          style={{
            fontFamily: 'var(--font-mono)',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          role="button"
          tabIndex={0}
          aria-label={`关联: ${label}`}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
