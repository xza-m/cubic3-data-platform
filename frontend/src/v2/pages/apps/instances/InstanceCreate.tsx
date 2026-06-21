// frontend/src/v2/pages/apps/instances/InstanceCreate.tsx
//
// 创建应用实例表单页。
// 接口：GET /api/v1/apps        (获取可选应用列表)
//       GET /api/v1/apps/:code/config-schema  (获取配置 schema)
//       POST /api/v1/app-instances            (创建)

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Pencil } from 'lucide-react'
import { t } from '@v2/i18n'
import { useApps, useValidateAppConfig } from '@v2/hooks/apps'
import { useCreateInstance } from '@v2/hooks/instances'
import { getAppConfigSchema } from '@v2/api/apps'
import { appCategoryLabel } from '@v2/lib/appLabels'
import { StructuredDetails } from '@v2/components/common/StructuredDetails'

const SCHEDULE_TYPES = [
  { value: 'manual', label: t('schedule.manual', '手动') },
  { value: 'cron', label: t('schedule.cron', '定时（cron）') },
  { value: 'event', label: t('schedule.event', '事件触发') },
]

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
        {required && (
          <span className="ml-1" style={{ color: 'var(--danger)' }}>
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  )
}

interface FieldErrors {
  app_code?: string
  name?: string
  config?: string
  schedule_type?: string
  schedule_config?: string
}

