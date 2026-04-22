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

import { useEffect, useState } from 'react'
import { useAppShell } from '@v2/layout/AppShell'
import { Button, Input } from '@v2/components/ui'
import { useToast } from '@v2/components/ui/Toast'
import { useMyPreferences, useUpdateMyPreferences } from '@v2/hooks/userPreferences'
import type { ThemePreference, TableDensity, UserPreferences } from '@v2/api/userPreferences'
import { cn } from '@v2/lib/cn'
import { useA11yPreferences, type OverrideMode } from '@v2/components/A11yPreferencesProvider'

// ── 本地表单状态 ──────────────────────────────────────────────────────────────

interface FormState {
  theme: ThemePreference
  default_landing: string
  list_page_size: number
  table_density: TableDensity
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

// ── 分段控件 ───────────────────────────────────────────────────────────────────

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

// ── 错误文案 ───────────────────────────────────────────────────────────────────

function validateForm(form: FormState): string | null {
  if (!form.default_landing.startsWith('/')) {
    return '默认落地页必须以 / 开头'
  }
  if (!Number.isInteger(form.list_page_size) || form.list_page_size < 5 || form.list_page_size > 200) {
    return '列表页尺寸必须是 5 到 200 之间的整数'
  }
  return null
}

// ── 主组件 ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { setBreadcrumbs } = useAppShell()
  const toast = useToast()

  const { data: prefs, isLoading } = useMyPreferences()
  const updateMutation = useUpdateMyPreferences()
  const a11y = useA11yPreferences()

  const [form, setForm] = useState<FormState | null>(null)

  useEffect(() => {
    setBreadcrumbs(['设置', '我的偏好'])
    return () => setBreadcrumbs([])
  }, [setBreadcrumbs])

  // 服务端快照加载后初始化表单（仅第一次）
  useEffect(() => {
    if (prefs && !form) {
      setForm(toForm(prefs))
    }
  }, [prefs, form])

  if (isLoading || !form || !prefs) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-3">加载中…</div>
    )
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

    // 只发送与当前服务端快照不同的字段
    const patch: Partial<FormState> = {}
    if (form.theme !== prefs.theme) patch.theme = form.theme
    if (form.default_landing !== prefs.default_landing) patch.default_landing = form.default_landing
    if (form.list_page_size !== prefs.list_page_size) patch.list_page_size = form.list_page_size
    if (form.table_density !== prefs.table_density) patch.table_density = form.table_density

    try {
      await updateMutation.mutateAsync(patch)
      toast.show({ tone: 'success', title: '偏好已保存' })
    } catch {
      toast.show({ tone: 'danger', title: '保存失败，请重试' })
    }
  }

  const themeOptions: SegmentedOption<ThemePreference>[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ]

  const densityOptions: SegmentedOption<TableDensity>[] = [
    { value: 'comfortable', label: '舒适' },
    { value: 'compact', label: '紧凑' },
  ]

  return (
    <div className="mx-auto w-full max-w-[600px] px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-[15px] font-semibold text-1">我的偏好</h1>
        <p className="mt-1 text-[12px] text-3">个性化平台外观与交互行为</p>
      </div>

      {/* 设置卡片 */}
      <div
        className="rounded-lg border divide-y"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        {/* 主题 */}
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">界面主题</div>
            <div className="mt-0.5 text-[12px] text-3">选择浅色、深色模式或跟随系统设置</div>
          </div>
          <SegmentedControl
            aria-label="界面主题"
            value={form.theme}
            onChange={(v) => setForm((f) => f && { ...f, theme: v })}
            options={themeOptions}
          />
        </div>

        {/* 表格密度 */}
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">表格密度</div>
            <div className="mt-0.5 text-[12px] text-3">控制表格行高与内容间距</div>
          </div>
          <SegmentedControl
            aria-label="表格密度"
            value={form.table_density}
            onChange={(v) => setForm((f) => f && { ...f, table_density: v })}
            options={densityOptions}
          />
        </div>

        {/* 默认落地页 */}
        <div className="px-5 py-4">
          <div className="text-[13px] font-medium text-1">默认落地页</div>
          <div className="mt-0.5 text-[12px] text-3">登录后自动跳转到此路径（必须以 / 开头）</div>
          <Input
            className="mt-2 w-full max-w-[320px]"
            value={form.default_landing}
            onChange={(e) => setForm((f) => f && { ...f, default_landing: e.target.value })}
            placeholder="/dashboard"
            aria-label="默认落地页"
          />
          {form.default_landing && !form.default_landing.startsWith('/') ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>
              路径必须以 / 开头
            </p>
          ) : null}
        </div>

        {/* 动效与对比度（A-1 / A-2） */}
        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">减少动态效果</div>
            <div className="mt-0.5 text-[12px] text-3">对眩晕敏感的用户推荐开启；默认跟随系统</div>
          </div>
          <SegmentedControl<OverrideMode>
            aria-label="减少动态效果"
            value={a11y.reducedMotion}
            onChange={a11y.setReducedMotion}
            options={[
              { value: 'auto', label: '跟随系统' },
              { value: 'on', label: '始终开启' },
              { value: 'off', label: '始终关闭' },
            ]}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-4 gap-4">
          <div>
            <div className="text-[13px] font-medium text-1">高对比主题</div>
            <div className="mt-0.5 text-[12px] text-3">加强边框与文字对比；默认跟随系统</div>
          </div>
          <SegmentedControl<OverrideMode>
            aria-label="高对比主题"
            value={a11y.highContrast}
            onChange={a11y.setHighContrast}
            options={[
              { value: 'auto', label: '跟随系统' },
              { value: 'on', label: '始终开启' },
              { value: 'off', label: '始终关闭' },
            ]}
          />
        </div>

        {/* 列表页尺寸 */}
        <div className="px-5 py-4">
          <div className="text-[13px] font-medium text-1">列表默认条数</div>
          <div className="mt-0.5 text-[12px] text-3">列表页每页默认展示条数（5–200）</div>
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
            aria-label="列表默认条数"
          />
          {(form.list_page_size < 5 || form.list_page_size > 200) ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--danger)' }}>
              请输入 5 到 200 之间的数字
            </p>
          ) : null}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={saveDisabled}
          loading={updateMutation.isPending}
          onClick={handleSave}
          aria-label="保存偏好"
        >
          保存
        </Button>
        <Button
          variant="ghost"
          disabled={pristine || updateMutation.isPending}
          onClick={handleReset}
          aria-label="重置为上次保存"
        >
          重置
        </Button>
      </div>
    </div>
  )
}
