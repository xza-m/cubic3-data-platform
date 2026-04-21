// frontend/src/v2/components/PeekPanel.tsx
// Slide-over Peek 面板：渲染于主内容区域内部（覆盖列表右侧）。
// 设计目标：
//   - 让用户在不离开列表的前提下深读单行详情
//   - 打开期间临时隐藏 ContextPanel，由 Peek 接管"右侧空间"语义
//   - 按 ⤢ / ⌘↵ 升级为 Tab + 路由全屏详情
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { Kbd } from '@v2/components/ui'
import { useAppShell } from '@v2/layout/AppShell'

export interface PeekPanelProps {
  open: boolean
  onClose: () => void
  /** 升级为路由 + Tab 全屏详情；缺省时不显示 ⤢ 按钮 */
  onOpenFull?: () => void
  title: ReactNode
  subtitle?: ReactNode
  /** 顶部 chip / badge 区（如状态、标签） */
  badges?: ReactNode
  /** 主体内容（自由布局） */
  children: ReactNode
  /** 底部固定操作区（可选） */
  footer?: ReactNode
  /** 顶部右侧操作区（按钮组等） */
  actions?: ReactNode
  /** 宽度档位：默认 narrow（≈420px），适合两栏 master-detail；wide ≈ 50% */
  size?: 'narrow' | 'medium' | 'wide'
}

const SIZE_TO_WIDTH: Record<NonNullable<PeekPanelProps['size']>, string> = {
  narrow: 'min(48%, 520px)',
  medium: 'min(56%, 640px)',
  wide: 'min(64%, 760px)',
}

export function PeekPanel({
  open,
  onClose,
  onOpenFull,
  title,
  subtitle,
  badges,
  children,
  footer,
  actions,
  size = 'medium',
}: PeekPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { setPeekActive } = useAppShell()

  // 通知 Shell 隐藏 ContextPanel，让出右侧空间
  useEffect(() => {
    setPeekActive(open)
    return () => setPeekActive(false)
  }, [open, setPeekActive])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && onOpenFull) {
        e.preventDefault()
        onOpenFull()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, onOpenFull])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  // a11y (W5.C): when the panel is offscreen we MUST remove its descendants
  // from both the focus order and the AT tree. Using `aria-hidden` alone
  // triggers axe `aria-hidden-focus` because the close/upgrade buttons stay
  // tabbable. The `inert` attribute does both and is supported in all
  // current browsers (2022+). Set via setAttribute to dodge React 18's
  // missing TS types for `inert`.
  useEffect(() => {
    const node = panelRef.current
    if (!node) return
    if (open) {
      node.removeAttribute('inert')
    } else {
      node.setAttribute('inert', '')
    }
  }, [open])

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-200"
        style={{
          background: 'color-mix(in srgb, var(--bg-app) 25%, transparent)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="complementary"
        aria-label="行预览"
        onKeyDown={onPanelKeyDown}
        className="absolute right-0 top-0 bottom-0 z-20 flex flex-col border-l shadow-xl outline-none transition-transform duration-200 ease-out"
        style={{
          width: SIZE_TO_WIDTH[size],
          minWidth: '380px',
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <header
          className="flex items-start gap-3 border-b px-4 py-2.5"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-1">
              <span className="truncate">{title}</span>
              {badges}
            </div>
            {subtitle ? (
              <div className="mt-0.5 truncate text-[11px] text-3">{subtitle}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            {onOpenFull ? (
              <button
                type="button"
                onClick={onOpenFull}
                title="在新 Tab 打开 (⌘↵)"
                className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-2 transition-colors hover:bg-[color:var(--bg-hover)] hover:text-1"
              >
                <ArrowUpRight size={12} /> 打开
                <Kbd className="ml-0.5">⌘↵</Kbd>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              title="关闭 (Esc)"
              aria-label="关闭预览"
              className="flex h-7 w-7 items-center justify-center rounded-md text-3 transition-colors hover:bg-[color:var(--bg-hover)] hover:text-1"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        </header>
        <div className="scroll-thin flex-1 overflow-auto">{children}</div>
        {footer ? (
          <footer
            className="border-t px-4 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
          >
            {footer}
          </footer>
        ) : null}
      </aside>
    </>
  )
}
