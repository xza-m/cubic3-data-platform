// frontend/src/v2/components/ui/Kbd.tsx
import { type ReactNode } from 'react'
import { cn } from '@v2/lib/cn'

interface KbdProps {
  className?: string
  children: ReactNode
}

export function Kbd({ className, children }: KbdProps) {
  return <kbd className={cn(className)}>{children}</kbd>
}
