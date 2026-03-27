import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DataCenterPageShellProps {
  title: string
  description?: string
  actions?: ReactNode
  status?: ReactNode
  children?: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  testId?: string
}

export function DataCenterPageShell({
  title,
  description,
  actions,
  status,
  children,
  className,
  headerClassName,
  bodyClassName,
  testId = 'data-center-page-shell',
}: DataCenterPageShellProps) {
  return (
    <div className={cn('space-y-5', className)} data-testid={testId}>
      <header className={cn('flex flex-wrap items-start justify-between gap-4', headerClassName)}>
        <div className="space-y-2">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-slate-950">
            {title}
          </h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('space-y-4', bodyClassName)}>
        {status ? <section>{status}</section> : null}
        {children ? <section>{children}</section> : null}
      </div>
    </div>
  )
}
