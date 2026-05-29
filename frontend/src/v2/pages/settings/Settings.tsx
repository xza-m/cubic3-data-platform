// frontend/src/v2/pages/settings/Settings.tsx
//
// 用户偏好设置页（P21）
// 路由: /settings
//
// 表单字段:
//   theme         — 分段控件: 浅色 / 深色 / 跟随系统
//   default_landing — 文本输入（必须以 / 开头）
//   list_page_size — 数字输入 5..200
//   table_density  — 分段控件: 舒适 / 紧凑
//
// 行为:
//   - 未改动时"保存"禁用
//   - 保存成功/失败 toast
//   - "重置"还原到上次服务端快照
//
// Round 4 · T-001c（第二批）— 全量走 t()；key 命名遵守 NAMING.md。

import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppShell } from '@v2/layout/AppShell'
import { Button, Input, Tab, Tabs } from '@v2/components/ui'
import { useToast } from '@v2/components/ui/Toast'
import { useMyPreferences, useUpdateMyPreferences } from '@v2/hooks/userPreferences'
import type { ThemePreference, TableDensity, UserPreferences } from '@v2/api/userPreferences'
import { cn } from '@v2/lib/cn'
import { useA11yPreferences, type OverrideMode } from '@v2/components/A11yPreferencesProvider'
import { t } from '@v2/i18n'
import AgentRuntimeSettings from './AgentRuntimeSettings'

interface FormState {
  theme: ThemePreference
  default_landing: string
  list_page_size: number
  table_density: TableDensity
}

type SettingsTab = 'general' | 'agent-runtime'

interface SettingsProps {
  initialTab?: SettingsTab
}

function toForm(prefs: UserPreferences): FormState {
  return {
    theme: prefs.theme,
    default_landing: prefs.default_landing,
    list_page_size: prefs.list_page_size,
    table_density: prefs.table_density,
  }
}

