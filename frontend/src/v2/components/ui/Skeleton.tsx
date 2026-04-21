// frontend/src/v2/components/ui/Skeleton.tsx
import { cn } from '@v2/lib/cn'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  rounded?: boolean
}

export function Skeleton({ className, width, height = 12, rounded }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn('inline-block animate-pulse', rounded ? 'rounded-full' : 'rounded', className)}
      style={{
        background: 'var(--bg-hover)',
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}

export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-3">
          {Array.from({ length: columns }).map((__, ci) => (
            <Skeleton key={ci} className="flex-1" height={14} />
          ))}
        </div>
      ))}
    </div>
  )
}
