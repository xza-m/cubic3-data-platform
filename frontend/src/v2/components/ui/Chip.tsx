// frontend/src/v2/components/ui/Chip.tsx
import { type HTMLAttributes } from 'react'
import { cn } from '@v2/lib/cn'

export type ChipTone = 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral'

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone
}

export function Chip({ tone = 'neutral', className, children, ...rest }: ChipProps) {
  return (
    <span className={cn('chip', `chip-${tone}`, className)} {...rest}>
      {children}
    </span>
  )
}
