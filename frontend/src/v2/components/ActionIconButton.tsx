// frontend/src/v2/components/ActionIconButton.tsx
//
// 表格、Peek 面板和详情页共用的图标动作按钮。
// 视觉上只显示图标，语义上通过 aria-label 和 Tooltip 保持可访问与可理解。

import type { MouseEventHandler } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Tooltip } from '@v2/components/ui'
import { cn } from '@v2/lib/cn'

type ActionIconButtonVariant = 'default' | 'primary' | 'danger' | 'ghost'

interface ActionIconButtonProps {
  label: string
  icon: LucideIcon
  onClick?: MouseEventHandler<HTMLButtonElement>
  variant?: ActionIconButtonVariant
  disabled?: boolean
  loading?: boolean
  className?: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

const variantClass: Record<ActionIconButtonVariant, string> = {
  default: 'border text-[color:var(--text-2)] hover:bg-[color:var(--bg-hover)]',
  primary: 'border border-transparent bg-[color:var(--accent)] text-white hover:opacity-90',
  danger: 'border border-transparent text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
  ghost: 'border border-transparent text-[color:var(--text-3)] hover:bg-[color:var(--bg-hover)]',
}

export function ActionIconButton({
  label,
  icon: Icon,
  onClick,
  variant = 'default',
  disabled = false,
  loading = false,
  className,
  tooltipSide = 'top',
}: ActionIconButtonProps) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onClick={onClick}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md text-xs transition-colors focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40',
          variantClass[variant],
          className,
        )}
        style={variant === 'default' ? { borderColor: 'var(--border)' } : undefined}
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <Icon size={13} aria-hidden />
        )}
      </button>
    </Tooltip>
  )
}
