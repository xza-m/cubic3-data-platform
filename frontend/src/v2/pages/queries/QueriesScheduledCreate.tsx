// frontend/src/v2/pages/queries/QueriesScheduledCreate.tsx
//
// 新建调度查询（B-back-8）。
// 提交 POST /api/v1/queries/scheduled，成功后跳转详情页。

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  useCreateScheduledQuery,
  useDatasourcesForConsole,
} from '@v2/hooks/queries'
import { cronPresets, nextRuns, parseCron } from '@v2/lib/cron'
import { fmtDateTime } from '@v2/lib/format'
import { useToast } from '@v2/components/ui'
import { t } from '@v2/i18n'

export default function QueriesScheduledCreate() {
  const navigate = useNavigate()
  const toast = useToast()

  const [form, setForm] = useState({
    name: '',
    description: '',
    sql: 'SELECT 1',
    datasource_id: '',
    cron: '0 8 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
  })

  const cronCheck = useMemo(() => parseCron(form.cron), [form.cron])
  const previewRuns = useMemo(
    () => (cronCheck.ok ? nextRuns(form.cron, 3) : []),
    [form.cron, cronCheck.ok],
  )

  const { data: dsList, isLoading: dsLoading } = useDatasourcesForConsole()
  const createMut = useCreateScheduledQuery()

  const valid =
    form.name.trim().length > 0 &&
    form.sql.trim().length > 0 &&
    form.datasource_id !== '' &&
    cronCheck.ok

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      const created = await createMut.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || null,
        sql: form.sql,
        datasource_id: Number(form.datasource_id),
        cron: form.cron.trim(),
        timezone: form.timezone.trim(),
        enabled: form.enabled,
      })
      toast.show({
        tone: 'success',
        title: t('queriesScheduledCreate.toast.created', '已创建：{name}', { name: created.name }),
      })
      navigate(`/queries/scheduled/${created.id}`)
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('queriesScheduledCreate.toast.failed', '创建失败'),
        description: String(err),
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-2"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={() => navigate('/queries/scheduled')}
          className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> {t('queriesScheduledCreate.action.back', '返回列表')}
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('queriesScheduledCreate.title', '新建调度查询')}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-auto p-4">
        <Field label={t('queriesScheduledCreate.field.name', '名称')}>
          <input
            required
            maxLength={128}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('queriesScheduledCreate.placeholder.name', '例如 每日营收快照')}
            className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
        </Field>

        <Field label={t('queriesScheduledCreate.field.description', '描述')}>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('queriesScheduledCreate.field.datasource', '数据源')}>
            <select
              required
              disabled={dsLoading}
              value={form.datasource_id}
              onChange={(e) => setForm({ ...form, datasource_id: e.target.value })}
              className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            >
              <option value="">
                {dsLoading
                  ? t('queriesScheduledCreate.datasource.loading', '加载中…')
                  : t('queriesScheduledCreate.datasource.pick', '选择数据源…')}
              </option>
              {dsList?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (#{d.id})
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('queriesScheduledCreate.field.timezone', '时区')}>
            <input
              required
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            />
          </Field>
        </div>

        <Field label={t('queriesScheduledCreate.field.cron', 'Cron 表达式')}>
          <input
            required
            value={form.cron}
            onChange={(e) => setForm({ ...form, cron: e.target.value })}
            placeholder={t('queriesScheduledCreate.placeholder.cron', '例如 0 8 * * 1-5')}
            className="w-full rounded border bg-transparent px-3 py-1.5 font-mono text-xs"
            style={{
              borderColor: cronCheck.ok ? 'var(--border)' : 'var(--danger)',
              color: 'var(--text-1)',
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {cronPresets().map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm({ ...form, cron: p.value })}
                className="rounded border px-2 py-0.5 text-xs hover:bg-[color:var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {!cronCheck.ok ? (
            <div className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              {cronCheck.error}
            </div>
          ) : (
            <div className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('queriesScheduledCreate.next.label', '前 3 次：')}
              {previewRuns.length > 0
                ? previewRuns
                    .map((d) => fmtDateTime(d))
                    .join(' · ')
                : t('queriesScheduledCreate.next.unreachable', '不可达')}
            </div>
          )}
        </Field>

        <Field label={t('queriesScheduledCreate.field.sql', 'SQL')}>
          <div
            className="overflow-hidden rounded border"
            style={{ borderColor: 'var(--border)' }}
          >
            <Editor
              height="280px"
              defaultLanguage="sql"
              value={form.sql}
              onChange={(v) => setForm({ ...form, sql: v ?? '' })}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </Field>

        <Field label={t('queriesScheduledCreate.field.enabled', '启用')}>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            {t('queriesScheduledCreate.enable.hint', '创建后立即启用并注册到 APScheduler')}
          </label>
        </Field>

        <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <button
            type="submit"
            disabled={!valid || createMut.isPending}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {createMut.isPending
              ? t('queriesScheduledCreate.action.creating', '创建中…')
              : t('queriesScheduledCreate.action.submit', '创建调度')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/queries/scheduled')}
            className="rounded border px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {t('queriesScheduledCreate.action.cancel', '取消')}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
      </div>
      {children}
    </div>
  )
}
