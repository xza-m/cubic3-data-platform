import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type SyncStatus = 'ok' | 'warn' | 'error' | undefined

const config = {
  ok: {
    icon: CheckCircle2,
    label: '同步正常',
    className: 'text-[hsl(var(--semantic-ok))] bg-[hsl(var(--semantic-ok))]/10',
  },
  warn: {
    icon: AlertTriangle,
    label: '存在漂移',
    className: 'text-[hsl(var(--semantic-warn))] bg-[hsl(var(--semantic-warn))]/10',
  },
  error: {
    icon: XCircle,
    label: '同步异常',
    className: 'text-[hsl(var(--semantic-error))] bg-[hsl(var(--semantic-error))]/10',
  },
} as const

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  if (!status) return null
  const { icon: Icon, label, className } = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label}
    </span>
  )
}
