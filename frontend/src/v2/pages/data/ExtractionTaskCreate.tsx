// frontend/src/v2/pages/data/ExtractionTaskCreate.tsx
//
// 新建提取任务（/extraction/tasks/new）。
// 对接 POST /api/v1/extraction/tasks
//      GET  /api/v1/data-center/datasets (target dataset selector)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Workflow } from 'lucide-react'
import { useCreateExtractionTask } from '@v2/hooks/extraction'
import { useDatasets } from '@v2/hooks/datasets'
import type { CreateTaskPayload } from '@v2/api/extraction'
import { t } from '@v2/i18n'

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

function cronPresets() {
  return [
    { label: t('extractionTaskCreate.cron.hourly', '每小时'), value: '0 * * * *' },
    { label: t('extractionTaskCreate.cron.daily', '每天 00:00'), value: '0 0 * * *' },
    { label: t('extractionTaskCreate.cron.weekly', '每周一 00:00'), value: '0 0 * * 1' },
  ]
}

function taskTypeOptions(): Array<{ value: CreateTaskPayload['task_type']; label: string }> {
  return [
    { value: 'manual',    label: t('extractionTaskCreate.type.manual', '手动触发') },
    { value: 'scheduled', label: t('extractionTaskCreate.type.scheduled', '调度触发') },
    { value: 'api',       label: t('extractionTaskCreate.type.api', 'API 触发') },
  ]
}

export default function ExtractionTaskCreate() {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions } = useAppShell()
  const createTask = useCreateExtractionTask()
  const { data: datasetsData } = useDatasets({ page: 1, page_size: 200 })

  const [taskName, setTaskName] = useState('')
  const [taskType, setTaskType] = useState<CreateTaskPayload['task_type']>('manual')
  const [datasetId, setDatasetId] = useState<number | null>(null)
  const [cronExpression, setCronExpression] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [done, setDone] = useState(false)
  const [createdId, setCreatedId] = useState<number | null>(null)

  const datasets = datasetsData?.items ?? []

  useEffect(() => {
    setBreadcrumbs([
      t('extractionTaskCreate.breadcrumb.data', '数据'),
      t('extractionTaskCreate.breadcrumb.tasks', '提取任务'),
      t('extractionTaskCreate.breadcrumb.create', '新建'),
    ])
    setTopBarActions(
      <button
        type="button"
        onClick={() => navigate('/extraction/tasks')}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
        style={{ color: 'var(--text-2)' }}
      >
        <ArrowLeft size={12} /> {t('extractionTaskCreate.action.back', '返回列表')}
      </button>,
    )
    return () => setTopBarActions(null)
  }, [setBreadcrumbs, setTopBarActions, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskName || !datasetId) return
    const payload: CreateTaskPayload = {
      task_name: taskName,
      dataset_id: datasetId,
      task_type: taskType,
      ...(taskType === 'scheduled' && cronExpression
        ? { schedule_config: { cron_expression: cronExpression, timezone: 'Asia/Shanghai' } }
        : {}),
    }
    try {
      const result = await createTask.mutateAsync(payload)
      setCreatedId(result.id)
      setDone(true)
    } catch {
      // error displayed inline
    }
  }

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
          >
            <Check size={28} />
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
            {t('extractionTaskCreate.done.title', '创建成功')}
          </div>
          <p className="max-w-sm text-xs" style={{ color: 'var(--text-3)' }}>
            {t('extractionTaskCreate.done.desc.prefix', '任务')} <strong>{taskName}</strong> {t('extractionTaskCreate.done.desc.suffix', '已创建。')}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/extraction/tasks')}
              className="rounded-md border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
            >
              {t('extractionTaskCreate.action.back', '返回列表')}
            </button>
            {createdId != null && (
              <button
                type="button"
                onClick={() => navigate(`/extraction/tasks/${createdId}`)}
                className="rounded-md px-3 py-2 text-xs font-medium"
                style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
              >
                {t('extractionTaskCreate.action.viewTask', '查看任务')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Workflow size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-1)' }}>
            {t('extractionTaskCreate.title', '新建提取任务')}
          </span>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
          <div className="mx-auto max-w-xl space-y-5 p-6">

            <Field label={t('extractionTaskCreate.field.taskName', '任务名称')} required>
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                required
                placeholder={t('extractionTaskCreate.placeholder.taskName', '如 dwd_order 日增量提取')}
                style={inputStyle}
              />
            </Field>

            <Field label={t('extractionTaskCreate.field.dataset', '目标数据集')} required>
              <select
                value={datasetId ?? ''}
                onChange={(e) => setDatasetId(Number(e.target.value))}
                required
                style={inputStyle}
              >
                <option value="">{t('extractionTaskCreate.placeholder.dataset', '请选择数据集…')}</option>
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.dataset_name} ({ds.dataset_code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('extractionTaskCreate.field.triggerType', '触发类型')}>
              <div className="flex flex-wrap gap-2">
                {taskTypeOptions().map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <input
                      type="radio"
                      name="task_type"
                      value={o.value}
                      checked={taskType === o.value}
                      onChange={() => setTaskType(o.value)}
                    />
                    <span style={{ color: 'var(--text-2)' }}>{o.label}</span>
                  </label>
                ))}
              </div>
            </Field>

            {taskType === 'scheduled' && (
              <Field label={t('extractionTaskCreate.field.cron', '调度 Cron 表达式')}>
                <div className="space-y-2">
                  <input
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder={t('extractionTaskCreate.placeholder.cron', '如 0 0 * * *')}
                    style={inputStyle}
                  />
                  <div className="flex flex-wrap gap-2">
                    {cronPresets().map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setCronExpression(p.value)}
                        className="rounded border px-2 py-0.5 text-[11px]"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            )}

            <Field label={t('extractionTaskCreate.field.active', '启用')}>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span style={{ color: 'var(--text-2)' }}>
                  {t('extractionTaskCreate.active.hint', '创建后立即启用')}
                </span>
              </label>
            </Field>

            {createTask.isError && (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                {createTask.error instanceof Error
                  ? createTask.error.message
                  : t('extractionTaskCreate.error.createFailed', '创建失败，请重试')}
              </p>
            )}

            <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => navigate('/extraction/tasks')}
                className="rounded-md border px-4 py-2 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                {t('extractionTaskCreate.action.cancel', '取消')}
              </button>
              <button
                type="submit"
                disabled={createTask.isPending || !taskName || !datasetId}
                className="rounded-md px-4 py-2 text-xs font-medium"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  opacity: createTask.isPending || !taskName || !datasetId ? 0.6 : 1,
                }}
              >
                {createTask.isPending
                  ? t('extractionTaskCreate.action.creating', '创建中…')
                  : t('extractionTaskCreate.action.submit', '创建任务')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-1)',
  outline: 'none',
}

function Field({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
        {label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
    </div>
  )
}
