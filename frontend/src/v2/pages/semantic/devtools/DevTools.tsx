// frontend/src/v2/pages/semantic/devtools/DevTools.tsx
//
// 语义 DevTools 控制台。三个 Tab：
//   - 诊断控制台：B-back-9 同步诊断 (input_kind: nl|sql|yaml + input_text)，
//                 结果会落库到 semantic_diagnose_runs。
//   - SQL 预览：调用 /semantic/compile，展示生成的 SQL。
//   - 诊断历史：B-back-9 历史列表 + 详情侧栏。
//
// 接口：
//   POST /api/v1/semantic/diagnose
//   GET  /api/v1/semantic/diagnose/runs
//   GET  /api/v1/semantic/diagnose/runs/:id
//   POST /api/v1/semantic/compile

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Play, RotateCcw, Terminal, Clock, X } from 'lucide-react'
import { Button, Card, CardBody, CardHead, Chip, Tabs, Tab } from '@v2/components/ui'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'
import { useCubeList, useCompileDsl } from '@v2/hooks/semantic'
import {
  useDiagnoseRun,
  useDiagnoseRuns,
  useRunDiagnose,
} from '@v2/hooks/diagnose'
import type { DiagnoseInputKind, DiagnoseRun } from '@v2/api/diagnose'

// Monaco — lazy 加载
const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
)

// ── Component ─────────────────────────────────────────────────────────────

export default function DevTools() {
  const { setBreadcrumbs } = useAppShell()
  const [tab, setTab] = useState<'diagnose' | 'compile' | 'history'>('diagnose')

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.devtools', '开发者工具')])
  }, [setBreadcrumbs])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex shrink-0 items-center gap-1 border-b px-5 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <Tabs value={tab} onChange={(v) => setTab(v as typeof tab)}>
          <Tab value="diagnose">
            <Terminal size={11} className="mr-1 inline-block" />
            {t('devtools.tab.diagnose', '诊断控制台')}
          </Tab>
          <Tab value="compile">
            <Play size={11} className="mr-1 inline-block" />
            {t('devtools.tab.compile', 'SQL 预览')}
          </Tab>
          <Tab value="history">
            <Clock size={11} className="mr-1 inline-block" />
            {t('devtools.tab.history', '诊断历史')}
          </Tab>
        </Tabs>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'diagnose' && <DiagnosePanel />}
        {tab === 'compile' && <CompilePanel />}
        {tab === 'history' && <HistoryPanel />}
      </div>
    </div>
  )
}

// ── DiagnosePanel (B-back-9) ──────────────────────────────────────────────

function kindPlaceholder(): Record<DiagnoseInputKind, string> {
  return {
    sql: 'SELECT user_id, SUM(amount) AS total\nFROM orders\nGROUP BY 1',
    yaml: 'name: my_cube\ndimensions:\n  - name: id\n    sql: "id"\nmeasures:\n  - name: total\n    type: sum\n    sql: "amount"',
    nl: t('devtools.placeholder.nl', '过去 30 天内每个区域的活跃用户数'),
  }
}

