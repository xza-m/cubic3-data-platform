// frontend/src/v2/pages/queries/QueryConsole.tsx
//
// 查询控制台 —— SQL 编辑器 + 执行。
// 接 POST /api/v1/queries/execute
// Monaco editor 必须 lazy import（不进入 main chunk）。

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ChevronDown,
  Columns3,
  Database,
  Loader2,
  Play,
  Save,
  Search,
  Server,
  Table2,
  X,
} from 'lucide-react'
import { useDatasourcesForConsole, useExecuteQuery, useCreateSavedQuery } from '@v2/hooks/queries'
import {
  useDatasourceSchema,
  useDatasourceSchemaTableColumns,
  useDatasourceSchemaTables,
} from '@v2/hooks/datasources'
import { fmtNum } from '@v2/lib/format'
import { datasourceTypeLabel } from '@v2/lib/datasourceTypes'
import { IdentityName } from '@v2/components/IdentityName'
import { useToast } from '@v2/components/ui'
import type { DatasourceTableSummary } from '@v2/api/datasources'
import type { QueryRunResult } from '@v2/api/queries'
import { t } from '@v2/i18n'
import {
  consumeStoredQueryWorkbenchPrefill,
  extractRouteQueryWorkbenchPrefill,
  type QueryWorkbenchPrefillPayload,
} from './_shared/workbench-prefill'

// Monaco editor lazy import — 不进入 main chunk
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

interface SelectedTable {
  sourceId: number
  sourceName: string
  database: string
  tableName: string
  comment: string | null
  rowCount: number | null
}

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_SQL = 'SELECT 1 AS hello'
const TABLE_PAGE_SIZE = 20
const RESULT_PAGE_SIZE = 20

