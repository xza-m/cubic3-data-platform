// frontend/src/v2/components/ui/Tabs.tsx
//
// 极简 Tabs 组件，受控/非受控两用：
//   <Tabs value={tab} onChange={setTab}>
//     <Tab value="overview">总览</Tab>
//     <Tab value="config">配置</Tab>
//   </Tabs>
//
// 不依赖第三方；仅作 UI 表层，不内置 panel。Panel 在外部根据 value 切换。
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cn } from '@v2/lib/cn'

interface TabsCtx {
  value: string
  onChange: (v: string) => void
  size: 'md' | 'sm'
}

const Ctx = createContext<TabsCtx | null>(null)

export interface TabsProps {
  value: string
  onChange: (v: string) => void
  size?: 'md' | 'sm'
  className?: string
  'aria-label'?: string
  children: ReactNode
}

export function Tabs({ value, onChange, size = 'md', className, 'aria-label': ariaLabel, children }: TabsProps) {
  return (
    <Ctx.Provider value={{ value, onChange, size }}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          'flex items-center gap-1 border-b',
          className,
        )}
        style={{ borderColor: 'var(--border)' }}
      >
        {Children.map(children, (child) => {
          if (!isValidElement(child)) return child
          return cloneElement(child as ReactElement)
        })}
      </div>
    </Ctx.Provider>
  )
}

export interface TabProps {
  value: string
  disabled?: boolean
  id?: string
  'aria-controls'?: string
  children: ReactNode
  className?: string
}

export function Tab({ value, disabled, id, 'aria-controls': ariaControls, children, className }: TabProps) {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('<Tab> must be used inside <Tabs>')
  const active = ctx.value === value
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-disabled={disabled}
      aria-controls={ariaControls}
      disabled={disabled}
      onClick={() => !disabled && ctx.onChange(value)}
      className={cn(
        'relative -mb-px flex items-center gap-1.5 border-b-2 border-transparent px-3 transition-colors',
        ctx.size === 'sm' ? 'h-7 text-[12px]' : 'h-9 text-[13px]',
        active
          ? 'border-[color:var(--accent)] text-1 font-medium'
          : 'text-3 hover:text-1',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
