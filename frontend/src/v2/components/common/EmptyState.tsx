import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center ${className}`}>
      {icon ? <div className="text-3">{icon}</div> : null}
      <div className="text-[13px] font-medium text-2">{title}</div>
      {description ? <div className="max-w-md text-[12px] leading-5 text-3">{description}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
