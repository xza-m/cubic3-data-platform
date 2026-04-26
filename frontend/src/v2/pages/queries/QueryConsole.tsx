// frontend/src/v2/pages/queries/QueryConsole.tsx
//
// 查询控制台 —— SQL 编辑器 + 执行。
// 接 POST /api/v1/queries/execute
// Monaco editor 必须 lazy import（不进入 main chunk）。

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Database, Loader2, Play, Save, Table2 } from 'lucide-react'
import { useDatasourcesForConsole, useExecuteQuery, useCreateSavedQuery } from '@v2/hooks/queries'
import { useDatasourceSchema, useDatasourceSchemaTables } from '@v2/hooks/datasources'
import { fmtNum } from '@v2/lib/format'
import type { QueryRunResult } from '@v2/api/queries'
import { t } from '@v2/i18n'

// Monaco editor lazy import — 不进入 main chunk
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

/**
 * sessionStorage 预填 key —— 由 /queries/visual 跳转时写入，QueryConsole mount
 * 时读取一次并清掉。与 visual/QueryVisual.tsx::V2_QUERY_VISUAL_PREFILL_KEY 约定。
 */
const V2_QUERY_VISUAL_PREFILL_KEY = 'v2:queryVisual:pendingPrefill'

interface QueryVisualPrefill {
  sql: string
  source_id: number | null
  origin: 'visual'
  created_at: number
}

/** 读取一次并清空；解析失败 / 结构异常时返回 null。 */
function consumeVisualPrefill(): QueryVisualPrefill | null {
  try {
    const raw = sessionStorage.getItem(V2_QUERY_VISUAL_PREFILL_KEY)
    if (!raw) return null
    sessionStorage.removeItem(V2_QUERY_VISUAL_PREFILL_KEY)
    const parsed = JSON.parse(raw) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { sql?: unknown }).sql !== 'string'
    ) {
      return null
    }
    const obj = parsed as {
      sql: string
      source_id?: number | null
      origin?: string
      created_at?: number
    }
    return {
      sql: obj.sql,
      source_id: typeof obj.source_id === 'number' ? obj.source_id : null,
      origin: 'visual',
      created_at: typeof obj.created_at === 'number' ? obj.created_at : Date.now(),
    }
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_SQL = 'SELECT 1 AS hello'

