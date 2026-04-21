// frontend/src/v2/components/ui/Tooltip.tsx
import { useState, type ReactNode } from 'react'
import { cn } from '@v2/lib/cn'

interface TooltipProps {
  label: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  children: ReactNode
}

export function Tooltip({ label, side = 'right', className, children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const positions: Record<string, string> = {
    top: 'bottom-full mb-1 left-1/2 -translate-x-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    bottom: 'top-full mt-1 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  }
  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && label ? (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-[200] whitespace-nowrap rounded-md border px-2 py-1 text-[11px] shadow surface text-1',
            positions[side],
          )}
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-1)',
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}
