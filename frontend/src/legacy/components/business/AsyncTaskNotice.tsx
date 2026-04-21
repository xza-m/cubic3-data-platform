import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { PageCard } from '@/components/business/PageCard'
import { cn } from '@/lib/utils'

export type AsyncTaskNoticeTone = 'loading' | 'empty' | 'error' | 'ready'

interface AsyncTaskNoticeProps {
  tone: AsyncTaskNoticeTone
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  testId?: string
}

const toneMeta: Record<AsyncTaskNoticeTone, { icon: ReactNode; wrapperClassName: string }> = {
  loading: {
    icon: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
    wrapperClassName: 'border-slate-200 bg-slate-50',
  },
  empty: {
    icon: <Sparkles className="h-4 w-4" aria-hidden="true" />,
    wrapperClassName: 'border-slate-200 bg-slate-50',
  },
  error: {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
    wrapperClassName: 'border-rose-200 bg-rose-50',
  },
  ready: {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    wrapperClassName: 'border-emerald-200 bg-emerald-50',
  },
}

export function AsyncTaskNotice({
  tone,
  title,
  description,
  action,
  className,
  testId,
}: AsyncTaskNoticeProps) {
  const meta = toneMeta[tone]
  const liveProps =
    tone === 'error'
      ? { role: 'alert' as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const }

  return (
    <div data-testid={testId ?? 'async-task-notice'} {...liveProps}>
      <PageCard className={cn('shadow-none', meta.wrapperClassName, className)}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full border border-current/10 p-2 text-current">{meta.icon}</div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold leading-6 text-slate-950">{title}</h4>
              {description ? <div className="text-sm leading-6 text-slate-600">{description}</div> : null}
            </div>
            {action ? <div className="pt-1">{action}</div> : null}
          </div>
        </div>
      </PageCard>
    </div>
  )
}
