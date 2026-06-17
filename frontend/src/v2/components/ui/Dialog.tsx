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
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 cmdk-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn('surface flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg', className)}
        style={{ width, maxWidth: 'calc(100vw - 2rem)', background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <div
            className="flex shrink-0 items-center justify-between px-4 py-3 border-b text-1 font-medium"
            style={{ borderColor: 'var(--border)' }}
          >
            <span>{title}</span>
          </div>
        ) : null}
        <div className="min-h-0 overflow-y-auto px-4 py-3 text-1">{children}</div>
        {footer ? (
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-4 py-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