function DiagnosePanel() {
  const placeholders = kindPlaceholder()
  const [kind, setKind] = useState<DiagnoseInputKind>('sql')
  const [text, setText] = useState<string>(placeholders.sql)
  const [result, setResult] = useState<DiagnoseRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runDiag = useRunDiagnose()

  const switchKind = (k: DiagnoseInputKind) => {
    setKind(k)
    if (!text || text === placeholders.sql || text === placeholders.yaml || text === placeholders.nl) {
      setText(placeholders[k])
    }
  }

  const reset = () => {
    setText(placeholders[kind])
    setResult(null)
    setError(null)
  }

  const handleRun = async () => {
    if (!text.trim()) {
      setError(t('devtools.diagnose.empty', '请输入待诊断内容'))
      return
    }
    setError(null)
    setResult(null)
    try {
      const r = await runDiag.mutateAsync({ input_kind: kind, input_text: text })
      setResult(r)
    } catch (e: unknown) {
      const err = e as { message?: string }
      setError(err?.message ?? t('error.loadFailed', '诊断失败'))
    }
  }

  const monacoLang = kind === 'yaml' ? 'yaml' : kind === 'sql' ? 'sql' : 'plaintext'

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto scroll-thin p-5">
      <Card>
        <CardHead>
          <span>{t('devtools.diagnose.title', '诊断输入')}</span>
          <div className="ml-auto flex items-center gap-2">
            {(['sql', 'yaml', 'nl'] as DiagnoseInputKind[]).map((k) => (
              <KindChip key={k} active={kind === k} onClick={() => switchKind(k)}>
                {k.toUpperCase()}
              </KindChip>
            ))}
            <Button size="sm" variant="ghost" onClick={reset} disabled={runDiag.isPending}>
              <RotateCcw size={11} /> {t('action.reset', '重置')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleRun}
              loading={runDiag.isPending}
            >
              <Play size={11} />{' '}
              {runDiag.isPending
                ? t('devtools.diagnose.running', '诊断中…')
                : t('devtools.diagnose.run', '运行诊断')}
            </Button>
          </div>
        </CardHead>
        <CardBody className="!p-0">
          <div
            className="flex h-[280px] flex-col overflow-hidden"
            style={{ background: 'var(--bg-surface-2)' }}
          >
            <Suspense fallback={<div className="p-4 text-sm text-3">{t('loading', '加载中…')}</div>}>
              <MonacoEditor
                height="100%"
                language={monacoLang}
                value={text}
                onChange={(v) => setText(v ?? '')}
                options={{ minimap: { enabled: false }, fontSize: 12, wordWrap: 'on' }}
                theme="vs-dark"
              />
            </Suspense>
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody className="text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </CardBody>
        </Card>
      )}

      {result && <DiagnoseResultCard run={result} />}
    </div>
  )
}

function KindChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-0.5 text-xs font-medium transition"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-hover)',
        color: active ? 'white' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  )
}

