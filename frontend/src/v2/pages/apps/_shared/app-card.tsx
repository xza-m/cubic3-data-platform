// frontend/src/v2/pages/apps/_shared/app-card.tsx
/* eslint-disable react-refresh/only-export-components -- 该文件与主组件/Provider 同时导出 helper/Context/hook，是项目历史共享约定；Fast Refresh 会丢热更粒度但不影响生产功能。 */
//
// 应用卡片 & 行 shared 展示组件。Marketplace.tsx 复用。
// drop-frontend 列表：
//   - App.rating（星标评分）      — see plan §3.4
//   - App.installs（装机数）       — see plan §3.4
//   - App.capabilities（假标签）  — see plan §3.4
//   - "安装/卸载"按钮             — see plan §3.4（改为"创建实例"）

import { ArrowRight, Bot, CalendarClock, LayoutGrid, Sigma, ShieldCheck, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react'
import { t } from '@v2/i18n'
import type { App } from '@v2/api/apps'

// ============================================================================
// 分类 → 图标/颜色映射
// ============================================================================

interface CategoryMeta {
  icon: LucideIcon
  color: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  销售: { icon: TrendingUp, color: 'var(--success)' },
  风控: { icon: ShieldCheck, color: 'var(--danger)' },
  治理: { icon: LayoutGrid, color: 'var(--accent)' },
  增长: { icon: Sparkles, color: 'var(--violet)' },
  财务: { icon: Sigma, color: 'var(--warning)' },
  AI: { icon: Bot, color: 'var(--accent)' },
  管理: { icon: CalendarClock, color: 'var(--text-3)' },
}

export function metaOf(cat: string): CategoryMeta {
  return CATEGORY_META[cat] ?? { icon: LayoutGrid, color: 'var(--text-3)' }
}

// ============================================================================
// 状态 Chip（按 enabled 字段，后端无 status 区分 published/draft/deprecated）
// ============================================================================

export function AppStatusChip({ enabled }: { enabled: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-px text-xs font-medium"
      style={{
        background: enabled ? 'var(--success-soft)' : 'var(--bg-surface-2)',
        color: enabled ? 'var(--success)' : 'var(--text-3)',
      }}
    >
      {enabled ? t('app.status.enabled', '已启用') : t('app.status.disabled', '已禁用')}
    </span>
  )
}

// ============================================================================
// AppCard — 卡片视图
// ============================================================================

interface AppCardProps {
  app: App
  onOpen: () => void
  onCreateInstance?: () => void
}

export function AppCard({ app, onOpen, onCreateInstance }: AppCardProps) {
  const meta = metaOf(app.category)
  const Icon = meta.icon

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-md border text-left transition-all hover:-translate-y-px hover:shadow-md"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      {/* Accent stripe */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] opacity-90"
        style={{ background: meta.color }}
      />

      <div className="flex items-start gap-3 p-3 pt-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-white"
          style={{ background: meta.color }}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {app.name}
            </span>
            <AppStatusChip enabled={app.enabled} />
          </div>
          <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
            {app.author && <span>{app.author}</span>}
            {app.author && app.category && <span className="mx-1.5">·</span>}
            <span>{app.category}</span>
            {app.version && <span className="mx-1.5">v{app.version}</span>}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 px-3 text-xs leading-5" style={{ color: 'var(--text-2)' }}>
        {app.description ?? t('app.no_description', '暂无描述')}
      </p>

      {/* drop-frontend: App.capabilities 假标签 — see plan §3.4 */}

      <div
        className="mt-auto flex items-center justify-between border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}
      >
        <span className="flex items-center gap-3">
          {/* drop-frontend: App.rating (Star icon) — see plan §3.4 */}
          {/* drop-frontend: App.installs (Download icon) — see plan §3.4 */}
          {app.instance_count != null && (
            <span>{t('app.instance_count', '实例')} {app.instance_count}</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {onCreateInstance && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={(e) => {
                e.stopPropagation()
                onCreateInstance()
              }}
            >
              {/* drop-frontend: "安装/卸载" → "创建实例" — see plan §3.4 */}
              {t('app.create_instance', '创建实例')}
            </button>
          )}
          <ArrowRight
            size={11}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: meta.color }}
          />
        </span>
      </div>
    </button>
  )
}

// ============================================================================
// AppRow — 列表行视图
// ============================================================================

interface AppRowProps {
  app: App
  onOpen: () => void
}

export function AppRow({ app, onOpen }: AppRowProps) {
  const meta = metaOf(app.category)
  const Icon = meta.icon

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded border px-3 py-2 text-left transition-colors"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white"
        style={{ background: meta.color }}
      >
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            {app.name}
          </span>
          <AppStatusChip enabled={app.enabled} />
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {app.author} · {app.category}
          </span>
        </div>
        <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
          {app.description}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-3)' }}>
        {/* drop-frontend: App.rating (Star icon) — see plan §3.4 */}
        {/* drop-frontend: App.installs (Download icon) — see plan §3.4 */}
        {app.instance_count != null && (
          <span>{t('app.instance_count', '实例')} {app.instance_count}</span>
        )}
        <ArrowRight size={11} className="group-hover:text-accent" style={{ color: 'var(--text-3)' }} />
      </div>
    </button>
  )
}
