// frontend/src/v2/components/ui/Button.tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@v2/lib/cn'

type Variant = 'default' | 'primary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', loading = false, className, type = 'button', disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        size === 'sm' && 'btn-sm',
        loading && 'cursor-wait opacity-70',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 12 : 14} className="animate-spin" /> : null}
      {children}
    </button>
  )
})

interface RailButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const RailButton = forwardRef<HTMLButtonElement, RailButtonProps>(function RailButton(
  { active, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('rail-btn', active && 'active', className)}
      {...rest}
    />
  )
})
