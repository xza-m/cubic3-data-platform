// frontend/src/v2/layout/Inspector.tsx
// 通用 ContextPanel（保留旧文件名 Inspector 以减少 import 改动）。
//
// 重要：本面板由路由驱动，而不是由列表行选中驱动。
// - 列表页：展示模块级 KPI / 快捷入口
// - 详情页：展示当前实体的摘要 + 操作
// - 折叠：用户偏好持久化于 localStorage
import { type ReactNode } from 'react'
import { PanelRightClose, PanelRightOpen, Compass } from 'lucide-react'

interface InspectorProps {
  title?: ReactNode
  subtitle?: ReactNode
  collapsed: boolean
  onToggleCollapse: () => void
  emptyState?: ReactNode
  children?: ReactNode
}

export function Inspector({
  title,
  subtitle,
  collapsed,
  onToggleCollapse,
  emptyState,
  children,
}: InspectorProps) {
  if (collapsed) {
    return (
      <aside
        className="surface flex h-full w-8 shrink-0 flex-col items-center border-l py-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          className="rail-btn"
          onClick={onToggleCollapse}
          aria-label="展开上下文面板"
          title="展开上下文面板"
        >
          <PanelRightOpen size={14} />
        </button>
      </aside>
    )
  }

  const hasContent = !!children
  return (
    <aside
      className="surface flex h-full w-[300px] shrink-0 flex-col border-l"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-start justify-between gap-3 border-b px-3 py-2.5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-3">上下文面板</div>
          <div className="truncate text-[13px] font-medium text-1">{title ?? '上下文'}</div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[11px] text-3">{subtitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          className="rail-btn"
          onClick={onToggleCollapse}
          aria-label="折叠上下文面板"
          title="折叠上下文面板"
        >
          <PanelRightClose size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin">
        {hasContent ? children : emptyState ?? <DefaultEmptyState />}
      </div>
    </aside>
  )
}

function DefaultEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-md"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
      >
        <Compass size={16} />
      </div>
      <div className="mt-3 text-[12px] text-2">当前模块未提供上下文</div>
      <div className="mt-1 text-[11px] text-3 leading-4">导航到具体页面查看 KPI、摘要或操作</div>
    </div>
  )
}

export interface ContextPanelSectionProps {
  title?: ReactNode
  children: ReactNode
}

export function ContextSection({ title, children }: ContextPanelSectionProps) {
  return (
    <section className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
      {title ? (
        <div className="px-0 pb-1.5 text-[10px] uppercase tracking-wide text-3 font-semibold">
          {title}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  )
}

export function ContextRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 text-[12px]"
      style={{ borderColor: 'var(--border)' }}
    >
      <span className="text-3 truncate">{label}</span>
      <span className="text-1 truncate text-right">{value ?? '—'}</span>
    </div>
  )
}

export function ContextActions({ children }: { children: ReactNode }) {
  return <div className="space-y-1.5">{children}</div>
}
