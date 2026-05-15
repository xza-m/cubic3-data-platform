// frontend/src/v2/components/CommonControls.tsx
//
// 跨模块共性操作语言：搜索、筛选、刷新、新建与视图切换。
// 目标是让列表页工具栏在视觉、可访问名称和交互语义上保持一致。

import { useEffect, useRef, useState } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Grid, List, Plus, RefreshCcw, Search } from 'lucide-react'
import { Button, Input, Select } from '@v2/components/ui'
import { cn } from '@v2/lib/cn'
import { t } from '@v2/i18n'

export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  )
}

export function ToolbarSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  width = 220,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
  className?: string
  width?: number
}) {
  return (
    <label
      className={cn('relative block', className)}
      style={{ width }}
    >
      <span className="sr-only">{ariaLabel ?? t('common.search', '搜索')}</span>
      <Search
        size={13}
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-3)' }}
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-7"
      />
    </label>
  )
}

export function ToolbarSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  width = 132,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
  ariaLabel: string
  className?: string
  width?: number
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      aria-label={ariaLabel}
      className={className}
      style={{ width }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}

export function RefreshButton({
  onClick,
  loading,
  label = t('action.refresh', '刷新'),
  loadingLabel = t('action.refreshing', '刷新中…'),
  ariaLabel,
}: {
  onClick: () => unknown
  loading?: boolean
  label?: string
  loadingLabel?: string
  ariaLabel?: string
}) {
  const [pending, setPending] = useState(false)
  const mountedRef = useRef(true)
  const isLoading = Boolean(loading || pending)
  const displayLabel = isLoading ? loadingLabel : label
  const accessibleLabel = ariaLabel ?? label

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const handleClick = () => {
    const result = onClick()
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      setPending(true)
      void Promise.resolve(result)
        .catch(() => undefined)
        .finally(() => {
          if (mountedRef.current) {
            setPending(false)
          }
        })
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      loading={isLoading}
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {isLoading ? null : <RefreshCcw size={12} aria-hidden />}
      <span>{displayLabel}</span>
    </Button>
  )
}

export function CreateButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <Button type="button" variant="primary" size="sm" onClick={onClick}>
      <Plus size={12} aria-hidden />
      <span>{label}</span>
    </Button>
  )
}

export function CreateLink({
  label,
  className,
  ...props
}: Omit<LinkProps, 'children'> & {
  label: string
}) {
  return (
    <Link className={cn('btn btn-sm btn-primary', className)} {...props}>
      <Plus size={12} aria-hidden />
      <span>{label}</span>
    </Link>
  )
}

export function ViewModeToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel = t('view.toggle', '切换视图'),
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; icon: 'grid' | 'list' }>
  ariaLabel?: string
}) {
  const iconMap = { grid: Grid, list: List }
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-md border p-0.5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      {options.map((option) => {
        const Icon = iconMap[option.icon]
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            className="btn btn-sm border-transparent px-1.5"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--on-accent)' : 'var(--text-2)',
            }}
            onClick={() => onChange(option.value)}
          >
            <Icon size={12} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
