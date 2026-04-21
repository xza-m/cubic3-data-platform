// frontend/src/v2/components/ui/Card.tsx
import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@v2/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tight?: boolean
}

export function Card({ tight, className, ...rest }: CardProps) {
  return <div className={cn('card', tight && 'card-tight', className)} {...rest} />
}

interface CardHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  extra?: ReactNode
  /** `extra` 的别名，便于直接写 `actions={...}`。 */
  actions?: ReactNode
}

export function CardHead({
  title,
  subtitle,
  extra,
  actions,
  children,
  className,
  ...rest
}: CardHeadProps) {
  const right = actions ?? extra
  return (
    <div className={cn('card-head', className)} {...rest}>
      {title !== undefined || subtitle !== undefined ? (
        <div className="min-w-0 flex-1">
          {title !== undefined ? <div className="card-title">{title}</div> : null}
          {subtitle !== undefined ? (
            <div className="mt-0.5 text-[11px] text-3 truncate">{subtitle}</div>
          ) : null}
        </div>
      ) : null}
      {children}
      {right !== undefined ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card-body', className)} {...rest} />
}