export default function InstanceCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefilledAppCode =
    new URLSearchParams(location.search).get('app_code')
    || (location.state as { app_code?: string } | null)?.app_code
    || ''

  const [appCode, setAppCode] = useState(prefilledAppCode)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scheduleType, setScheduleType] = useState('manual')
  const [configText, setConfigText] = useState('{}')
  const [scheduleConfigText, setScheduleConfigText] = useState('{}')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [configSchema, setConfigSchema] = useState<Record<string, unknown> | null>(null)
  const [configEditing, setConfigEditing] = useState(false)

  const { data: apps = [], isLoading: appsLoading } = useApps({ enabled_only: true })
  const createMut = useCreateInstance()
  const validateMut = useValidateAppConfig()

  // 选择应用时，拉取 config schema
  useEffect(() => {
    if (!appCode) {
      setConfigSchema(null)
      return
    }
    getAppConfigSchema(appCode)
      .then(setConfigSchema)
      .catch(() => setConfigSchema(null))
  }, [appCode])

  function validate(): boolean {
    const e: FieldErrors = {}

    if (!appCode) e.app_code = t('form.error.required', '必填项')
    if (!name.trim()) e.name = t('form.error.required', '必填项')

    try {
      JSON.parse(configText)
    } catch {
      e.config = t('form.error.invalid_json', '配置格式不正确（JSON）')
    }

    if (scheduleType !== 'manual') {
      try {
        JSON.parse(scheduleConfigText)
      } catch {
        e.schedule_config = t('form.error.invalid_json', '格式不正确（JSON）')
      }
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const config = JSON.parse(configText) as Record<string, unknown>
    const scheduleConfig =
      scheduleType !== 'manual' ? (JSON.parse(scheduleConfigText) as Record<string, unknown>) : undefined

    createMut.mutate(
      {
        app_code: appCode,
        name: name.trim(),
        description: description.trim() || undefined,
        config,
        schedule_type: scheduleType,
        schedule_config: scheduleConfig,
        enabled: false,
      },
      {
        onSuccess: (inst) => {
          navigate(`/apps/instances/${inst.id}`)
        },
        onError: (err) => {
          setErrors({ name: err.message })
        },
      },
    )
  }

  const inputCls =
    'w-full rounded border px-2 py-1.5 text-xs outline-none focus:ring-1'
  const inputStyle = {
    background: 'var(--bg-surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text-1)',
  }
  const configPreview = formatJsonForDisplay(configText)
  const schemaPreview = configSchema && Object.keys(configSchema).length > 0
    ? JSON.stringify(configSchema, null, 2)
    : ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => navigate('/apps/instances')}
        >
          <ArrowLeft size={12} />
          {t('action.back', '返回')}
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('instancecreate.title', '创建应用实例')}
        </span>
      </header>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-xl space-y-4"
        >
          <div
            className="rounded-md border p-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              {t('instancecreate.section.basic', '基础信息')}
            </div>

            <div className="space-y-3">
              <FormField
                label={t('instance.field.app_code', '应用')}
                required
                error={errors.app_code}
              >
                {appsLoading ? (
                  <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {t('state.loading', '加载中…')}
                  </div>
                ) : (
                  <select
                    className={inputCls}
                    style={inputStyle}
                    value={appCode}
                    onChange={(e) => {
                      setAppCode(e.target.value)
                      setErrors((prev) => ({ ...prev, app_code: undefined }))
                    }}
                  >
                    <option value="">{t('form.placeholder.select_app', '请选择应用…')}</option>
                    {apps.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name} · {appCategoryLabel(a.category)} · {a.enabled ? t('common.enabled', '启用') : t('common.disabled', '已停')}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>

              <FormField
                label={t('instance.field.name', '实例名称')}
                required
                error={errors.name}
              >
                <input
                  className={inputCls}
                  style={inputStyle}
                  placeholder={t('instancecreate.placeholder.name', '为实例取一个有意义的名称…')}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                />
              </FormField>

              <FormField label={t('instance.field.description', '描述（可选）')}>
                <textarea
                  className={inputCls}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
                  placeholder={t('instancecreate.placeholder.description', '（可选）描述此实例的用途…')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </FormField>

              <FormField
                label={t('instance.field.schedule', '调度方式')}
                error={errors.schedule_type}
              >
                <select
                  className={inputCls}
                  style={inputStyle}
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                >
                  {SCHEDULE_TYPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FormField>

              {scheduleType !== 'manual' && (
                <FormField
                  label={t('instance.field.schedule_config', '调度配置')}
                  error={errors.schedule_config}
                >
                  <textarea
                    className={inputCls}
                    style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 80 }}
                    value={scheduleConfigText}
                    onChange={(e) => {
                      setScheduleConfigText(e.target.value)
                      setErrors((prev) => ({ ...prev, schedule_config: undefined }))
                    }}
                  />
                </FormField>
              )}
            </div>
          </div>

          <div
            className="rounded-md border p-4"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                {t('instancecreate.section.config', '配置参数')}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfigEditing((value) => !value)}
                  aria-pressed={configEditing}
                >
                  <Pencil size={12} />
                  {configEditing ? t('action.done', '完成') : t('action.edit', '编辑')}
                </button>
                {appCode ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={validateMut.isPending}
                    onClick={async () => {
                      try {
                        const config = JSON.parse(configText) as Record<string, unknown>
                        await validateMut.mutateAsync({ code: appCode, config })
                        setErrors((prev) => ({ ...prev, config: undefined }))
                      } catch (err: unknown) {
                        setErrors((prev) => ({
                          ...prev,
                          config:
                            err instanceof Error
                              ? err.message
                              : t('form.error.validate_failed', '校验失败'),
                        }))
                      }
                    }}
                  >
                    <CheckCircle2 size={12} />
                    {validateMut.isPending ? t('state.validating', '校验中…') : t('action.validate', '校验')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <section
                className="rounded border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
              >
                <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                  {t('instancecreate.schema.title', '配置结构')}
                </div>
                {schemaPreview ? (
                  <StructuredDetails
                    title={t('instancecreate.schema.detailTitle', '查看结构详情')}
                    value={configSchema}
                    summary={t('instancecreate.schema.summary', '配置结构已载入，可先校验再创建实例')}
                  />
                ) : (
                  <div className="rounded border px-2 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                    {t('instancecreate.schema.empty', '当前应用未定义配置结构')}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-1 text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                  {t('instancecreate.config.title', '配置内容')}
                </div>
                {configEditing ? (
                  <FormField label="" error={errors.config}>
                    <textarea
                      className={inputCls}
                      style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 160 }}
                      value={configText}
                      onChange={(e) => {
                        setConfigText(e.target.value)
                        setErrors((prev) => ({ ...prev, config: undefined }))
                      }}
                    />
                  </FormField>
                ) : (
                  <>
                    <pre
                      className="min-h-[88px] overflow-auto rounded border p-2 text-xs leading-5"
                      style={{
                        background: 'var(--bg-surface-2)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-2)',
                      }}
                    >
                      {configPreview}
                    </pre>
                    {errors.config ? (
                      <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{errors.config}</p>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/apps/instances')}
            >
              {t('action.cancel', '取消')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMut.isPending}
            >
              {createMut.isPending
                ? t('state.saving', '保存中…')
                : t('action.create', '创建实例')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function formatJsonForDisplay(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}
