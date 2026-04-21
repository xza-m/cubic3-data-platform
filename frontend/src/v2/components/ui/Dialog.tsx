// frontend/src/v2/components/ui/Dialog.tsx
import { useEffect, type ReactNode } from 'react'
import { cn } from '@v2/lib/cn'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  children?: ReactNode
}

export function Dialog({ open, onClose, title, footer, width = 480, className, children }: DialogProps) {
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center cmdk-backdrop" onClick={onClose}>
      <div
        className={cn('surface rounded-xl border shadow-lg overflow-hidden', className)}
        style={{ width, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div
            className="flex items-center justify-between px-4 py-3 border-b text-1 font-medium"
            style={{ borderColor: 'var(--border)' }}
          >
            <span>{title}</span>
          </div>
        ) : null}
        <div className="px-4 py-3 text-1">{children}</div>
        {footer ? (
          <div
            className="flex items-center justify-end gap-2 px-4 py-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