function isPristine(form: FormState, prefs: UserPreferences): boolean {
  return (
    form.theme === prefs.theme &&
    form.default_landing === prefs.default_landing &&
    form.list_page_size === prefs.list_page_size &&
    form.table_density === prefs.table_density
  )
}

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  'aria-label'?: string
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded border overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1 text-[12px] transition-colors border-r last:border-r-0',
              active
                ? 'font-medium text-white'
                : 'text-2 hover:text-1',
            )}
            style={{
              borderColor: 'var(--border)',
              background: active ? 'var(--accent)' : 'var(--bg-surface-2)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function validateForm(form: FormState): string | null {
  if (!form.default_landing.startsWith('/')) {
    return t('settings.validate.landingPrefix', '默认落地页必须以 / 开头')
  }
  if (!Number.isInteger(form.list_page_size) || form.list_page_size < 5 || form.list_page_size > 200) {
    return t('settings.validate.pageSizeRange', '列表页尺寸必须是 5 到 200 之间的整数')
  }
  return null
}

function settingsTabFromParam(value: string | null): SettingsTab | null {
  return value === 'agent-runtime' || value === 'general' ? value : null
}

export default function Settings({ initialTab = 'general' }: SettingsProps) {
  const { setBreadcrumbs } = useAppShell()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialActiveTab = settingsTabFromParam(searchParams.get('tab')) ?? initialTab

  const { data: prefs, isLoading } = useMyPreferences()
  const updateMutation = useUpdateMyPreferences()
  const a11y = useA11yPreferences()

  const [form, setForm] = useState<FormState | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialActiveTab)

  useEffect(() => {
    setBreadcrumbs([
      t('settings.breadcrumb.root', '设置'),
      t('settings.breadcrumb.mine', '我的偏好'),
    ])
    return () => setBreadcrumbs([])
  }, [setBreadcrumbs])

  useEffect(() => {
    if (prefs && !form) {
      setForm(toForm(prefs))
    }
  }, [prefs, form])

  useEffect(() => {
    const tabFromUrl = settingsTabFromParam(searchParams.get('tab'))
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl)
    }
  }, [activeTab, searchParams])

  function handleTabChange(tab: SettingsTab) {
    setActiveTab(tab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tab === 'agent-runtime') {
        next.set('tab', 'agent-runtime')
      } else {
        next.delete('tab')
      }
      return next
    }, { replace: true })
  }

  if (activeTab === 'general' && (isLoading || !form || !prefs)) {
    return (
      <SettingsShell activeTab={activeTab} onTabChange={handleTabChange}>
        <div className="flex min-h-[240px] flex-1 items-center justify-center text-[12px] text-3">
          {t('settings.state.loading', '加载中…')}
        </div>
      </SettingsShell>
    )
  }

  if (activeTab === 'agent-runtime') {
    return (
      <SettingsShell activeTab={activeTab} onTabChange={handleTabChange}>
        <AgentRuntimeSettings />
      </SettingsShell>
    )
  }

  if (!form || !prefs) {
    return null
  }

  const validationError = validateForm(form)
  const pristine = isPristine(form, prefs)
  const saveDisabled = pristine || updateMutation.isPending || !!validationError

  function handleReset() {
    setForm(toForm(prefs!))
  }

  async function handleSave() {
    if (!prefs) return
    const err = validateForm(form)
    if (err) {
      toast.show({ tone: 'danger', title: err })
      return
    }

    const patch: Partial<FormState> = {}
    if (form.theme !== prefs.theme) patch.theme = form.theme
    if (form.default_landing !== prefs.default_landing) patch.default_landing = form.default_landing
    if (form.list_page_size !== prefs.list_page_size) patch.list_page_size = form.list_page_size
    if (form.table_density !== prefs.table_density) patch.table_density = form.table_density

    try {
      await updateMutation.mutateAsync(patch)
      toast.show({ tone: 'success', title: t('settings.toast.saved', '偏好已保存') })
    } catch {
      toast.show({ tone: 'danger', title: t('settings.toast.saveFailed', '保存失败，请重试') })
    }
  }

  const themeOptions: SegmentedOption<ThemePreference>[] = [
    { value: 'light', label: t('settings.theme.light', '浅色') },
    { value: 'dark', label: t('settings.theme.dark', '深色') },
    { value: 'system', label: t('settings.theme.system', '跟随系统') },
  ]

  const densityOptions: SegmentedOption<TableDensity>[] = [
    { value: 'comfortable', label: t('settings.density.comfortable', '舒适') },
    { value: 'compact', label: t('settings.density.compact', '紧凑') },
  ]

  const overrideModeOptions: SegmentedOption<OverrideMode>[] = [
    { value: 'auto', label: t('settings.override.auto', '跟随系统') },
    { value: 'on', label: t('settings.override.on', '始终开启') },
    { value: 'off', label: t('settings.override.off', '始终关闭') },
  ]

  const labelTheme = t('settings.label.theme', '界面主题')
  const labelDensity = t('settings.label.density', '表格密度')
  const labelLanding = t('settings.label.landing', '默认落地页')
  const labelMotion = t('settings.label.reduceMotion', '减少动态效果')
  const labelContrast = t('settings.label.highContrast', '高对比主题')
  const labelPageSize = t('settings.label.pageSize', '列表默认条数')

  return (
    <SettingsShell activeTab={activeTab} onTabChange={handleTabChange}>
      <div
        className="rounded-lg border divide-y"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">{labelTheme}</div>
            <div className="mt-0.5 text-[12px] text-3">
              {t('settings.desc.theme', '选择浅色、深色模式或跟随系统设置')}
            </div>
          </div>
          <SegmentedControl
            aria-label={labelTheme}
            value={form.theme}
            onChange={(v) => setForm((f) => f && { ...f, theme: v })}
            options={themeOptions}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">{labelDensity}</div>
            <div className="mt-0.5 text-[12px] text-3">
              {t('settings.desc.density', '控制表格行高与内容间距')}
            </div>
          </div>
          <SegmentedControl
            aria-label={labelDensity}
            value={form.table_density}
            onChange={(v) => setForm((f) => f && { ...f, table_density: v })}
            options={densityOptions}
          />
        </div>

        <div className="px-5 py-4">
          <div className="text-[13px] font-medium text-1">{labelLanding}</div>
          <div className="mt-0.5 text-[12px] text-3">
            {t('settings.desc.landing', '登录后自动跳转到此路径（必须以 / 开头）')}
          </div>
          <Input
            className="mt-2 w-full max-w-[320px]"
            value={form.default_landing}
            onChange={(e) => setForm((f) => f && { ...f, default_landing: e.target.value })}
            placeholder="/dashboard"
            aria-label={labelLanding}
          />
          {form.default_landing && !form.default_landing.startsWith('/') ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>
              {t('settings.validate.landingPrefixShort', '路径必须以 / 开头')}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">{labelMotion}</div>
            <div className="mt-0.5 text-[12px] text-3">
              {t('settings.desc.reduceMotion', '对眩晕敏感的用户推荐开启；默认跟随系统')}
            </div>
          </div>
          <SegmentedControl<OverrideMode>
            aria-label={labelMotion}
            value={a11y.reducedMotion}
            onChange={a11y.setReducedMotion}
            options={overrideModeOptions}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">{labelContrast}</div>
            <div className="mt-0.5 text-[12px] text-3">
              {t('settings.desc.highContrast', '加强边框与文字对比；默认跟随系统')}
            </div>
          </div>
          <SegmentedControl<OverrideMode>
            aria-label={labelContrast}
            value={a11y.highContrast}
            onChange={a11y.setHighContrast}
            options={overrideModeOptions}
          />
        </div>

        <div className="px-5 py-4">
          <div className="text-[13px] font-medium text-1">{labelPageSize}</div>
          <div className="mt-0.5 text-[12px] text-3">
            {t('settings.desc.pageSize', '列表页每页默认展示条数（5–200）')}
          </div>
          <Input
            className="mt-2 w-[120px]"
            type="number"
            min={5}
            max={200}
            value={form.list_page_size}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setForm((f) => f && { ...f, list_page_size: Number.isNaN(v) ? f.list_page_size : v })
            }}
            aria-label={labelPageSize}
          />
          {(form.list_page_size < 5 || form.list_page_size > 200) ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>
              {t('settings.validate.pageSizeRangeShort', '请输入 5 到 200 之间的数字')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={saveDisabled}
          loading={updateMutation.isPending}
          onClick={handleSave}
          aria-label={t('settings.action.save', '保存偏好')}
        >
          {t('settings.action.saveShort', '保存')}
        </Button>
        <Button
          variant="ghost"
          disabled={pristine || updateMutation.isPending}
          onClick={handleReset}
          aria-label={t('settings.action.reset', '重置为上次保存')}
        >
          {t('settings.action.resetShort', '重置')}
        </Button>
      </div>
    </SettingsShell>
  )
}

function SettingsShell({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  children: ReactNode
}) {
  const activePanelId = activeTab === 'agent-runtime' ? 'settings-panel-agent-runtime' : 'settings-panel-general'
  const activeTabId = activeTab === 'agent-runtime' ? 'settings-tab-agent-runtime' : 'settings-tab-general'
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-[15px] font-semibold text-1">
          {t('settings.page.title', '我的偏好')}
        </h1>
        <p className="mt-1 text-[12px] text-3">
          {t('settings.page.subtitle', '个性化平台外观与交互行为')}
        </p>
      </div>
      <Tabs
        value={activeTab}
        onChange={(value) => onTabChange(value as SettingsTab)}
        aria-label="设置分类"
      >
        <Tab
          value="general"
          id="settings-tab-general"
          aria-controls="settings-panel-general"
        >
          {t('settings.tabs.general', '通用')}
        </Tab>
        <Tab
          value="agent-runtime"
          id="settings-tab-agent-runtime"
          aria-controls="settings-panel-agent-runtime"
        >
          AI Runtime
        </Tab>
      </Tabs>
      <div role="tabpanel" id={activePanelId} aria-labelledby={activeTabId}>
        {children}
      </div>
    </div>
  )
}
