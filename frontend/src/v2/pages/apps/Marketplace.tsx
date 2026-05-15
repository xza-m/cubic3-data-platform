// frontend/src/v2/pages/apps/Marketplace.tsx
//
// 应用市场列表页（L0）。
// 接口：GET /api/v1/apps
// P20: 新增 category/status facet + search + 卡片菜单（启用/停用/详情）
// drop-frontend 列表（see plan §3.4）:
//   - App.rating       — 无展示
//   - App.installs     — 无展示
//   - App.capabilities — 无展示（不渲染标签区）
//   - "安装/卸载"按钮  → 改为"创建实例"跳转

import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { t } from '@v2/i18n'
import { useApps, useAppCategories, useEnableApp, useDisableApp } from '@v2/hooks/apps'
import { useToast } from '@v2/components/ui'
import { RefreshButton, Toolbar, ToolbarSearch, ViewModeToggle } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import { AppCard, AppRow } from './_shared/app-card'
import type { App, AppCategoryOption } from '@v2/api/apps'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'enabled' | 'disabled'

const ALL_CATEGORY_VALUE = '__all__'

function allCategoryOption(): AppCategoryOption {
  return {
    value: ALL_CATEGORY_VALUE,
    label: t('marketplace.all', '全部'),
    app_count: null,
  }
}

function statusOptions(): { value: StatusFilter; label: string }[] {
  return [
    { value: 'all',      label: t('marketplace.status.all',      '全部状态') },
    { value: 'enabled',  label: t('marketplace.status.enabled',  '已启用') },
    { value: 'disabled', label: t('marketplace.status.disabled', '已禁用') },
  ]
}

