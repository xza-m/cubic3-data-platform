// frontend/src/v2/components/ui/Toast.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@v2/lib/cn'

type ToastTone = 'info' | 'success' | 'warning' | 'danger'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

interface ToastInput {
  tone?: ToastTone
  title: string
  description?: string
}

interface ToastContextValue {
  show: (input: ToastInput | string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((it) => it.id !== id))
  }, [])

  const show = useCallback<ToastContextValue['show']>((input, fallbackTone = 'info') => {
    const id = Date.now() + Math.random()
    const payload: ToastItem =
      typeof input === 'string'
        ? { id, tone: fallbackTone, title: input }
        : { id, tone: input.tone ?? fallbackTone, title: input.title, description: input.description }
    setItems((current) => [...current, payload])
    setTimeout(() => remove(id), 4500)
  }, [remove])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-8 right-6 z-[400] flex flex-col gap-2">
        {items.map((it) => {
          const Icon =
            it.tone === 'success'
              ? CheckCircle2
              : it.tone === 'warning' || it.tone === 'danger'
                ? AlertTriangle
                : Info
          return (
            <div
              key={it.id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] shadow',
                'min-w-[240px] max-w-[360px]',
              )}
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-1)',
              }}
            >
              <Icon
                size={14}
                className={cn(
                  'mt-0.5',
                  it.tone === 'success' && 'text-[color:var(--success)]',
                  it.tone === 'warning' && 'text-[color:var(--warning)]',
                  it.tone === 'danger' && 'text-[color:var(--danger)]',
                  it.tone === 'info' && 'text-[color:var(--accent)]',
                )}
              />
              <div className="flex-1 leading-4">
                <div className="text-1">{it.title}</div>
                {it.description ? (
                  <div className="mt-0.5 text-[11px] text-3">{it.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="rail-btn !w-5 !h-5"
                onClick={() => remove(it.id)}
                aria-label="关闭通知"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    return {
      show: (input) => {
        if (typeof window !== 'undefined') {
          const text = typeof input === 'string' ? input : input.title
          window.console.warn('[toast]', text)
        }
      },
    }
  }
  return ctx
}
