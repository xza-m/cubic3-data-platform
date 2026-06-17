// frontend/src/v2/pages/semantic/devtools/DevTools.tsx
//
// 语义 DevTools 控制台（Phase 3 运行闭环）。四个 Tab：
//   - 诊断控制台：B-back-9 同步诊断 (input_kind: nl|sql|yaml + input_text)，
//                 结果会落库到 semantic_diagnose_runs。
//   - SQL 预览：调用 /semantic/compile，展示生成的 SQL 与定义版本标识。
//   - 查询执行：调用 /semantic/query，展示标准证据包（SQL / 对象 / 结果样本 /
//               行数 / 耗时 / 错误分类 hint / definition_hash）。
//   - 诊断历史：B-back-9 历史列表 + 详情侧栏 + 一键回放。
//
// 深链：/semantic/workbench?tab=query&object=<cube>（详情页跳转预选）。
//
// 接口：
//   POST /api/v1/semantic/diagnose
//   GET  /api/v1/semantic/diagnose/runs
//   GET  /api/v1/semantic/diagnose/runs/:id
//   POST /api/v1/semantic/compile
//   POST /api/v1/semantic/query

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Play, RotateCcw, Terminal, Clock, Database, ShieldCheck, X } from 'lucide-react'
import { Button, Card, CardBody, CardHead, Chip, Input, Tabs, Tab, Textarea } from '@v2/components/ui'
import { RefreshButton } from '@v2/components/CommonControls'
import { useAppShell } from '@v2/layout/AppShell'
import { t } from '@v2/i18n'
import { useCubeList, useCompileDsl, useQueryDsl } from '@v2/hooks/semantic'
import {
  useDiagnoseRun,
  useDiagnoseRuns,
  useGovernanceAuditTraces,
  useRunDiagnose,
  useSemanticRuntimeHealth,
  useSemanticReleases,
} from '@v2/hooks/diagnose'
import { AppError } from '@v2/api/types'
import type { DiagnoseInputKind, DiagnoseRun } from '@v2/api/diagnose'
import type { SemanticQueryResult } from '@v2/api/semantic'

// Monaco — lazy 加载
const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
)

// ── Component ─────────────────────────────────────────────────────────────

type DevToolsTab = 'diagnose' | 'compile' | 'query' | 'history' | 'evidence'

const TAB_VALUES: DevToolsTab[] = ['diagnose', 'compile', 'query', 'history', 'evidence']

/** 历史回放载荷：HistoryPanel → DiagnosePanel 回填 */
export interface ReplayPayload {
  kind: DiagnoseInputKind
  text: string
  runId: number
}

export default function DevTools() {
  const { setBreadcrumbs } = useAppShell()
  const [searchParams, setSearchParams] = useSearchParams()
  const paramTab = searchParams.get('tab')
  const tab: DevToolsTab = TAB_VALUES.includes(paramTab as DevToolsTab)
    ? (paramTab as DevToolsTab)
    : 'diagnose'
  const presetObject = searchParams.get('object') ?? ''
  const [replay, setReplay] = useState<ReplayPayload | null>(null)

  const setTab = (next: DevToolsTab) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', next)
        return params
      },
      { replace: true },
    )
  }

  useEffect(() => {
    setBreadcrumbs([t('nav.semantic', '语义中心'), t('nav.devtools', '开发者工具')])
  }, [setBreadcrumbs])

  const handleReplay = (payload: ReplayPayload) => {
    setReplay(payload)
    setTab('diagnose')
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        className="flex shrink-0 items-center gap-1 border-b px-5 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <Tabs value={tab} onChange={(v) => setTab(v as DevToolsTab)}>
          <Tab value="diagnose">
            <Terminal size={11} className="mr-1 inline-block" />
            {t('devtools.tab.diagnose', '诊断控制台')}
          </Tab>
          <Tab value="compile">
            <Play size={11} className="mr-1 inline-block" />
            {t('devtools.tab.compile', 'SQL 预览')}
          </Tab>
          <Tab value="query">
            <Database size={11} className="mr-1 inline-block" />
            {t('devtools.tab.query', '查询执行')}
          </Tab>
          <Tab value="history">
            <Clock size={11} className="mr-1 inline-block" />
            {t('devtools.tab.history', '诊断历史')}
          </Tab>
          <Tab value="evidence">
            <ShieldCheck size={11} className="mr-1 inline-block" />
            {t('devtools.tab.evidence', '运行证据')}
          </Tab>
        </Tabs>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {tab === 'diagnose' && <DiagnosePanel replay={replay} />}
        {tab === 'compile' && <CompilePanel presetCube={presetObject} />}
        {tab === 'query' && <QueryPanel presetCube={presetObject} />}
        {tab === 'history' && <HistoryPanel onReplay={handleReplay} />}
        {tab === 'evidence' && <EvidencePanel />}
      </div>
    </div>
  )
}