function DiagnoseResultCard({ run }: { run: DiagnoseRun }) {
  const status = computeStatus(run)
  return (
    <Card>
      <CardHead>
        <span>{t('devtools.diagnose.result', '诊断结果')}</span>
        <div className="ml-auto flex items-center gap-2">
          <StatusChip status={status} />
          <span className="text-xs text-3">
            {t('devtools.diagnose.elapsed', '耗时')}：{run.duration_ms ?? '—'} ms
          </span>
          <span className="text-xs text-3">
            {t('devtools.diagnose.runId', 'Run')} #{run.id}
          </span>
        </div>
      </CardHead>
      <CardBody>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t('devtools.diagnose.parse', '解析')} ok={run.parse_ok} />
          <Stat label={t('devtools.diagnose.validate', '校验')} ok={run.validate_ok} />
        </div>
        {run.error && (
          <pre
            className="mt-3 max-h-40 overflow-auto rounded p-3 text-xs"
            style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}
          >
            {run.error}
          </pre>
        )}
        {run.sql_text && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-3">{t('devtools.diagnose.sqlOut', '生成 SQL')}</div>
            <pre
              className="max-h-60 overflow-auto rounded p-3 text-xs"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
            >
              {run.sql_text}
            </pre>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Stat({ label, ok }: { label: string; ok: boolean | null }) {
  let tone: 'success' | 'danger' | 'neutral' = 'neutral'
  let txt = '—'
  if (ok === true) {
    tone = 'success'
    txt = t('devtools.diagnose.passed', '通过')
  } else if (ok === false) {
    tone = 'danger'
    txt = t('devtools.diagnose.failed', '失败')
  }
  return (
    <div
      className="flex items-center justify-between rounded px-3 py-2"
      style={{ background: 'var(--bg-surface-2)' }}
    >
      <span className="text-sm text-2">{label}</span>
      <Chip tone={tone}>{txt}</Chip>
    </div>
  )
}

function StatusChip({ status }: { status: 'ok' | 'error' | 'warning' }) {
  const tone = status === 'ok' ? 'success' : status === 'error' ? 'danger' : 'warning'
  const txt =
    status === 'ok'
      ? t('devtools.status.ok', '通过')
      : status === 'error'
        ? t('devtools.status.error', '失败')
        : t('devtools.status.warning', '警告')
  return <Chip tone={tone}>{txt}</Chip>
}

function computeStatus(run: DiagnoseRun): 'ok' | 'error' | 'warning' {
  if (run.error || run.parse_ok === false || run.validate_ok === false) return 'error'
  if (run.parse_ok === null || run.validate_ok === null) return 'warning'
  return 'ok'
}

// ── HistoryPanel (B-back-9) ───────────────────────────────────────────────

function HistoryPanel() {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const list = useDiagnoseRuns({ page, page_size: pageSize })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detail = useDiagnoseRun(selectedId ?? undefined)

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 列表 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
          <span className="text-sm text-2">
            {t('devtools.history.total', '共 {n} 条').replace('{n}', String(total))}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
            >
              <RotateCcw size={11} /> {t('action.refresh', '刷新')}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto scroll-thin">
          {list.isLoading ? (
            <div className="p-6 text-sm text-3">{t('loading', '加载中…')}</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-sm text-3">
              {t('devtools.history.empty', '暂无诊断记录')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead
                className="sticky top-0 text-xs"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-3)' }}
              >
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-4 py-2 text-left font-medium">#ID</th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('devtools.history.col.kind', '类型')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('devtools.history.col.status', '状态')}
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    {t('devtools.history.col.input', '输入预览')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('devtools.history.col.elapsed', '耗时')}
                  </th>
                  <th className="px-4 py-2 text-right font-medium">
                    {t('devtools.history.col.created', '时间')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <RunRow
                    key={r.id}
                    run={r}
                    selected={selectedId === r.id}
                    onClick={() => setSelectedId(r.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {pageCount > 1 && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              {t('pagination.prev', '上一页')}
            </Button>
            <span className="text-xs text-3">
              {page} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
            >
              {t('pagination.next', '下一页')}
            </Button>
          </div>
        )}
      </div>

      {/* 详情侧栏 */}
      {selectedId !== null && (
        <aside
          className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b px-4 py-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-sm font-medium text-1">
              {t('devtools.history.detail.title', '诊断详情')} #{selectedId}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded p-1 transition hover:bg-hover"
              style={{ color: 'var(--text-3)' }}
              aria-label={t('action.close', '关闭')}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-auto scroll-thin p-4">
            {detail.isLoading ? (
              <div className="text-sm text-3">{t('loading', '加载中…')}</div>
            ) : detail.data ? (
              <DetailContent run={detail.data} />
            ) : (
              <div className="text-sm text-3">{t('devtools.history.detail.notFound', '未找到记录')}</div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function RunRow({
  run,
  selected,
  onClick,
}: {
  run: DiagnoseRun
  selected: boolean
  onClick: () => void
}) {
  const status = computeStatus(run)
  const preview = useMemo(
    () => (run.input_text || '').replace(/\s+/g, ' ').slice(0, 80),
    [run.input_text],
  )
  return (
    <tr
      className="cursor-pointer border-b transition hover:bg-hover"
      style={{
        borderColor: 'var(--border)',
        background: selected ? 'var(--accent-soft)' : undefined,
      }}
      onClick={onClick}
    >
      <td className="px-4 py-2 font-mono text-xs text-2">#{run.id}</td>
      <td className="px-4 py-2">
        <Chip tone="neutral">{run.input_kind.toUpperCase()}</Chip>
      </td>
      <td className="px-4 py-2">
        <StatusChip status={status} />
      </td>
      <td className="px-4 py-2 font-mono text-xs text-2">
        <span title={run.input_text || ''}>{preview || '—'}</span>
      </td>
      <td className="px-4 py-2 text-right text-xs text-3">
        {run.duration_ms ?? '—'} ms
      </td>
      <td className="px-4 py-2 text-right text-xs text-3">{formatDt(run.created_at)}</td>
    </tr>
  )
}

function DetailContent({ run }: { run: DiagnoseRun }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label={t('devtools.history.detail.kind', '类型')}>
          <Chip tone="neutral">{run.input_kind.toUpperCase()}</Chip>
        </Field>
        <Field label={t('devtools.history.detail.status', '状态')}>
          <StatusChip status={computeStatus(run)} />
        </Field>
        <Field label={t('devtools.history.detail.parse', '解析')}>
          {boolText(run.parse_ok)}
        </Field>
        <Field label={t('devtools.history.detail.validate', '校验')}>
          {boolText(run.validate_ok)}
        </Field>
        <Field label={t('devtools.history.detail.elapsed', '耗时')}>
          <span className="text-2">{run.duration_ms ?? '—'} ms</span>
        </Field>
        <Field label={t('devtools.history.detail.created', '时间')}>
          <span className="text-2">{formatDt(run.created_at)}</span>
        </Field>
      </div>

      <div>
        <div className="mb-1 text-xs text-3">
          {t('devtools.history.detail.input', '输入')}
        </div>
        <pre
          className="max-h-60 overflow-auto rounded p-3 text-xs"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
        >
          {run.input_text || '—'}
        </pre>
      </div>

      {run.sql_text && (
        <div>
          <div className="mb-1 text-xs text-3">
            {t('devtools.history.detail.sql', '生成 SQL')}
          </div>
          <pre
            className="max-h-60 overflow-auto rounded p-3 text-xs"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
          >
            {run.sql_text}
          </pre>
        </div>
      )}

      {run.error && (
        <div>
          <div className="mb-1 text-xs" style={{ color: 'var(--danger)' }}>
            {t('devtools.history.detail.error', '错误')}
          </div>
          <pre
            className="max-h-60 overflow-auto rounded p-3 text-xs"
            style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}
          >
            {run.error}
          </pre>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between rounded px-2 py-1.5"
      style={{ background: 'var(--bg-surface-2)' }}
    >
      <span className="text-3">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function boolText(v: boolean | null): React.ReactNode {
  if (v === true) return <Chip tone="success">{t('common.yes', '是')}</Chip>
  if (v === false) return <Chip tone="danger">{t('common.no', '否')}</Chip>
  return <span className="text-3">—</span>
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ── CompilePanel ──────────────────────────────────────────────────────────

function CompilePanel() {
  const cubeQuery = useCubeList({})
  const cubes = cubeQuery.data?.cubes ?? []
  const compileDsl = useCompileDsl()

  const [selectedCube, setSelectedCube] = useState('')
  const [query, setQuery] = useState('{\n  "measures": [],\n  "dimensions": []\n}')
  const [output, setOutput] = useState<string>('')

  const handleCompile = async () => {
    if (!selectedCube) return
    try {
      JSON.parse(query)
    } catch {
      setOutput(t('devtools.compile.jsonError', '无效的 JSON 查询'))
      return
    }
    const res = await compileDsl.mutateAsync(selectedCube)
    setOutput(res.sql ?? t('devtools.compile.noSql', '未返回 SQL'))
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
      <div className="flex items-center gap-3">
        <select
          className="rounded border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
          value={selectedCube}
          onChange={(e) => setSelectedCube(e.target.value)}
          aria-label={t('devtools.compile.selectCube', '选择 Cube')}
        >
          <option value="">{t('devtools.compile.selectCubeOption', '选择 Cube…')}</option>
          {cubes.map((c) => (
            <option key={c.name} value={c.name}>
              {c.title || c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="primary"
          onClick={handleCompile}
          loading={compileDsl.isPending}
          disabled={!selectedCube}
        >
          <Play size={11} /> {t('devtools.compile.run', '生成 SQL')}
        </Button>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
          <div className="px-3 py-1.5 text-xs text-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            {t('devtools.compile.queryLabel', 'Cube Query（JSON）')}
          </div>
          <Suspense fallback={<div className="p-4 text-sm text-3">{t('loading', '加载中…')}</div>}>
            <MonacoEditor
              height="100%"
              defaultLanguage="json"
              value={query}
              onChange={(v) => setQuery(v ?? '')}
              options={{ minimap: { enabled: false }, fontSize: 12 }}
              theme="vs-dark"
            />
          </Suspense>
        </div>

        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
          <div className="px-3 py-1.5 text-xs text-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            {t('devtools.compile.outputLabel', 'Generated SQL')}
          </div>
          <Suspense fallback={<div className="p-4 text-sm text-3">{t('loading', '加载中…')}</div>}>
            <MonacoEditor
              height="100%"
              defaultLanguage="sql"
              value={output}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
              theme="vs-dark"
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
