import type { ReactNode } from 'react'
import { PanelRight } from 'lucide-react'
import { AsyncTaskNotice } from '@/components/business/AsyncTaskNotice'
import { cn } from '@/lib/utils'

export type PreviewPanelState = 'loading' | 'empty' | 'error' | 'ready'

interface PreviewPanelBaseProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
}

interface PreviewPanelLoadingProps extends PreviewPanelBaseProps {
  state: 'loading'
  loadingText?: string
  emptyTitle?: never
  emptyDescription?: never
  errorTitle?: never
  errorDescription?: never
  children?: never
}

interface PreviewPanelEmptyProps extends PreviewPanelBaseProps {
  state: 'empty'
  emptyTitle?: string
  emptyDescription?: ReactNode
  loadingText?: never
  errorTitle?: never
  errorDescription?: never
  children?: never
}

interface PreviewPanelErrorProps extends PreviewPanelBaseProps {
  state: 'error'
  errorTitle?: string
  errorDescription?: ReactNode
  loadingText?: never
  emptyTitle?: never
  emptyDescription?: never
  children?: never
}

interface PreviewPanelReadyProps extends PreviewPanelBaseProps {
  state: 'ready'
  children: ReactNode
  loadingText?: never
  emptyTitle?: never
  emptyDescription?: never
  errorTitle?: never
  errorDescription?: never
}

export type PreviewPanelProps =
  | PreviewPanelLoadingProps
  | PreviewPanelEmptyProps
  | PreviewPanelErrorProps
  | PreviewPanelReadyProps

export function PreviewPanel(props: PreviewPanelProps) {
  const {
    title,
    description,
    state,
    actions,
    className,
    bodyClassName,
    testId = 'preview-panel',
  } = props
  const loadingText = 'loadingText' in props && props.loadingText ? props.loadingText : '加载中'
  const emptyTitle = 'emptyTitle' in props && props.emptyTitle ? props.emptyTitle : '暂无内容'
  const emptyDescription =
    'emptyDescription' in props && props.emptyDescription !== undefined
      ? props.emptyDescription
      : '当前没有可展示的内容。'
  const errorTitle = 'errorTitle' in props && props.errorTitle ? props.errorTitle : '加载失败'
  const errorDescription =
    'errorDescription' in props && props.errorDescription !== undefined
      ? props.errorDescription
      : '预览内容暂时不可用。'

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
        return props.children
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
