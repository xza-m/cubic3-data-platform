import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface RegisterFlowShellProps {
  title: string
  description?: string
  actions?: ReactNode
  sidebar?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  sidebarClassName?: string
  testId?: string
}

export function RegisterFlowShell({
  title,
  description,
  actions,
  sidebar,
  children,
  className,
  bodyClassName,
  sidebarClassName,
  testId = 'register-flow-shell',
}: RegisterFlowShellProps) {
  const hasSidebar = Boolean(sidebar)

  return (
    <div className={cn('space-y-5', className)} data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-slate-950">
            {title}
          </h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('grid gap-5', hasSidebar && 'lg:grid-cols-[minmax(0,1fr)_19rem]', bodyClassName)}>
        <section className="min-w-0">{children}</section>
        {sidebar ? (
          <aside className={cn('min-w-0', sidebarClassName)}>{sidebar}</aside>
        ) : null}
      </div>
    </div>
  )
}