function sqlIdentifier(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export default function QueryConsole() {
  // 先尝试从 sessionStorage 读取 /queries/visual 传来的 prefill；命中则覆盖默认 SQL。
  // 使用 lazy initializer，避免每次 render 都访问 sessionStorage。
  const [initialPrefill] = useState<QueryVisualPrefill | null>(() => consumeVisualPrefill())

  const [sql, setSql] = useState<string>(() => initialPrefill?.sql ?? DEFAULT_SQL)
  const [sourceId, setSourceId] = useState<number | null>(initialPrefill?.source_id ?? null)
  const [database, setDatabase] = useState<string | null>(null)
  const [result, setResult] = useState<QueryRunResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  )
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveName, setSaveName] = useState('')

  const sources = useDatasourcesForConsole()
  const sourceList = useMemo(
    () => (Array.isArray(sources.data) ? sources.data : []),
    [sources.data],
  )
  const schema = useDatasourceSchema(sourceId ?? 0, sourceId != null)
  const databaseList = useMemo(() => {
    if (schema.data?.datasource_id !== sourceId) return []
    return Array.isArray(schema.data?.databases) ? schema.data.databases : []
  }, [schema.data, sourceId])
  const tables = useDatasourceSchemaTables(sourceId ?? 0, database, sourceId != null && !!database)
  const tableList = useMemo(() => {
    if (tables.data?.datasource_id !== sourceId || tables.data?.database !== database) return []
    return Array.isArray(tables.data?.tables) ? tables.data.tables : []
  }, [tables.data, sourceId, database])
  const executeMut = useExecuteQuery()
  const createMut = useCreateSavedQuery()

  // auto-select first source
  useEffect(() => {
    if (sourceId == null && sourceList.length) {
      setSourceId(sourceList[0].id)
    }
  }, [sourceList, sourceId])

  useEffect(() => {
    setDatabase(null)
  }, [sourceId])

  useEffect(() => {
    if (!databaseList.length) return
    if (!database || !databaseList.includes(database)) {
      setDatabase(databaseList[0])
    }
  }, [databaseList, database])

  // track theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const activeSource = useMemo(
    () => sourceList.find((s) => s.id === sourceId) ?? null,
    [sourceList, sourceId],
  )

  const fillTableQuery = useCallback((tableName: string) => {
    setSql(`SELECT *\nFROM ${sqlIdentifier(tableName)}\nLIMIT 100`)
  }, [])

  const handleRun = useCallback(async () => {
    if (sourceId == null) {
      alert(t('queryConsole.alert.pickSource', '请先选择数据源'))
      return
    }
    if (!sql.trim()) {
      alert(t('queryConsole.alert.enterSql', '请输入 SQL'))
      return
    }
    setErrorMsg(null)
    try {
      const res = await executeMut.mutateAsync({ source_id: sourceId, sql_query: sql, limit: 200 })
      setResult(res)
    } catch (err) {
      setResult(null)
      setErrorMsg(err instanceof Error ? err.message : t('queryConsole.state.execFailed', '执行失败'))
    }
  }, [sourceId, sql, executeMut])

  const handleSave = useCallback(async () => {
    if (!saveName.trim() || sourceId == null) return
    try {
      await createMut.mutateAsync({
        query_name: saveName.trim(),
        source_id: sourceId,
        sql_query: sql,
      })
      setSaveDialogOpen(false)
      setSaveName('')
    } catch (_err) {
      // error handled by mutation
    }
  }, [saveName, sourceId, sql, createMut])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left resource panel — datasources and physical tables */}
      <aside
        className="flex w-64 flex-shrink-0 flex-col border-r"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div
          className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide"
          style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
        >
          {t('queryConsole.sidebar.catalog', '数据目录')}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className="border-b px-3 py-2 text-xs font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {t('queryConsole.sidebar.datasources', '数据源')}
          </div>
          {sources.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
            </div>
          ) : sources.isError ? (
            <div className="px-3 py-4 text-xs text-red-500 dark:text-red-400">
              {sources.error instanceof Error
                ? sources.error.message
                : t('queryConsole.sidebar.sourceLoadFailed', '数据源加载失败')}
            </div>
          ) : sourceList.length === 0 ? (
            <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('queryConsole.sidebar.noSource', '暂无可用数据源')}
            </div>
          ) : (
            <div aria-label={t('queryConsole.sidebar.sourceList', '数据源列表')}>
              {sourceList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSourceId(s.id)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[color:var(--bg-hover)]"
                  style={{
                    background: s.id === sourceId ? 'var(--accent-soft)' : undefined,
                    color: s.id === sourceId ? 'var(--accent)' : 'var(--text-1)',
                  }}
                >
                  <span className="truncate text-xs font-medium">{s.name}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {s.source_type}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div
            className="border-y px-3 py-2 text-xs font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            {t('queryConsole.sidebar.database', '数据库')}
          </div>
          <div className="px-3 py-2">
            {schema.isLoading ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                <Loader2 size={12} className="animate-spin" />
                {t('queryConsole.sidebar.loadingSchema', '加载结构中…')}
              </div>
            ) : schema.isError ? (
              <div className="text-xs text-red-500 dark:text-red-400">
                {schema.error instanceof Error
                  ? schema.error.message
                  : t('queryConsole.sidebar.schemaLoadFailed', '结构加载失败')}
              </div>
            ) : databaseList.length > 0 ? (
              <select
                value={database ?? ''}
                onChange={(e) => setDatabase(e.target.value || null)}
                aria-label={t('queryConsole.sidebar.databaseAria', '选择数据库')}
                className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              >
                {databaseList.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                {activeSource
                  ? t('queryConsole.sidebar.noDatabase', '暂无数据库信息')
                  : t('queryConsole.sidebar.pickSource', '请先选择数据源')}
              </div>
            )}
          </div>

          <div
            className="flex items-center gap-1 border-y px-3 py-2 text-xs font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Table2 size={12} />
            {database
              ? t('queryConsole.sidebar.tablesIn', '数据表（{db}）', { db: database })
              : t('queryConsole.sidebar.tables', '数据表')}
          </div>
          <div className="pb-3">
            {tables.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
              </div>
            ) : tables.isError ? (
              <div className="px-3 py-4 text-xs text-red-500 dark:text-red-400">
                {tables.error instanceof Error
                  ? tables.error.message
                  : t('queryConsole.sidebar.tableLoadFailed', '数据表加载失败')}
              </div>
            ) : !database ? (
              <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('queryConsole.sidebar.pickDatabase', '请先选择数据库')}
              </div>
            ) : tableList.length === 0 ? (
              <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('queryConsole.sidebar.noTable', '暂无数据表')}
              </div>
            ) : (
              tableList.map((table) => (
                <button
                  key={table.table_name}
                  type="button"
                  onClick={() => fillTableQuery(table.table_name)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[color:var(--bg-hover)]"
                >
                  <span className="truncate font-mono text-xs" style={{ color: 'var(--text-1)' }}>
                    {table.table_name}
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--text-3)' }}>
                    {table.comment ||
                      (table.row_count != null
                        ? t('queryConsole.sidebar.tableRows', '{n} 行', {
                            n: fmtNum(table.row_count),
                          })
                        : t('queryConsole.sidebar.fillSql', '点击填入查询'))}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-2"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
            <Database size={12} style={{ color: 'var(--text-3)' }} />
            <span className="truncate font-medium" style={{ color: 'var(--text-1)' }}>
              {activeSource?.name ?? t('queryConsole.toolbar.noSource', '未选择数据源')}
            </span>
            {database ? (
              <span className="truncate" style={{ color: 'var(--text-3)' }}>
                / {database}
              </span>
            ) : null}
          </div>

          <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            {result && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300">
                {t('queryConsole.toolbar.rows', '{n} 行', { n: fmtNum(result.row_count) })}
              </span>
            )}
            {errorMsg && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {t('queryConsole.toolbar.error', '错误')}
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={handleRun}
            disabled={executeMut.isPending}
            className="flex items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {executeMut.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {t('queryConsole.action.run', '执行')}
          </button>
          <button
            type="button"
            onClick={() => setSaveDialogOpen(true)}
            disabled={!sql.trim()}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            <Save size={12} />
            {t('queryConsole.action.save', '保存')}
          </button>
        </div>

        {/* Editor + Results */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Monaco editor area */}
          <div
            className="border-b"
            style={{ height: '42%', minHeight: 180, borderColor: 'var(--border)' }}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
                  {t('queryConsole.editor.loading', '加载编辑器中…')}
                </div>
              }
            >
              <MonacoEditor
                value={sql}
                language="sql"
                onChange={(v) => setSql(v ?? '')}
                theme={isDark ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  tabSize: 2,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: 'gutter',
                  padding: { top: 8 },
                }}
                onMount={(editor, monaco) => {
                  editor.addCommand(
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                    () => void handleRun(),
                  )
                }}
              />
            </Suspense>
          </div>

          {/* Results area */}
          <div className="flex-1 overflow-hidden">
            {executeMut.isPending ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-3)' }} />
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {t('queryConsole.state.executing', '执行中…')}
                </span>
              </div>
            ) : errorMsg ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="text-xs text-red-500 dark:text-red-400">{errorMsg}</span>
              </div>
            ) : result ? (
              <ResultTable columns={result.columns} rows={result.data} />
            ) : (
              <div
                className="flex h-full items-center justify-center text-xs"
                style={{ color: 'var(--text-3)' }}
              >
                {t('queryConsole.state.hint', '点击右上角「执行」运行查询（⌘↵）')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save dialog */}
      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="w-96 rounded-lg border p-6 shadow-lg"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('queryConsole.save.title', '保存查询')}
            </h3>
            <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
              {t('queryConsole.save.nameLabel', '查询名称')}
            </label>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder={t('queryConsole.save.namePlaceholder', '如：GMV_周报')}
              className="mb-4 w-full rounded border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
                if (e.key === 'Escape') setSaveDialogOpen(false)
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveDialogOpen(false)}
                className="rounded-md border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: 'var(--border)' }}
              >
                {t('queryConsole.save.cancel', '取消')}
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!saveName.trim() || sourceId == null || createMut.isPending}
                className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {createMut.isPending
                  ? t('queryConsole.save.saving', '保存中…')
                  : t('queryConsole.save.submit', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Result table
// ──────────────────────────────────────────────────────────────────────────

function ResultTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <thead
          className="sticky top-0"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}
        >
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="border-b px-3 py-2 text-left font-medium"
                style={{ borderColor: 'var(--border)' }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center"
                style={{ color: 'var(--text-3)' }}
              >
                {t('queryConsole.result.empty', '无返回行')}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={i}
                className="transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                {columns.map((c) => {
                  const v = row[c]
                  return (
                    <td key={c} className="max-w-xs truncate px-3 py-2" style={{ color: 'var(--text-1)' }}>
                      {v == null ? (
                        <span style={{ color: 'var(--text-4)' }}>NULL</span>
                      ) : typeof v === 'object' ? (
                        <code className="text-xs">{JSON.stringify(v)}</code>
                      ) : (
                        String(v)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
