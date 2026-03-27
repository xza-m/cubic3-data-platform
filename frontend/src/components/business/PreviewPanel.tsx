import type { ReactNode } from 'react'
import { PanelRight } from 'lucide-react'
import { AsyncTaskNotice } from '@/components/business/AsyncTaskNotice'
import { cn } from '@/lib/utils'

export type PreviewPanelState = 'loading' | 'empty' | 'error' | 'ready'

interface PreviewPanelProps {
  title: string
  description?: string
  state: PreviewPanelState
  loadingText?: string
  emptyTitle?: string
  emptyDescription?: ReactNode
  errorTitle?: string
  errorDescription?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
}

export function PreviewPanel({
  title,
  description,
  state,
  loadingText = '加载中',
  emptyTitle = '暂无内容',
  emptyDescription = '当前没有可展示的内容。',
  errorTitle = '加载失败',
  errorDescription = '预览内容暂时不可用。',
  children,
  actions,
  className,
  bodyClassName,
  testId = 'preview-panel',
}: PreviewPanelProps) {
  const content = (() => {
    switch (state) {
      case 'loading':
        return (
          <AsyncTaskNotice
            tone="loading"
            title={loadingText}
            description="请稍候，正在获取预览数据。"
          />
        )
      case 'empty':
        return (
          <AsyncTaskNotice
            tone="empty"
            title={emptyTitle}
            description={emptyDescription}
          />
        )
      case 'error':
        return (
          <AsyncTaskNotice
            tone="error"
            title={errorTitle}
            description={errorDescription}
          />
        )
      case 'ready':
        return children
      default:
        return null
    }
  })()

  return (
    <aside
      className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}
      data-testid={testId}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold leading-6 text-slate-950">
            <PanelRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {title}
          </div>
          {description ? <p className="text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cn('space-y-4 px-5 py-5', bodyClassName)}>{content}</div>
    </aside>
  )
}
