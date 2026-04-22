// frontend/src/v2/components/ListContextPanel.tsx
// 列表页通用的 ContextPanel 内容构件：模块级 KPI / 分布 / 快捷操作 / 提示。
// 与 Peek 互不干扰 —— Peek 打开期间 ContextPanel 自动隐藏。
import type { ReactNode } from 'react'
import { Kbd } from '@v2/components/ui'
import { t } from '@v2/i18n'

export function ListContextBody({ children }: { children: ReactNode }) {
  return <div className="space-y-4 px-4 py-4">{children}</div>
}

export function CtxSection({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wide text-3 font-medium">{title}</div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: 'default' | 'success' | 'danger' | 'warning' }>
}) {
  return (
    <div className={`grid gap-2 ${items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {items.map((it) => (
        <Stat key={it.label} {...it} />
      ))}
    </div>
  )
}

export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'success' | 'danger' | 'warning'
}) {
  const color =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'danger'
        ? 'var(--danger)'
        : tone === 'warning'
          ? 'var(--warning)'
          : 'var(--text-1)'
  return (
    <div
      className="rounded-md border px-2 py-1.5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="text-[10px] uppercase tracking-wide text-3">{label}</div>
      <div className="text-[16px] font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

export function DistList({
  items,
}: {
  items: Array<{ label: ReactNode; value: ReactNode }>
}) {
  if (items.length === 0) {
    return <div className="text-[12px] text-3">{t('common.noData', '暂无数据')}</div>
  }
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
          <div className="flex min-w-0 items-center gap-1.5">{it.label}</div>
          <span className="text-2 tabular-nums">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

export function QuickAction({
  label,
  shortcut,
  onClick,
}: {
  label: ReactNode
  shortcut?: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12px] text-2 transition-colors hover:bg-[color:var(--bg-hover)] hover:text-1"
    >
      <span className="truncate">{label}</span>
      {shortcut ? <span className="shrink-0">{shortcut}</span> : null}
    </button>
  )
}

export function PeekHint() {
  return (
    <ul className="space-y-1 text-[11px] leading-5 text-3">
      <li>· {t('peekHint.rowClick', '单击行 → 打开预览 (Peek)')}</li>
      <li>
        · <Kbd>↑</Kbd>/<Kbd>↓</Kbd> {t('peekHint.switch', '切换预览对象')}
      </li>
      <li>
        · <Kbd>Esc</Kbd> {t('peekHint.close', '关闭预览')}
      </li>
    </ul>
  )
}