export default function Marketplace() {
  const navigate = useNavigate()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState(ALL_CATEGORY_VALUE)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('grid')

  const { data: apps = [], isLoading, isError, refetch, isFetching } = useApps({
    include_stats: true,
  })
  const { data: serverCategories = [] } = useAppCategories()
  const enableMutation = useEnableApp()
  const disableMutation = useDisableApp()

  const categories = useMemo(() => [allCategoryOption(), ...serverCategories], [serverCategories])
  const categoryLabelByValue = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of serverCategories) {
      map.set(c.value, c.label)
    }
    return map
  }, [serverCategories])

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (category !== ALL_CATEGORY_VALUE && a.category !== category) return false
      if (statusFilter === 'enabled' && !a.enabled) return false
      if (statusFilter === 'disabled' && a.enabled) return false
      const q = keyword.trim().toLowerCase()
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !(a.description ?? '').toLowerCase().includes(q)
      )
        return false
      return true
    })
  }, [apps, category, statusFilter, keyword])

  const handleToggle = async (app: App) => {
    try {
      if (app.enabled) {
        await disableMutation.mutateAsync(app.code)
        toast.show({ tone: 'warning', title: t('marketplace.toast.disabled', '已停用'), description: app.name })
      } else {
        await enableMutation.mutateAsync(app.code)
        toast.show({ tone: 'success', title: t('marketplace.toast.enabled', '已启用'), description: app.name })
      }
    } catch {
      toast.show({ tone: 'danger', title: t('marketplace.toast.error', '操作失败'), description: app.name })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('marketplace.title', '应用市场')}
            </span>
            <span className="ml-2 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('marketplace.subtitle', '语义化分析与运营应用')}
            </span>
          </div>
          <Toolbar>
            <ToolbarSearch
              value={keyword}
              onChange={setKeyword}
              placeholder={t('marketplace.search_placeholder', '搜索应用名 / 描述…')}
              ariaLabel={t('marketplace.search.aria', '搜索应用')}
              width={220}
            />
            <ViewModeToggle<ViewMode>
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', icon: 'grid', label: t('view.grid', '卡片') },
                { value: 'list', icon: 'list', label: t('view.list', '列表') },
              ]}
            />
            <RefreshButton
              onClick={() => refetch()}
              loading={isFetching}
              ariaLabel={t('marketplace.action.refresh', '刷新应用列表')}
            />
          </Toolbar>
        </div>

        {/* Facet rail: category + status */}
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          {/* Category facet */}
          <div className="flex flex-wrap items-center gap-1">
            {categories.map((c) => {
              const active = category === c.value
              return (
                <button
                  key={c.value}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'var(--on-accent)' : 'var(--text-2)',
                  }}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label}
                  {c.app_count != null && c.value !== ALL_CATEGORY_VALUE ? (
                    <span aria-hidden className="ml-1 opacity-70">{c.app_count}</span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div className="h-4 w-px" style={{ background: 'var(--border)' }} />

          {/* Status facet */}
          <div className="flex items-center gap-1">
            {statusOptions().map((opt) => {
              const active = statusFilter === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    border: active ? '1px solid var(--accent)' : '1px solid transparent',
                  }}
                  onClick={() => setStatusFilter(opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>

          <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
            {filtered.length} / {apps.length}
          </span>
        </div>

        {/* Content */}
        <div
          className={
            view === 'grid'
              ? 'grid flex-1 auto-rows-max content-start items-start gap-3 overflow-auto p-3 md:grid-cols-2 xl:grid-cols-3'
              : 'flex flex-1 flex-col gap-2 overflow-auto p-3'
          }
        >
          {isLoading && (
            <div
              className="col-span-full flex items-center justify-center py-10 text-xs"
              style={{ color: 'var(--text-3)' }}
            >
              {t('state.loading', '加载中…')}
            </div>
          )}

          {isError && !isLoading && (
            <RetryState
              className="col-span-full py-10"
              message={t('state.load_error', '加载失败，请重试')}
              onRetry={() => refetch()}
              retryAriaLabel={t('marketplace.action.retry', '重试加载应用市场')}
            />
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div
              className="col-span-full flex items-center justify-center py-10 text-xs"
              style={{ color: 'var(--text-3)' }}
            >
              {t('state.empty', '未匹配到应用')}
            </div>
          )}

          {!isLoading &&
            !isError &&
            filtered.map((app) =>
              view === 'grid' ? (
                <AppCardWithMenu
                  key={app.code}
                  app={app}
                  categoryLabel={categoryLabelByValue.get(app.category)}
                  onOpen={() => navigate(`/apps/${app.code}`)}
                  onCreateInstance={() =>
                    navigate('/apps/instances/new', {
                      state: { app_code: app.code },
                    })
                  }
                  onToggle={() => void handleToggle(app)}
                  isToggling={
                    (app.enabled ? disableMutation.isPending : enableMutation.isPending)
                  }
                />
              ) : (
                <AppRowWithMenu
                  key={app.code}
                  app={app}
                  categoryLabel={categoryLabelByValue.get(app.category)}
                  onOpen={() => navigate(`/apps/${app.code}`)}
                  onToggle={() => void handleToggle(app)}
                  isToggling={
                    (app.enabled ? disableMutation.isPending : enableMutation.isPending)
                  }
                />
              ),
            )}
        </div>
      </div>
    </div>
  )
}

// ── 带菜单的卡片组件（P20）───────────────────────────────────────────────────

function AppCardWithMenu({
  app,
  categoryLabel,
  onOpen,
  onCreateInstance,
  onToggle,
  isToggling,
}: {
  app: App
  categoryLabel?: string
  onOpen: () => void
  onCreateInstance: () => void
  onToggle: () => void
  isToggling: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div className="group relative" data-testid="marketplace-app-card">
      <AppCard
        app={app}
        categoryLabel={categoryLabel}
        onOpen={onOpen}
        onCreateInstance={onCreateInstance}
      />
      {/* 右上角菜单按钮 */}
      <div className="absolute right-2 top-2">
        <button
          type="button"
          aria-label={t('marketplace.more', '更多操作')}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="flex size-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
          style={{ background: 'var(--bg-surface-2)' }}
        >
          <MoreHorizontal size={12} style={{ color: 'var(--text-2)' }} />
        </button>

        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 top-7 z-20 min-w-[120px] rounded-md border py-1 shadow-md"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
                setMenuOpen(false)
              }}
              className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
              style={{ color: 'var(--text-1)' }}
            >
              {t('marketplace.menu.detail', '查看详情')}
            </button>
            <button
              type="button"
              disabled={isToggling}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
                setMenuOpen(false)
              }}
              className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)] disabled:opacity-50"
              style={{ color: app.enabled ? 'var(--danger)' : 'var(--success)' }}
            >
              {app.enabled ? t('marketplace.menu.disable', '停用应用') : t('marketplace.menu.enable', '启用应用')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCreateInstance()
                setMenuOpen(false)
              }}
              className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
              style={{ color: 'var(--text-2)' }}
            >
              {t('marketplace.menu.createInstance', '创建实例')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AppRowWithMenu({
  app,
  categoryLabel,
  onOpen,
  onToggle,
  isToggling,
}: {
  app: App
  categoryLabel?: string
  onOpen: () => void
  onToggle: () => void
  isToggling: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative">
      <AppRow app={app} categoryLabel={categoryLabel} onOpen={onOpen} />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          type="button"
          aria-label={t('marketplace.more', '更多操作')}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="flex size-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: 'var(--bg-surface-2)' }}
        >
          <MoreHorizontal size={12} style={{ color: 'var(--text-2)' }} />
        </button>

        {menuOpen && (
          <div
            className="absolute right-0 top-7 z-20 min-w-[120px] rounded-md border py-1 shadow-md"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen()
                setMenuOpen(false)
              }}
              className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
              style={{ color: 'var(--text-1)' }}
            >
              {t('marketplace.menu.detail', '查看详情')}
            </button>
            <button
              type="button"
              disabled={isToggling}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
                setMenuOpen(false)
              }}
              className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)] disabled:opacity-50"
              style={{ color: app.enabled ? 'var(--danger)' : 'var(--success)' }}
            >
              {app.enabled ? t('marketplace.menu.disable', '停用应用') : t('marketplace.menu.enable', '启用应用')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