function EvidencePanel() {
  const runtime = useSemanticRuntimeHealth()
  const [draftFilters, setDraftFilters] = useState({
    semantic_plan_id: '',
    sql_hash: '',
    principal_id: '',
    decision: '',
  })
  const [filters, setFilters] = useState(draftFilters)
  const audit = useGovernanceAuditTraces(cleanAuditFilters(filters))
  const releases = useSemanticReleases({ namespace: 'default', limit: 20 })
  const runtimeData = runtime.data
  const runtimeDetail = runtimeData?.runtime ?? {}
  const auditItems = audit.data?.items ?? []
  const releaseItems = releases.data?.items ?? []

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto scroll-thin p-5">
      <Card>
        <CardHead>
          <span>{t('devtools.evidence.runtime.title', 'Runtime 健康')}</span>
          <div className="ml-auto flex items-center gap-2">
            <Chip tone={runtimeTone(runtimeData?.status)}>{runtimeData?.status ?? 'loading'}</Chip>
            <Button size="sm" variant="ghost" onClick={() => void runtime.refetch()} disabled={runtime.isFetching}>
              <RotateCcw size={11} /> {t('action.refresh', '刷新')}
            </Button>
          </div>
        </CardHead>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-4">
            <EvidenceStat label="Manifest" value={String(runtimeDetail.manifest_status ?? '-')} />
            <EvidenceStat label="Assets" value={String(runtimeDetail.asset_count ?? 0)} />
            <EvidenceStat label="Bindings" value={String(runtimeDetail.binding_count ?? 0)} />
            <EvidenceStat label="Policies" value={String(runtimeDetail.policy_count ?? 0)} />
          </div>
          {runtimeDetail.error_code || runtimeDetail.reason ? (
            <div className="mt-3 rounded border px-3 py-2 text-xs text-danger" style={{ borderColor: 'var(--border)' }}>
              {String(runtimeDetail.error_code ?? runtimeDetail.reason)}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHead>
          <span>{t('devtools.evidence.audit.title', '审计追踪')}</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-3">
            {audit.isFetching
              ? t('common.loading', '加载中…')
              : t('devtools.evidence.audit.count', '{count} 条', { count: audit.data?.total ?? 0 })}
          </div>
        </CardHead>
        <CardBody>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              aria-label="semantic plan id"
              placeholder="semantic_plan_id"
              value={draftFilters.semantic_plan_id}
              onChange={(event) => setDraftFilters((current) => ({ ...current, semantic_plan_id: event.target.value }))}
            />
            <Input
              aria-label="sql hash"
              placeholder="sql_hash"
              value={draftFilters.sql_hash}
              onChange={(event) => setDraftFilters((current) => ({ ...current, sql_hash: event.target.value }))}
            />
            <Input
              aria-label="principal id"
              placeholder="principal_id"
              value={draftFilters.principal_id}
              onChange={(event) => setDraftFilters((current) => ({ ...current, principal_id: event.target.value }))}
            />
            <Input
              aria-label="decision"
              placeholder="decision"
              value={draftFilters.decision}
              onChange={(event) => setDraftFilters((current) => ({ ...current, decision: event.target.value }))}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraftFilters({ semantic_plan_id: '', sql_hash: '', principal_id: '', decision: '' })}>
              {t('action.reset', '重置')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setFilters(draftFilters)}>
              {t('action.search', '查询')}
            </Button>
          </div>

          <div className="mt-4 overflow-hidden rounded border" style={{ borderColor: 'var(--border)' }}>
            {auditItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-3">{t('devtools.evidence.audit.empty', '暂无审计记录')}</div>
            ) : (
              auditItems.slice(0, 50).map((item) => (
                <div key={String(item.id ?? item.trace_id ?? `${item.semantic_plan_id}-${item.sql_hash}`)} className="border-b px-3 py-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={auditTone(item.decision)}>{item.decision ?? '-'}</Chip>
                    <span className="font-mono text-[12px] text-1">{item.semantic_plan_id ?? item.sql_hash ?? item.id ?? '-'}</span>
                    <span className="text-[12px] text-3">{item.principal_id ?? '-'}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-3">
                    route: {item.route_type ?? '-'} · policy: {item.policy_name ?? '-'} · target: {item.target_name ?? '-'}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHead>
          <span>{t('devtools.evidence.releases.title', '发布版本')}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-3">{t('devtools.evidence.releases.count', '{count} 个 release', { count: releases.data?.total ?? 0 })}</span>
            <Button size="sm" variant="ghost" onClick={() => void releases.refetch()} disabled={releases.isFetching}>
              <RotateCcw size={11} /> {t('action.refresh', '刷新')}
            </Button>
          </div>
        </CardHead>
        <CardBody>
          <div className="overflow-hidden rounded border" style={{ borderColor: 'var(--border)' }}>
            {releaseItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-3">{t('devtools.evidence.releases.empty', '暂无发布版本')}</div>
            ) : (
              releaseItems.map((release) => (
                <div key={release.id} className="border-b px-3 py-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={releaseTone(release.status)}>{release.status}</Chip>
                    <span className="font-mono text-[12px] text-1">#{release.release_no}</span>
                    <span className="font-mono text-[12px] text-3">{release.id}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-3">
                    namespace: {release.namespace} · by: {release.published_by ?? '-'} · at: {release.published_at ?? release.created_at ?? '-'}
                  </div>
                  {release.status_reason ? <div className="mt-1 text-[11px] text-danger">{release.status_reason}</div> : null}
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function cleanAuditFilters(filters: Record<string, string>) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]))
}

function runtimeTone(status: string | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'healthy') return 'success'
  if (status === 'unhealthy') return 'danger'
  if (status === 'degraded') return 'warning'
  return 'neutral'
}

function auditTone(decision: string | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (decision === 'allow') return 'success'
  if (decision === 'approval_required' || decision === 'require_approval') return 'warning'
  if (decision === 'deny' || decision === 'blocked') return 'danger'
  return 'neutral'
}

function releaseTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'published') return 'success'
  if (status === 'deprecated' || status === 'superseded') return 'warning'
  if (status === 'revoked' || status === 'failed') return 'danger'
  return 'neutral'
}

function EvidenceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded px-3 py-2" style={{ background: 'var(--bg-surface-2)' }}>
      <div className="text-[11px] text-3">{label}</div>
      <div className="mt-1 break-words text-[14px] font-semibold text-1">{value}</div>
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

function DiagnosePanel({ replay }: { replay?: ReplayPayload | null }) {
  const placeholders = kindPlaceholder()
  const [kind, setKind] = useState<DiagnoseInputKind>(replay?.kind ?? 'sql')
  const [text, setText] = useState<string>(replay?.text ?? placeholders.sql)
  const [result, setResult] = useState<DiagnoseRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const runDiag = useRunDiagnose()

  // 历史回放：回填输入并提示来源 Run
  useEffect(() => {
    if (!replay) return
    setKind(replay.kind)
    setText(replay.text)
    setResult(null)
    setError(null)
  }, [replay])

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

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto scroll-thin p-5">
      <Card>
        <CardHead>
          <span>{t('devtools.diagnose.title', '诊断输入')}</span>
          {replay && (
            <Chip tone="neutral">
              {t('devtools.diagnose.replayFrom', '回放自 #{id}').replace('{id}', String(replay.runId))}
            </Chip>
          )}
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
        <CardBody>
          <div className="overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
            <Textarea
              aria-label={t('devtools.diagnose.inputLabel', '诊断输入内容')}
              spellCheck={false}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-[220px] resize-y rounded-none border-0 px-3 py-2 font-mono text-[12px] leading-5 outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
              style={{
                background: '#172338',
                color: '#d8e6f3',
                boxShadow: 'none',
              }}
            />
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

function HistoryPanel({ onReplay }: { onReplay: (payload: ReplayPayload) => void }) {
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
            <RefreshButton
              onClick={() => list.refetch()}
              loading={list.isFetching}
              ariaLabel={t('devtools.history.refresh', '刷新诊断历史')}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto scroll-thin">
          {list.isLoading ? (
            <div className="p-6 text-sm text-3">{t('common.loading', '加载中…')}</div>
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
              <div className="text-sm text-3">{t('common.loading', '加载中…')}</div>
            ) : detail.data ? (
              <DetailContent run={detail.data} onReplay={onReplay} />
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

function DetailContent({
  run,
  onReplay,
}: {
  run: DiagnoseRun
  onReplay?: (payload: ReplayPayload) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {onReplay && (
        <Button
          size="sm"
          variant="primary"
          onClick={() =>
            onReplay({ kind: run.input_kind, text: run.input_text, runId: run.id })
          }
        >
          <RotateCcw size={11} /> {t('devtools.history.detail.replay', '回填到诊断面板')}
        </Button>
      )}
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
        {run.definition_hash && (
          <Field label={t('devtools.history.detail.definitionHash', '定义版本')}>
            <span className="font-mono text-2" title={run.definition_hash}>
              {run.definition_hash.slice(0, 12)}
            </span>
          </Field>
        )}
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

// ── DSL 编辑公共逻辑 ───────────────────────────────────────────────────────

function defaultDslTemplate(cube: string): string {
  const prefix = cube || 'cube_name'
  return JSON.stringify(
    { measures: [`${prefix}.total_count`], dimensions: [], limit: 100 },
    null,
    2,
  )
}

function parseDslOrNull(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

function CubeSelect({
  value,
  onChange,
  cubes,
}: {
  value: string
  onChange: (v: string) => void
  cubes: Array<{ name: string; title?: string | null }>
}) {
  return (
    <select
      className="rounded border px-2 py-1.5 text-sm"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-1)' }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('devtools.compile.selectCube', '选择 Cube')}
    >
      <option value="">{t('devtools.compile.selectCubeOption', '选择 Cube…')}</option>
      {cubes.map((c) => (
        <option key={c.name} value={c.name}>
          {c.title || c.name}
        </option>
      ))}
    </select>
  )
}

// ── CompilePanel ──────────────────────────────────────────────────────────

function CompilePanel({ presetCube = '' }: { presetCube?: string }) {
  const cubeQuery = useCubeList({})
  const cubes = cubeQuery.data?.cubes ?? []
  const compileDsl = useCompileDsl()

  const [selectedCube, setSelectedCube] = useState(presetCube)
  const [query, setQuery] = useState(defaultDslTemplate(presetCube))
  const [output, setOutput] = useState<string>('')
  const [meta, setMeta] = useState<{
    primary_cube?: string
    joined_cubes?: string[]
    definition_hash?: string | null
    error_code?: string
  } | null>(null)

  const handleSelectCube = (cube: string) => {
    setSelectedCube(cube)
    // 仅在用户尚未自定义 DSL 时刷新模板
    if (!query || query === defaultDslTemplate(selectedCube)) {
      setQuery(defaultDslTemplate(cube))
    }
  }

  const handleCompile = async () => {
    const dsl = parseDslOrNull(query)
    if (!dsl) {
      setOutput(t('devtools.compile.jsonError', '无效的 JSON 查询'))
      setMeta(null)
      return
    }
    try {
      const res = await compileDsl.mutateAsync(dsl)
      setOutput(res.sql ?? t('devtools.compile.noSql', '未返回 SQL'))
      setMeta({
        primary_cube: res.primary_cube,
        joined_cubes: res.joined_cubes,
        definition_hash: res.definition_hash,
      })
    } catch (e: unknown) {
      const details = AppError.isAppError(e) ? (e.details as Record<string, unknown> | undefined) : undefined
      setOutput(e instanceof Error ? e.message : t('devtools.compile.failed', '编译失败'))
      setMeta({ error_code: typeof details?.error_code === 'string' ? details.error_code : undefined })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
      <div className="flex items-center gap-3">
        <CubeSelect value={selectedCube} onChange={handleSelectCube} cubes={cubes} />
        <Button
          size="sm"
          variant="primary"
          onClick={handleCompile}
          loading={compileDsl.isPending}
        >
          <Play size={11} /> {t('devtools.compile.run', '生成 SQL')}
        </Button>
        {meta?.error_code && (
          <Chip tone="danger">{meta.error_code}</Chip>
        )}
        {meta?.primary_cube && (
          <span className="text-xs text-3">
            {t('devtools.evidence.primaryCube', '主对象')}：{meta.primary_cube}
            {meta.joined_cubes && meta.joined_cubes.length > 0 &&
              t('devtools.evidence.joinedCubesValue', ' · 关联对象：{value}', { value: meta.joined_cubes.join(', ') })}
          </span>
        )}
        {meta?.definition_hash && (
          <span className="font-mono text-xs text-3" title={meta.definition_hash}>
            {t('devtools.evidence.definitionHash', '定义版本')}：{meta.definition_hash.slice(0, 12)}
          </span>
        )}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex h-full flex-1 flex-col overflow-hidden rounded-md border" style={{ borderColor: 'var(--border)' }}>
          <div className="px-3 py-1.5 text-xs text-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            {t('devtools.compile.queryLabel', 'Cube Query（JSON）')}
          </div>
          <Suspense fallback={<div className="p-4 text-sm text-3">{t('common.loading', '加载中…')}</div>}>
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
          <Suspense fallback={<div className="p-4 text-sm text-3">{t('common.loading', '加载中…')}</div>}>
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

// ── QueryPanel（Phase 3 标准证据包） ─────────────────────────────────────────

const SAMPLE_ROW_LIMIT = 50

interface QueryErrorEvidence {
  message: string
  error_code?: string
  hint?: string
  sql?: string
  definition_hash?: string | null
  execution_time_ms?: number
}

function QueryPanel({ presetCube = '' }: { presetCube?: string }) {
  const cubeQuery = useCubeList({})
  const cubes = cubeQuery.data?.cubes ?? []
  const runQuery = useQueryDsl()

  const [selectedCube, setSelectedCube] = useState(presetCube)
  const [query, setQuery] = useState(defaultDslTemplate(presetCube))
  const [result, setResult] = useState<SemanticQueryResult | null>(null)
  const [errorEvidence, setErrorEvidence] = useState<QueryErrorEvidence | null>(null)

  const handleSelectCube = (cube: string) => {
    setSelectedCube(cube)
    if (!query || query === defaultDslTemplate(selectedCube)) {
      setQuery(defaultDslTemplate(cube))
    }
  }

  const handleRun = async () => {
    const dsl = parseDslOrNull(query)
    if (!dsl) {
      setResult(null)
      setErrorEvidence({ message: t('devtools.compile.jsonError', '无效的 JSON 查询') })
      return
    }
    setResult(null)
    setErrorEvidence(null)
    try {
      const res = await runQuery.mutateAsync(dsl)
      setResult(res)
    } catch (e: unknown) {
      const details = AppError.isAppError(e)
        ? ((e.details ?? {}) as Record<string, unknown>)
        : {}
      setErrorEvidence({
        message: e instanceof Error ? e.message : t('devtools.query.failed', '查询失败'),
        error_code: typeof details.error_code === 'string' ? details.error_code : undefined,
        hint: typeof details.hint === 'string' ? details.hint : undefined,
        sql: typeof details.sql === 'string' ? details.sql : undefined,
        definition_hash:
          typeof details.definition_hash === 'string' ? details.definition_hash : undefined,
        execution_time_ms:
          typeof details.execution_time_ms === 'number' ? details.execution_time_ms : undefined,
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto scroll-thin p-5">
      <Card>
        <CardHead>
          <span>{t('devtools.query.title', '查询 DSL')}</span>
          <div className="ml-auto flex items-center gap-2">
            <CubeSelect value={selectedCube} onChange={handleSelectCube} cubes={cubes} />
            <Button
              size="sm"
              variant="primary"
              onClick={handleRun}
              loading={runQuery.isPending}
            >
              <Play size={11} />{' '}
              {runQuery.isPending
                ? t('devtools.query.running', '执行中…')
                : t('devtools.query.run', '执行查询')}
            </Button>
          </div>
        </CardHead>
        <CardBody className="!p-0">
          <div className="h-[180px]">
            <Suspense fallback={<div className="p-4 text-sm text-3">{t('common.loading', '加载中…')}</div>}>
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
        </CardBody>
      </Card>

      {errorEvidence && <QueryErrorCard evidence={errorEvidence} />}
      {result && <QueryEvidenceCard result={result} />}
    </div>
  )
}

function EvidenceMetaRow({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
      {items.map((item) => (
        <Field key={item.label} label={item.label}>
          {item.value}
        </Field>
      ))}
    </div>
  )
}

function QueryErrorCard({ evidence }: { evidence: QueryErrorEvidence }) {
  return (
    <Card>
      <CardHead>
        <span>{t('devtools.query.errorTitle', '执行失败证据')}</span>
        <div className="ml-auto flex items-center gap-2">
          {evidence.error_code && <Chip tone="danger">{evidence.error_code}</Chip>}
          {evidence.execution_time_ms != null && (
            <span className="text-xs text-3">
              {t('devtools.diagnose.elapsed', '耗时')}：{evidence.execution_time_ms} ms
            </span>
          )}
        </div>
      </CardHead>
      <CardBody>
        <pre
          className="max-h-40 overflow-auto rounded p-3 text-xs"
          style={{ background: 'var(--bg-hover)', color: 'var(--danger)' }}
        >
          {evidence.message}
        </pre>
        {evidence.hint && (
          <div className="mt-2 text-xs text-2">
            {t('devtools.query.hint', '提示')}：{evidence.hint}
          </div>
        )}
        {evidence.definition_hash && (
          <div className="mt-2 font-mono text-xs text-3" title={evidence.definition_hash}>
            {t('devtools.evidence.definitionHash', '定义版本')}：{evidence.definition_hash.slice(0, 12)}
          </div>
        )}
        {evidence.sql && (
          <div className="mt-3">
            <div className="mb-1 text-xs text-3">{t('devtools.evidence.sql', '编译 SQL')}</div>
            <pre
              className="max-h-60 overflow-auto rounded p-3 text-xs"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
            >
              {evidence.sql}
            </pre>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function QueryEvidenceCard({ result }: { result: SemanticQueryResult }) {
  const sampleRows = (result.data ?? []).slice(0, SAMPLE_ROW_LIMIT)
  return (
    <Card>
      <CardHead>
        <span>{t('devtools.query.evidenceTitle', '查询证据包')}</span>
        <div className="ml-auto flex items-center gap-2">
          <Chip tone="success">{t('devtools.status.ok', '通过')}</Chip>
        </div>
      </CardHead>
      <CardBody>
        <EvidenceMetaRow
          items={[
            {
              label: t('devtools.evidence.primaryCube', '主对象'),
              value: <span className="font-mono text-2">{result.primary_cube || '—'}</span>,
            },
            {
              label: t('devtools.evidence.joinedCubes', '关联对象'),
              value: (
                <span className="font-mono text-2">
                  {result.joined_cubes?.length ? result.joined_cubes.join(', ') : '—'}
                </span>
              ),
            },
            {
              label: t('devtools.evidence.rowCount', '行数'),
              value: <span className="text-2">{result.row_count}</span>,
            },
            {
              label: t('devtools.diagnose.elapsed', '耗时'),
              value: <span className="text-2">{result.execution_time_ms} ms</span>,
            },
            {
              label: t('devtools.evidence.definitionHash', '定义版本'),
              value: result.definition_hash ? (
                <span className="font-mono text-2" title={result.definition_hash}>
                  {result.definition_hash.slice(0, 12)}
                </span>
              ) : (
                <span className="text-3">—</span>
              ),
            },
          ]}
        />

        <div className="mt-3">
          <div className="mb-1 text-xs text-3">{t('devtools.evidence.sql', '编译 SQL')}</div>
          <pre
            className="max-h-48 overflow-auto rounded p-3 text-xs"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-1)' }}
          >
            {result.sql}
          </pre>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-3">
            <span>{t('devtools.evidence.sample', '结果样本')}</span>
            {result.row_count > sampleRows.length && (
              <span>
                {t('devtools.evidence.sampleLimit', '（仅展示前 {n} 行）').replace(
                  '{n}',
                  String(SAMPLE_ROW_LIMIT),
                )}
              </span>
            )}
          </div>
          {sampleRows.length === 0 ? (
            <div className="rounded p-3 text-xs text-3" style={{ background: 'var(--bg-hover)' }}>
              {result.message ?? t('devtools.query.emptyResult', '查询成功，结果为空（0 行）。')}
            </div>
          ) : (
            <div className="max-h-72 overflow-auto rounded border" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead
                  className="sticky top-0"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-3)' }}
                >
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {result.columns.map((col) => (
                      <th key={col} className="px-3 py-1.5 text-left font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      {(row as unknown[]).map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono text-2">
                          {cell == null ? '—' : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
