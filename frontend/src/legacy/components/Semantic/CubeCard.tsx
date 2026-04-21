import { Link } from 'react-router-dom'
import { BarChart3, Box } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { SyncStatusBadge } from './SyncStatusBadge'
import type { CubeSummary } from '@/api/semantic'
import { Badge } from '@/components/ui/badge'

interface CubeCardProps {
  cube: CubeSummary
  style?: React.CSSProperties
}

function inferCubeType(cube: CubeSummary): 'fact' | 'dimension' {
  if (cube.type) return cube.type
  return cube.measure_count > 2 ? 'fact' : 'dimension'
}

export function CubeCard({ cube, style }: CubeCardProps) {
  const isFact = inferCubeType(cube) === 'fact'

  return (
    <Link
      to={`/semantic/cubes/${cube.name}`}
      className={cn(
        'group block rounded-xl border p-5 transition-all',
        'hover:shadow-md hover:border-primary/20',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'animate-fade-in opacity-0 fill-mode-forwards',
      )}
      style={style}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            isFact
              ? 'bg-[hsl(var(--semantic-fact-bg))] text-[hsl(var(--semantic-fact))]'
              : 'bg-[hsl(var(--semantic-dim-bg))] text-[hsl(var(--semantic-dim))]',
          )}
          aria-hidden="true"
        >
          {isFact ? <BarChart3 className="w-4 h-4" /> : <Box className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <h3
            className="font-semibold text-sm truncate"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            {cube.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate" style={{ fontFamily: 'var(--font-mono)' }}>
            {cube.name}
          </p>
        </div>
      </div>

      {cube.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
          {cube.description.split('\n')[0]}
        </p>
      )}

      <div
        className="flex gap-4 text-xs text-muted-foreground mb-3"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <span>{fmtNumber(cube.dimension_count)}&nbsp;维度</span>
        <span>{fmtNumber(cube.measure_count)}&nbsp;指标</span>
        {cube.join_count != null && <span>{fmtNumber(cube.join_count)}&nbsp;关联</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <SyncStatusBadge status={cube.sync_status} />
        {cube.status && <Badge variant="outline">{getSemanticStatusLabel(cube.status)}</Badge>}
        {cube.state_summary?.source_binding_summary?.source_name && (
          <span className="text-xs text-muted-foreground">
            {cube.state_summary.source_binding_summary.source_name}
          </span>
        )}
      </div>
    </Link>
  )
}
