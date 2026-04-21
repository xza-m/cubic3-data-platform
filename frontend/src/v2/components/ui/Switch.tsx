// frontend/src/v2/components/ui/Switch.tsx
import { cn } from '@v2/lib/cn'

interface SwitchProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function Switch({ checked = false, onChange, disabled, className, ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn('switch', checked && 'on', disabled && 'opacity-50 cursor-not-allowed', className)}
    />
  )
}