function sqlIdentifier(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export default function QueryConsole() {
  const location = useLocation()
  // 先尝试读取 route state，再读取 sessionStorage；命中则覆盖默认 SQL。
  // 使用 lazy initializer，避免每次 render 都访问 sessionStorage。
  const [initialPrefill] = useState<QueryWorkbenchPrefillPayload | null>(() => {
    const routePrefill = extractRouteQueryWorkbenchPrefill(location.state)
    const storedPrefill = consumeStoredQueryWorkbenchPrefill()
    return routePrefill ?? storedPrefill
  })

  const toast = useToast()
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
  const [tableSearch, setTableSearch] = useState('')
  const [tablePage, setTablePage] = useState(1)
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null)

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
  const filteredTableList = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase()
    if (!keyword) return tableList
    return tableList.filter((table) => {
      const haystack = `${table.table_name} ${table.comment ?? ''}`.toLowerCase()
      return haystack.includes(keyword)
    })
  }, [tableList, tableSearch])
  const tablePageCount = Math.max(1, Math.ceil(filteredTableList.length / TABLE_PAGE_SIZE))
  const safeTablePage = Math.min(tablePage, tablePageCount)
  const pagedTableList = useMemo(() => {
    const start = (safeTablePage - 1) * TABLE_PAGE_SIZE
    return filteredTableList.slice(start, start + TABLE_PAGE_SIZE)
  }, [filteredTableList, safeTablePage])
  const tablePageStart = filteredTableList.length === 0 ? 0 : (safeTablePage - 1) * TABLE_PAGE_SIZE + 1
  const tablePageEnd = Math.min(safeTablePage * TABLE_PAGE_SIZE, filteredTableList.length)
  const selectedTableSchema = useDatasourceSchemaTableColumns(
    selectedTable?.sourceId ?? 0,
    selectedTable?.database ?? null,
    selectedTable?.tableName ?? null,
    selectedTable != null,
  )
  const executeMut = useExecuteQuery()
  const createMut = useCreateSavedQuery()
  const prefillPrincipalId = initialPrefill?.principal_id?.trim() || undefined

  // auto-select first source
  useEffect(() => {
    if (sourceId == null && sourceList.length) {
      setSourceId(sourceList[0].id)
    }
  }, [sourceList, sourceId])

  useEffect(() => {
    setDatabase(null)
    setTableSearch('')
    setTablePage(1)
    setSelectedTable(null)
  }, [sourceId])

  useEffect(() => {
    if (!databaseList.length) return
    if (!database || !databaseList.includes(database)) {
      setDatabase(databaseList[0])
    }
  }, [databaseList, database])

  useEffect(() => {
    setTableSearch('')
    setTablePage(1)
    setSelectedTable(null)
  }, [database])

  useEffect(() => {
    setTablePage(1)
  }, [tableSearch, tableList.length])

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

  const fillTableQuery = useCallback(
    (table: DatasourceTableSummary, dbName = database) => {
      if (sourceId == null || !dbName) return
      const tableRef = dbName
        ? `${sqlIdentifier(dbName)}.${sqlIdentifier(table.table_name)}`
        : sqlIdentifier(table.table_name)
      setSql(`SELECT *\nFROM ${tableRef}\nLIMIT 100`)
      setSelectedTable({
        sourceId,
        sourceName: activeSource?.name ?? t('queryConsole.toolbar.noSource', '未选择数据源'),
        database: dbName,
        tableName: table.table_name,
        comment: table.comment || null,
        rowCount: table.row_count,
      })
    },
    [activeSource?.name, database, sourceId],
  )

  const handleRun = useCallback(async () => {
    if (sourceId == null) {
      const msg = t('queryConsole.alert.pickSource', '请先选择数据源')
      setErrorMsg(msg)
      toast.show({ tone: 'warning', title: msg })
      return
    }
    if (!sql.trim()) {
      const msg = t('queryConsole.alert.enterSql', '请输入 SQL')
      setErrorMsg(msg)
      toast.show({ tone: 'warning', title: msg })
      return
    }
    setErrorMsg(null)
    try {
      const res = await executeMut.mutateAsync({
        source_id: sourceId,
        sql_query: sql,
        limit: 200,
        principal_id: prefillPrincipalId,
      })
      setResult(res)
    } catch (err) {
      setResult(null)
      setErrorMsg(err instanceof Error ? err.message : t('queryConsole.state.execFailed', '执行失败'))
    }
  }, [sourceId, sql, executeMut, prefillPrincipalId, toast])

  const handleSave = useCallback(async () => {
    if (!saveName.trim() || sourceId == null) return
    try {
      await createMut.mutateAsync({
        query_name: saveName.trim(),
        source_id: sourceId,
        sql_query: sql,
        principal_id: prefillPrincipalId,
      })
      setSaveDialogOpen(false)
      setSaveName('')
      toast.show({ tone: 'success', title: t('queryConsole.toast.saved', '查询已保存') })
    } catch (err) {
      toast.show({
        tone: 'danger',
        title: t('queryConsole.toast.saveFailed', '保存查询失败'),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }, [saveName, sourceId, sql, createMut, prefillPrincipalId, toast])

  return (
    <div className="relative flex flex-1 overflow-hidden">
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
        <div className="space-y-3 border-b p-3" style={{ borderColor: 'var(--border)' }}>
          <SelectControl
            id="query-resource-source-select"
            label={t('queryConsole.sidebar.sourceSelect', '数据源')}
            value={sourceId == null ? '' : String(sourceId)}
            onChange={(value) => setSourceId(value ? Number(value) : null)}
            disabled={sources.isLoading || sources.isError || sourceList.length === 0}
            placeholder={
              sources.isLoading
                ? t('queryConsole.sidebar.loadingSources', '加载数据源中…')
                : t('queryConsole.sidebar.sourceSelectPlaceholder', '选择数据源')
            }
            options={sourceList.map((source) => ({
              value: String(source.id),
              label: source.name,
              description: datasourceTypeLabel(source.source_type),
            }))}
          />
          <SelectControl
            id="query-resource-db-select"
            label={t('queryConsole.sidebar.databaseSelect', '数据库')}
            value={database ?? ''}
            onChange={(value) => setDatabase(value || null)}
            disabled={
              sourceId == null ||
              schema.isLoading ||
              schema.isError ||
              databaseList.length === 0
            }
            placeholder={
              schema.isLoading
                ? t('queryConsole.sidebar.loadingSchema', '加载结构中…')
                : t('queryConsole.sidebar.databaseSelectPlaceholder', '选择数据库')
            }
            options={databaseList.map((db) => ({ value: db, label: db }))}
          />
          {sources.isError ? (
            <div className="text-xs text-red-500 dark:text-red-400">
              {sources.error instanceof Error
                ? sources.error.message
                : t('queryConsole.sidebar.sourceLoadFailed', '数据源加载失败')}
            </div>
          ) : schema.isError ? (
            <div className="text-xs text-red-500 dark:text-red-400">
              {schema.error instanceof Error
                ? schema.error.message
                : t('queryConsole.sidebar.schemaLoadFailed', '结构加载失败')}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto" data-testid="query-resource-tree">
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
          ) : !activeSource ? (
            <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('queryConsole.sidebar.sourceSelectPlaceholder', '选择数据源')}
            </div>
          ) : (
            <div
              aria-label={t('queryConsole.sidebar.resourceTree', '资源树')}
              className="py-2"
            >
              <div>
                <div
                  className="flex w-full items-start gap-2 px-3 py-2"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  data-testid={`query-resource-source-${activeSource.id}`}
                >
                  <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <Server className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{activeSource.name}</span>
                    <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>
                      {datasourceTypeLabel(activeSource.source_type)}
                    </span>
                  </span>
                </div>
                <div className="ml-5 border-l pb-2" style={{ borderColor: 'var(--border)' }}>
                  {schema.isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                      <Loader2 size={12} className="animate-spin" />
                      {t('queryConsole.sidebar.loadingSchema', '加载结构中…')}
                    </div>
                  ) : schema.isError ? null : databaseList.length === 0 ? (
                    <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                      {t('queryConsole.sidebar.noDatabase', '暂无数据库信息')}
                    </div>
                  ) : !database ? (
                    <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                      {t('queryConsole.sidebar.databaseSelectPlaceholder', '选择数据库')}
                    </div>
                  ) : (
                    <div>
                      <div
                        className="flex w-full items-center gap-2 px-3 py-1.5"
                        style={{
                          color: 'var(--accent)',
                          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                        }}
                        data-testid={`query-resource-db-${database}`}
                      >
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                        <Database className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate text-xs font-medium">{database}</span>
                      </div>
                      <div className="ml-5 border-l py-1" style={{ borderColor: 'var(--border)' }}>
                                      {tables.isLoading ? (
                                        <div className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                                          <Loader2 size={12} className="animate-spin" />
                                          {t('queryConsole.sidebar.loadingTables', '加载数据表中…')}
                                        </div>
                                      ) : tables.isError ? (
                                        <div className="px-3 py-3 text-xs text-red-500 dark:text-red-400">
                                          {tables.error instanceof Error
                                            ? tables.error.message
                                            : t('queryConsole.sidebar.tableLoadFailed', '数据表加载失败')}
                                        </div>
                                      ) : tableList.length === 0 ? (
                                        <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                                          {t('queryConsole.sidebar.noTable', '暂无数据表')}
                                        </div>
                                      ) : (
                                        <>
                                          <div className="px-3 pb-2">
                                            <FilterInput
                                              id="query-resource-table-search"
                                              value={tableSearch}
                                              onChange={setTableSearch}
                                              placeholder={t('queryConsole.sidebar.tableSearchPlaceholder', '筛选数据表…')}
                                              clearLabel={t('queryConsole.sidebar.clearTableSearch', '清空数据表筛选')}
                                            />
                                          </div>
                                          {filteredTableList.length === 0 ? (
                                            <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-3)' }}>
                                              {t('queryConsole.sidebar.noTableMatch', '没有匹配的数据表')}
                                            </div>
                                          ) : (
                                            <>
                                              {pagedTableList.map((table) => {
                                                const tableActive =
                                                  selectedTable?.sourceId === sourceId &&
                                                  selectedTable.database === database &&
                                                  selectedTable.tableName === table.table_name
                                                const tableHint = table.comment
                                                  ? `${table.table_name}\n${table.comment}`
                                                  : `${table.table_name}\n${t('queryConsole.tableDetail.descriptionEmpty', '暂无表描述')}`
                                                return (
                                                  <button
                                                    key={table.table_name}
                                                    type="button"
                                                    onClick={() => fillTableQuery(table, database)}
                                                    title={tableHint}
                                                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[color:var(--bg-hover)]"
                                                    style={{
                                                      background: tableActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined,
                                                    }}
                                                    data-testid={`query-resource-table-${table.table_name}`}
                                                  >
                                                    <Table2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" style={{ color: tableActive ? 'var(--accent)' : 'var(--text-3)' }} />
                                                    <span className="min-w-0 flex-1">
                                                      <span className="block truncate font-mono text-xs" style={{ color: tableActive ? 'var(--accent)' : 'var(--text-1)' }}>
                                                        {table.table_name}
                                                      </span>
                                                      <span className="block truncate text-xs" style={{ color: 'var(--text-3)' }}>
                                                        {table.comment ||
                                                          (table.row_count != null
                                                            ? t('queryConsole.sidebar.tableRows', '{n} 行', {
                                                                n: fmtNum(table.row_count),
                                                              })
                                                            : t('queryConsole.sidebar.fillSql', '点击填入查询'))}
                                                      </span>
                                                    </span>
                                                  </button>
                                                )
                                              })}
                                              {filteredTableList.length > TABLE_PAGE_SIZE ? (
                                                <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                                                  <span>
                                                    {t('queryConsole.sidebar.tablePage', '{start}-{end} / {total}', {
                                                      start: fmtNum(tablePageStart),
                                                      end: fmtNum(tablePageEnd),
                                                      total: fmtNum(filteredTableList.length),
                                                    })}
                                                  </span>
                                                  <span className="flex items-center gap-1">
                                                    <button
                                                      type="button"
                                                      onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                                                      disabled={safeTablePage <= 1}
                                                      className="rounded border px-1.5 py-0.5 disabled:opacity-40"
                                                      style={{ borderColor: 'var(--border)' }}
                                                    >
                                                      {t('queryConsole.sidebar.tablePrev', '上页')}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => setTablePage((p) => Math.min(tablePageCount, p + 1))}
                                                      disabled={safeTablePage >= tablePageCount}
                                                      className="rounded border px-1.5 py-0.5 disabled:opacity-40"
                                                      style={{ borderColor: 'var(--border)' }}
                                                    >
                                                      {t('queryConsole.sidebar.tableNext', '下页')}
                                                    </button>
                                                  </span>
                                                </div>
                                              ) : null}
                                            </>
                                          )}
                                        </>
                                      )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {selectedTable ? (
        <aside
          className="absolute inset-y-0 right-0 z-30 flex w-80 flex-shrink-0 flex-col border-l shadow-lg xl:relative xl:inset-auto xl:z-auto xl:border-l-0 xl:border-r xl:shadow-none"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          data-testid="query-table-detail"
        >
          <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <Table2 size={13} />
                  {t('queryConsole.tableDetail.title', '数据表详情')}
                </div>
                <h2 className="mt-1 truncate font-mono text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  {selectedTable.tableName}
                </h2>
                <div className="mt-1 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                  {selectedTable.sourceName} / {selectedTable.database}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                className="rounded p-1 hover:bg-[color:var(--bg-hover)]"
                aria-label={t('queryConsole.tableDetail.close', '关闭字段信息')}
              >
                <X size={14} style={{ color: 'var(--text-3)' }} />
              </button>
            </div>
            <p className="mt-3 line-clamp-4 text-xs leading-5" style={{ color: 'var(--text-2)' }}>
              {selectedTable.comment || t('queryConsole.tableDetail.descriptionEmpty', '暂无表描述')}
            </p>
            {selectedTable.rowCount != null ? (
              <div className="mt-3 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('queryConsole.tableDetail.rows', '预估行数：{n}', { n: fmtNum(selectedTable.rowCount) })}
              </div>
            ) : null}
          </div>

          <div
            className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Columns3 size={13} />
            {t('queryConsole.tableDetail.columns', '字段')}
            {selectedTableSchema.data?.columns ? (
              <span style={{ color: 'var(--text-3)' }}>
                ({fmtNum(selectedTableSchema.data.columns.length)})
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {selectedTableSchema.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
                <Loader2 size={12} className="animate-spin" />
                {t('queryConsole.tableDetail.columnsLoading', '字段加载中…')}
              </div>
            ) : selectedTableSchema.isError ? (
              <div className="px-3 py-4 text-xs text-red-500 dark:text-red-400">
                {selectedTableSchema.error instanceof Error
                  ? selectedTableSchema.error.message
                  : t('queryConsole.tableDetail.columnsLoadFailed', '字段加载失败')}
              </div>
            ) : !selectedTableSchema.data?.columns?.length ? (
              <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-3)' }}>
                {t('queryConsole.tableDetail.columnsEmpty', '暂无字段信息')}
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {selectedTableSchema.data.columns.map((column) => (
                  <li key={column.name} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium" style={{ color: 'var(--text-1)' }}>
                        {column.name}
                      </span>
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[10px]" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                        {column.type}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {column.nullable
                        ? t('queryConsole.tableDetail.nullable', '可为空')
                        : t('queryConsole.tableDetail.notNullable', '非空')}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5" style={{ color: 'var(--text-2)' }}>
                      {column.comment || t('queryConsole.tableDetail.commentEmpty', '暂无字段描述')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      ) : null}

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
            {initialPrefill ? (
              <span
                data-testid="query-workbench-prefill-origin"
                className="hidden min-w-0 items-center gap-1 truncate rounded border px-2 py-0.5 md:inline-flex"
                style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
              >
                <span className="truncate">{prefillOriginLabel(initialPrefill)}</span>
                {initialPrefill.principal_id ? (
                  <>
                    <span>·</span>
                    <IdentityName
                      value={initialPrefill.principal_id}
                      displayName={initialPrefill.principal_display_name}
                    />
                  </>
                ) : null}
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

function prefillOriginLabel(prefill: QueryWorkbenchPrefillPayload): string {
  if (prefill.origin === 'saved_query') {
    return prefill.query_name
      ? t('queryConsole.prefill.savedNamed', '来自已保存查询：{name}', { name: prefill.query_name })
      : t('queryConsole.prefill.saved', '来自已保存查询')
  }
  if (prefill.origin === 'query_history') {
    return prefill.history_id
      ? t('queryConsole.prefill.historyId', '来自查询历史 #{id}', { id: prefill.history_id })
      : t('queryConsole.prefill.history', '来自查询历史')
  }
  return t('queryConsole.prefill.visual', '来自可视化构建')
}

// ──────────────────────────────────────────────────────────────────────────
// Result table
// ──────────────────────────────────────────────────────────────────────────

function SelectControl({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; description?: string }>
  placeholder: string
  disabled?: boolean
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
        {label}
      </span>
      <select
        id={id}
        data-testid={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors focus:ring-1 focus:ring-[color:var(--accent)] disabled:opacity-50"
        style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.description ? `${option.label} · ${option.description}` : option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function FilterInput({
  id,
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearLabel: string
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <Search size={13} style={{ color: 'var(--text-3)' }} />
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        style={{ color: 'var(--text-1)' }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded p-0.5 hover:bg-[color:var(--bg-hover)]"
          aria-label={clearLabel}
        >
          <X size={12} style={{ color: 'var(--text-3)' }} />
        </button>
      ) : null}
    </div>
  )
}

function ResultTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
}) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / RESULT_PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageStart = rows.length === 0 ? 0 : (safePage - 1) * RESULT_PAGE_SIZE + 1
  const pageEnd = Math.min(safePage * RESULT_PAGE_SIZE, rows.length)
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * RESULT_PAGE_SIZE
    return rows.slice(start, start + RESULT_PAGE_SIZE)
  }, [rows, safePage])

  useEffect(() => {
    setPage(1)
  }, [rows])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead
            className="sticky top-0"
            style={{
              background: 'color-mix(in srgb, var(--accent) 9%, var(--bg-surface))',
              color: 'var(--text-1)',
            }}
          >
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="border-b px-3 py-2 text-left font-semibold"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent) 28%, var(--border))',
                  }}
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
                  colSpan={Math.max(columns.length, 1)}
                  className="px-3 py-6 text-center"
                  style={{ color: 'var(--text-3)' }}
                >
                  {t('queryConsole.result.empty', '无返回行')}
                </td>
              </tr>
            ) : (
              pagedRows.map((row, i) => (
                <tr
                  key={`${safePage}-${i}`}
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

      <div
        className="flex items-center justify-between border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        <span>
          {t('queryConsole.result.pagination', '每页 20 条 · {start}-{end} / {total}', {
            start: fmtNum(pageStart),
            end: fmtNum(pageEnd),
            total: fmtNum(rows.length),
          })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            {t('queryConsole.result.prev', '上一页')}
          </button>
          <span>
            {t('queryConsole.result.page', '{page} / {total}', {
              page: fmtNum(safePage),
              total: fmtNum(pageCount),
            })}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
            className="rounded border px-2 py-1 text-xs disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            {t('queryConsole.result.next', '下一页')}
          </button>
        </div>
      </div>
    </div>
  )
}
