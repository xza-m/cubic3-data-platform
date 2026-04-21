// frontend/src/v2/pages/queries/QueriesScheduledDetail.tsx
//
// 调度查询详情（B-back-8）。L3 页面：
//   - 顶部操作条：返回 / 编辑 / 启用-禁用切换 / 立即触发 / 删除
//   - Tab：概览（基本信息 + cron 下次预览）/ SQL（monaco 只读）/ 执行历史
//
// 后端契约：app/interfaces/api/v1/scheduled_queries.py

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Edit2,
  PlayCircle,
  PauseCircle,
  Play,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  useScheduledQuery,
  useScheduledQueryRuns,
  useEnableScheduledQuery,
  useDisableScheduledQuery,
  useTriggerScheduledQuery,
  useUpdateScheduledQuery,
  useDeleteScheduledQuery,
  useDatasourcesForConsole,
} from '@v2/hooks/queries'
import { fmtDateTime, fmtNum, fmtRelative } from '@v2/lib/format'
import { CRON_PRESETS, nextRuns, parseCron } from '@v2/lib/cron'
import { Tabs, Tab, useToast } from '@v2/components/ui'
import type { ScheduledQuery } from '@v2/api/queries'

type TabKey = 'overview' | 'sql' | 'runs'

export default function QueriesScheduledDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const toast = useToast()

  const [tab, setTab] = useState<TabKey>('overview')
  const [editing, setEditing] = useState(false)

  const { data: row, isLoading, isError } = useScheduledQuery(numericId)

  const enableMut = useEnableScheduledQuery()
  const disableMut = useDisableScheduledQuery()
  const triggerMut = useTriggerScheduledQuery()
  const updateMut = useUpdateScheduledQuery()
  const deleteMut = useDeleteScheduledQuery()

  async function handleToggle() {
    if (!row) return
    try {
      if (row.enabled) {
        await disableMut.mutateAsync(row.id)
        toast.show({ tone: 'success', title: `${row.name} 已禁用` })
      } else {
        await enableMut.mutateAsync(row.id)
        toast.show({ tone: 'success', title: `${row.name} 已启用` })
      }
    } catch (e) {
      toast.show({ tone: 'danger', title: '操作失败', description: String(e) })
    }
  }

  async function handleTrigger() {
    if (!row) return
    try {
      await triggerMut.mutateAsync(row.id)
      toast.show({
        tone: 'success',
        title: '已触发',
        description: '执行结果将出现在执行历史中',
      })
      setTab('runs')
    } catch (e) {
      toast.show({ tone: 'danger', title: '触发失败', description: String(e) })
    }
  }

  async function handleDelete() {
    if (!row) return
    if (!window.confirm(`删除调度「${row.name}」？此操作将解除关联 APScheduler job。`)) return
    try {
      await deleteMut.mutateAsync(row.id)
      toast.show({ tone: 'success', title: `${row.name} 已删除` })
      navigate('/queries/scheduled')
    } catch (e) {
      toast.show({ tone: 'danger', title: '删除失败', description: String(e) })
    }
  }

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        非法的调度查询 ID
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className="flex flex-1 items-center justify-center text-xs"
        style={{ color: 'var(--text-3)' }}
      >
        加载中…
      </div>
    )
  }

  if (isError || !row) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-red-500 dark:text-red-400">
        未找到调度查询 #{numericId}
      </div>
    )
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
          <ArrowLeft size={12} /> 返回列表
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          <Edit2 size={12} /> {editing ? '取消编辑' : '编辑'}
        </button>
        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={enableMut.isPending || disableMut.isPending}
          className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          {row.enabled ? (
            <>
              <PauseCircle size={12} style={{ color: 'var(--success)' }} /> 禁用
            </>
          ) : (
            <>
              <PlayCircle size={12} /> 启用
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => void handleTrigger()}
          disabled={triggerMut.isPending || !row.enabled}
          className="flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          title={row.enabled ? '立即手动触发一次' : '禁用状态下无法触发'}
        >
          <Play size={12} /> 立即触发
        </button>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleteMut.isPending}
          className="ml-auto flex items-center gap-1.5 rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <Trash2 size={12} /> 删除
        </button>
      </div>

      <header
        className="border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
            style={{ background: row.enabled ? 'var(--accent)' : 'var(--text-3)' }}
          >
            SQ
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: 'var(--text-1)' }}
            >
              <span className="truncate">{row.name}</span>
              {!row.enabled && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-normal"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-3)' }}
                >
                  已禁用
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              <code>{row.cron}</code> ({row.timezone}) · 下次{' '}
              {row.next_run_at ? fmtDateTime(row.next_run_at) : '—'} · 更新{' '}
              {fmtRelative(row.updated_at)}
            </div>
          </div>
        </div>
      </header>

      <Tabs value={tab} onChange={(v) => setTab(v as TabKey)} className="px-4">
        <Tab value="overview">概览</Tab>
        <Tab value="sql">SQL</Tab>
        <Tab value="runs">执行历史</Tab>
      </Tabs>

      <div className="flex-1 overflow-auto">
        {editing ? (
          <ScheduledQueryEditForm
            row={row}
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              await updateMut.mutateAsync({ id: row.id, payload })
              toast.show({ tone: 'success', title: '已保存' })
              setEditing(false)
            }}
            saving={updateMut.isPending}
          />
        ) : tab === 'overview' ? (
          <OverviewTab row={row} />
        ) : tab === 'sql' ? (
          <SqlTab row={row} />
        ) : (
          <RunsTab queryId={row.id} />
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Overview
// ──────────────────────────────────────────────────────────────────────────

function OverviewTab({ row }: { row: ScheduledQuery }) {
  const previewRuns = useMemo(() => nextRuns(row.cron, 5), [row.cron])
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <Card title="基本信息">
        <dl className="space-y-2 text-xs">
          <CtxPair label="ID" value={`#${row.id}`} />
          <CtxPair label="名称" value={row.name} />
          <CtxPair label="说明" value={row.description || <Muted>—</Muted>} />
          <CtxPair label="数据源" value={`#${row.datasource_id}`} />
          <CtxPair label="负责人" value={String(row.owner_id)} />
          <CtxPair label="创建" value={fmtDateTime(row.created_at)} />
          <CtxPair label="更新" value={fmtDateTime(row.updated_at)} />
        </dl>
      </Card>

      <Card title="调度">
        <dl className="space-y-2 text-xs">
          <CtxPair label="Cron" value={<code>{row.cron}</code>} />
          <CtxPair label="时区" value={row.timezone} />
          <CtxPair
            label="状态"
            value={
              row.enabled ? (
                <span style={{ color: 'var(--success)' }}>已启用</span>
              ) : (
                <Muted>已禁用</Muted>
              )
            }
          />
          <CtxPair label="下次触发" value={fmtDateTime(row.next_run_at)} />
          <CtxPair label="上次执行" value={fmtRelative(row.last_run_at)} />
          <CtxPair
            label="上次状态"
            value={row.last_status ? <code>{row.last_status}</code> : <Muted>—</Muted>}
          />
        </dl>

        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div
            className="mb-2 text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            未来 5 次触发预览
          </div>
          {previewRuns.length === 0 ? (
            <Muted>cron 表达式不可达</Muted>
          ) : (
            <ul className="space-y-1 text-xs" style={{ color: 'var(--text-2)' }}>
              {previewRuns.map((d, i) => (
                <li key={i}>
                  {i + 1}. {fmtDateTime(d)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs" style={{ color: 'var(--text-4)' }}>
            * 前端预览基于浏览器本地时区；权威以后端 APScheduler 为准
          </p>
        </div>
      </Card>
    </div>
  )
}

function SqlTab({ row }: { row: ScheduledQuery }) {
  return (
    <div className="h-full p-4">
      <div
        className="h-full overflow-hidden rounded border"
        style={{ borderColor: 'var(--border)' }}
      >
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={row.sql}
          options={{
            readOnly: true,
            fontSize: 12,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Runs history tab
// ──────────────────────────────────────────────────────────────────────────

function RunsTab({ queryId }: { queryId: number }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useScheduledQueryRuns(queryId, {
    page,
    page_size: 20,
  })
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pageSize = data?.page_size ?? 20

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-4 py-2 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        <span>共 {fmtNum(total)} 次执行</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 hover:bg-[color:var(--bg-hover)]"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCw size={11} /> 刷新
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 text-xs" style={{ color: 'var(--text-3)' }}>
            加载中…
          </div>
        ) : isError ? (
          <div className="p-4 text-xs text-red-500">加载失败</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-xs" style={{ color: 'var(--text-3)' }}>
            尚无执行记录
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead
              className="sticky top-0"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
            >
              <tr>
                <Th>状态</Th>
                <Th>开始</Th>
                <Th>结束</Th>
                <Th>耗时</Th>
                <Th>行数</Th>
                <Th>错误</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const dur =
                  r.started_at && r.finished_at
                    ? Math.max(
                        0,
                        new Date(r.finished_at).getTime() - new Date(r.started_at).getTime(),
                      )
                    : null
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <Td>
                      <StatusChip status={r.status} />
                    </Td>
                    <Td>{fmtDateTime(r.started_at)}</Td>
                    <Td>{r.finished_at ? fmtDateTime(r.finished_at) : '—'}</Td>
                    <Td>{dur != null ? `${dur} ms` : '—'}</Td>
                    <Td>
                      {r.rows_returned != null ? fmtNum(r.rows_returned) : '—'}
                    </Td>
                    <Td>
                      {r.error ? (
                        <code className="text-red-500">
                          {r.error.length > 80 ? `${r.error.slice(0, 80)}…` : r.error}
                        </code>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > pageSize && (
        <div
          className="flex items-center justify-between border-t px-4 py-2 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
        >
          <span>
            {fmtNum(total)} 条 · 每页 {pageSize}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border px-2 py-1 disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              上一页
            </button>
            <span>
              {page} / {Math.ceil(total / pageSize)}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-2 py-1 disabled:opacity-40"
              style={{ borderColor: 'var(--border)' }}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Edit form (内联)
// ──────────────────────────────────────────────────────────────────────────

function ScheduledQueryEditForm({
  row,
  onCancel,
  onSubmit,
  saving,
}: {
  row: ScheduledQuery
  onCancel: () => void
  onSubmit: (payload: {
    name: string
    description: string | null
    sql: string
    datasource_id: number
    cron: string
    timezone: string
  }) => Promise<void>
  saving: boolean
}) {
  const [form, setForm] = useState({
    name: row.name,
    description: row.description ?? '',
    sql: row.sql,
    datasource_id: String(row.datasource_id),
    cron: row.cron,
    timezone: row.timezone,
  })

  const cronCheck = useMemo(() => parseCron(form.cron), [form.cron])
  const previewRuns = useMemo(
    () => (cronCheck.ok ? nextRuns(form.cron, 3) : []),
    [form.cron, cronCheck.ok],
  )

  const { data: dsList } = useDatasourcesForConsole()

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!cronCheck.ok) return
        await onSubmit({
          name: form.name.trim(),
          description: form.description.trim() || null,
          sql: form.sql,
          datasource_id: Number(form.datasource_id),
          cron: form.cron.trim(),
          timezone: form.timezone.trim(),
        })
      }}
    >
      <Field label="名称">
        <input
          required
          maxLength={128}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>

      <Field label="描述">
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="数据源">
          <select
            required
            value={form.datasource_id}
            onChange={(e) => setForm({ ...form, datasource_id: e.target.value })}
            className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          >
            {dsList?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (#{d.id})
              </option>
            ))}
          </select>
        </Field>

        <Field label="时区">
          <input
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="w-full rounded border bg-transparent px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          />
        </Field>
      </div>

      <Field label="Cron 表达式">
        <input
          required
          value={form.cron}
          onChange={(e) => setForm({ ...form, cron: e.target.value })}
          placeholder="例如 0 8 * * 1-5"
          className="w-full rounded border bg-transparent px-3 py-1.5 font-mono text-xs"
          style={{
            borderColor: cronCheck.ok ? 'var(--border)' : 'var(--danger)',
            color: 'var(--text-1)',
          }}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {CRON_PRESETS.map((p) => (
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
            前 3 次：
            {previewRuns.length > 0
              ? previewRuns.map((d, i) => <span key={i}> {fmtDateTime(d)}{i < previewRuns.length - 1 ? ' · ' : ''}</span>)
              : '不可达'}
          </div>
        )}
      </Field>

      <Field label="SQL">
        <div
          className="overflow-hidden rounded border"
          style={{ borderColor: 'var(--border)' }}
        >
          <Editor
            height="240px"
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

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !cronCheck.ok}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-3 py-1.5 text-xs hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          取消
        </button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg border"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <header
        className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide"
        style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function CtxPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="min-w-0 truncate text-right" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--text-4)' }}>{children}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div
        className="text-xs font-medium"
        style={{ color: 'var(--text-2)' }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      className="border-b px-3 py-2 text-left font-medium"
      style={{ borderColor: 'var(--border)' }}
    >
      {children}
    </th>
  )
}

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>
      {children}
    </td>
  )
}

function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span style={{ color: 'var(--text-4)' }}>—</span>
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    success: { bg: 'var(--success-soft)', fg: 'var(--success)', label: '成功' },
    failed: { bg: 'var(--danger-soft)', fg: 'var(--danger)', label: '失败' },
    running: { bg: 'var(--accent-soft)', fg: 'var(--accent-text)', label: '运行中' },
    timeout: { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: '超时' },
  }
  const tone = map[status] ?? { bg: 'var(--bg-hover)', fg: 'var(--text-2)', label: status }
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-xs"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  )
}
