// frontend/src/v2/components/ui/Sheet.tsx
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@v2/lib/cn'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  width?: number
  side?: 'right' | 'left'
  children?: ReactNode
}

export function Sheet({ open, onClose, title, width = 360, side = 'right', children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[300] flex" onClick={onClose}>
      <div className={cn('flex-1 cmdk-backdrop')} />
      <div
        className={cn(
          'h-full overflow-y-auto scroll-thin border-l shadow-xl',
          side === 'right' ? 'order-last' : 'order-first border-r border-l-0',
        )}
        style={{ width, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-1 font-medium">{title}</span>
          <button
            type="button"
            className="rail-btn"
            onClick={onClose}
            aria-label="关闭面板"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 text-1">{children}</div>
      </div>
    </div>
  )
}
