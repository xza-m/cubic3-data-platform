import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Database, RefreshCw } from 'lucide-react'
import { Button, Card, CardBody, CardHead, Chip, Input, Select, Table, type TableColumn } from '@v2/components/ui'
import { ToolbarSearch } from '@v2/components/CommonControls'
import { ListPagination } from '@v2/components/ListPagination'
import { useAppShell } from '@v2/layout/AppShell'
import { ContextRow, ContextSection } from '@v2/layout/Inspector'
import { normalizeDataAssetSyncStatus } from '@v2/lib/factSources'
import { t } from '@v2/i18n'
import {
  getDataAssetTableEvidence,
  getDataAssetTableFields,
  getDataAssetRadar,
  inferDataAssetFieldSemantics,
  getSemanticGovernanceIssues,
  listDataAssetSyncRuns,
  listDataAssetPhysicalTables,
  syncDataAssetMetadata,
  type DataAssetMetadataSyncResponse,
  type DataAssetEvidenceBundle,
  type DataAssetFieldProfile,
  type DataAssetFieldSemanticCandidate,
  type DataAssetPhysicalTable,
  type DataAssetPhysicalTableListParams,
  type DataAssetRadarResponse,
  type DataAssetSyncRun,
  type SemanticGovernanceIssue,
} from '@v2/api/semantic'

type AssetView = 'radar' | 'tables' | 'fields' | 'lineage' | 'quality' | 'sync-runs'

interface AssetWorkspaceProps {
  view?: AssetView
}

const VIEW_META: Array<{
  view: AssetView
  label: string
}> = [
  { view: 'radar', label: '资产雷达' },
  { view: 'tables', label: '物理表' },
  { view: 'quality', label: '表画像' },
  { view: 'fields', label: '字段画像' },
  { view: 'lineage', label: '血缘使用' },
  { view: 'sync-runs', label: '元数据同步' },
]

const TABLE_PAGE_SIZE = 20

const EMPTY_RADAR: DataAssetRadarResponse = {
  summary: {
    physical_table_count: 0,
    synced_table_count: 0,
    field_count: 0,
    lineage_edge_count: 0,
    quality_issue_count: 0,
    last_sync_at: null,
  },
  health: {
    score: 0,
    level: 'unknown',
    label: '未同步',
  },
}

const fmtNumber = (value: number | null | undefined) =>
  typeof value === 'number' ? value.toLocaleString('zh-CN') : '-'

const fmtDateTime = (value: string | null | undefined) => {
  if (!value) return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function AssetWorkspace({ view = 'radar' }: AssetWorkspaceProps) {
  const { setBreadcrumbs, setContextPanel } = useAppShell()
  const [radar, setRadar] = useState<DataAssetRadarResponse>(EMPTY_RADAR)
  const [tables, setTables] = useState<DataAssetPhysicalTable[]>([])
  const [fields, setFields] = useState<DataAssetFieldProfile[]>([])
  const [fieldSemantics, setFieldSemantics] = useState<DataAssetFieldSemanticCandidate[]>([])
  const [evidence, setEvidence] = useState<DataAssetEvidenceBundle | null>(null)
  const [syncRuns, setSyncRuns] = useState<DataAssetSyncRun[]>([])
  const [driftIssues, setDriftIssues] = useState<SemanticGovernanceIssue[]>([])
  const [tableKeyword, setTableKeyword] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [databaseFilter, setDatabaseFilter] = useState('')
  const [schemaFilter, setSchemaFilter] = useState('')
  const [syncStatusFilter, setSyncStatusFilter] = useState('')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [tablePage, setTablePage] = useState(1)
  const [tableTotal, setTableTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [fieldSemanticLoading, setFieldSemanticLoading] = useState(false)
  const [fieldSemanticError, setFieldSemanticError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)
  const listRequestIdRef = useRef(0)
  const detailRequestIdRef = useRef(0)

  const load = useCallback(async () => {
    const requestId = listRequestIdRef.current + 1
    listRequestIdRef.current = requestId
    const shouldShowLoading = !hasLoadedRef.current
    if (shouldShowLoading) setLoading(true)
    setError(null)
    try {
      const tableParams = buildTableListParams({
        keyword: tableKeyword,
        page: tablePage,
        source: sourceFilter,
        database: databaseFilter,
        schema: schemaFilter,
        syncStatus: syncStatusFilter,
      })
      const [nextRadar, nextTables, nextSyncRuns, nextGovernanceIssues] = await Promise.all([
        getDataAssetRadar(),
        listDataAssetPhysicalTables(tableParams),
        view === 'sync-runs' ? listDataAssetSyncRuns({ limit: 50 }) : Promise.resolve({ items: [], total: 0 }),
        getSemanticGovernanceIssues({ schema_source: 'asset_snapshot' }).catch(() => ({ issues: [] })),
      ])
      if (listRequestIdRef.current !== requestId) return
      setRadar(nextRadar)
      setTables(nextTables.tables)
      setTableTotal(nextTables.total)
      setSyncRuns(nextSyncRuns.items)
      setDriftIssues(nextGovernanceIssues.issues ?? [])
      setSelectedTableId((currentTableId) => {
        if (nextTables.tables.length === 0) return null
        if (currentTableId && nextTables.tables.some((item) => item.id === currentTableId)) {
          return currentTableId
        }
        return nextTables.tables[0].id
      })
    } catch {
      if (listRequestIdRef.current !== requestId) return
      setError('资产底座数据加载失败，请稍后重试。')
    } finally {
      if (listRequestIdRef.current === requestId) {
        hasLoadedRef.current = true
        if (shouldShowLoading) setLoading(false)
      }
    }
  }, [databaseFilter, schemaFilter, sourceFilter, syncStatusFilter, tableKeyword, tablePage, view])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    if (!selectedTableId) {
      setFields([])
      setFieldSemantics([])
      setFieldSemanticError(null)
      setEvidence(null)
      return undefined
    }

    let cancelled = false
    setFields([])
    setFieldSemantics([])
    setFieldSemanticError(null)
    setEvidence(null)
    void Promise.all([
      getDataAssetTableFields(selectedTableId),
      getDataAssetTableEvidence(selectedTableId),
    ]).then(([nextFields, nextEvidence]) => {
      if (cancelled || detailRequestIdRef.current !== requestId) return
      setFields(nextFields.items)
      setEvidence(nextEvidence)
    }).catch(() => {
      if (cancelled || detailRequestIdRef.current !== requestId) return
      setFields([])
      setEvidence(null)
    })

    return () => {
      cancelled = true
    }
  }, [selectedTableId])

  const handleInferFieldSemantics = useCallback(async () => {
    if (!selectedTableId) return
    setFieldSemanticLoading(true)
    setFieldSemanticError(null)
    try {
      const result = await inferDataAssetFieldSemantics(selectedTableId, fields)
      setFieldSemantics(result.fields ?? result.candidates ?? result.items ?? [])
    } catch (err) {
      setFieldSemanticError(err instanceof Error ? err.message : t('assets.fieldSemantic.error', '字段语义识别失败'))
    } finally {
      setFieldSemanticLoading(false)
    }
  }, [fields, selectedTableId])

  useEffect(() => {
    const current = VIEW_META.find((item) => item.view === view)?.label ?? '资产雷达'
    setBreadcrumbs(['语义中心', '数据资产底座', current])
  }, [setBreadcrumbs, view])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const result = await syncDataAssetMetadata({ scope: 'all' })
      setSyncMessage(formatSyncMessage(result))
      await load()
    } catch {
      setSyncMessage('同步任务提交失败')
    } finally {
      setSyncing(false)
    }
  }, [load])

  const handleTableKeywordChange = useCallback((value: string) => {
    setTableKeyword(value)
    setTablePage(1)
  }, [])

  const handleSourceFilterChange = useCallback((value: string) => {
    setSourceFilter(value)
    setTablePage(1)
  }, [])

  const handleDatabaseFilterChange = useCallback((value: string) => {
    setDatabaseFilter(value)
    setTablePage(1)
  }, [])

  const handleSchemaFilterChange = useCallback((value: string) => {
    setSchemaFilter(value)
    setTablePage(1)
  }, [])

  const handleSyncStatusFilterChange = useCallback((value: string) => {
    setSyncStatusFilter(value)
    setTablePage(1)
  }, [])

  const syncRate = useMemo(() => {
    const total = radar.summary.physical_table_count
    if (!total) return 0
    return Math.round((radar.summary.synced_table_count / total) * 100)
  }, [radar])

  useEffect(() => {
    setContextPanel({
      title: '数据资产底座',
      subtitle: '元数据事实层：物理表、字段、血缘与质量的统一入口',
      body: (
        <>
          <ContextSection title="资产覆盖">
            <ContextRow label="物理表" value={fmtNumber(radar.summary.physical_table_count)} />
            <ContextRow label="字段" value={fmtNumber(radar.summary.field_count)} />
            <ContextRow label="同步覆盖" value={`${syncRate}%`} />
          </ContextSection>
          <ContextSection title="治理信号">
            <ContextRow label="健康分" value={radar.health.score} />
            <ContextRow label="质量问题" value={radar.summary.quality_issue_count} />
            <ContextRow label="最近同步" value={fmtDateTime(radar.summary.last_sync_at)} />
          </ContextSection>
        </>
      ),
    })
    return () => setContextPanel(null)
  }, [radar, setContextPanel, syncRate])

  const columns = useMemo<TableColumn<DataAssetPhysicalTable>[]>(
    () => [
      {
        key: 'display_name',
        title: '表',
        render: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-1">{row.display_name || row.table_name}</div>
            <div className="mt-0.5 text-[11px] text-3">{row.table_name}</div>
          </div>
        ),
      },
      { key: 'datasource_name', title: '数据源', render: (row) => row.datasource_name },
      {
        key: 'namespace',
        title: '库 / Schema',
        render: (row) => [row.database, row.schema].filter(Boolean).join(' / ') || '-',
      },
      { key: 'field_count', title: '字段', align: 'right', render: (row) => fmtNumber(row.field_count) },
      { key: 'row_count', title: '行数', align: 'right', render: (row) => fmtNumber(row.row_count) },
      {
        key: 'sync_status',
        title: '同步状态',
        render: (row) => <StatusChip status={row.sync_status} />,
      },
    ],
    [],
  )

  const activeLabel = VIEW_META.find((item) => item.view === view)?.label ?? '资产雷达'
  const syncNotice = syncMessage ?? (view === 'sync-runs' ? formatLatestSyncNotice(syncRuns[0]) : null)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="scroll-thin flex-1 overflow-auto p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-3">
              <Database size={13} /> 数据资产底座
            </div>
            <h1 className="mt-1 text-xl font-semibold text-1">{activeLabel}</h1>
            <p className="mt-1 max-w-3xl text-xs text-3">
              汇总物理表、字段、血缘、质量和同步任务，为语义建模提供可复用的元数据事实层；Dataset 类型资产通过 asset_type='dataset' 表达。
            </p>
          </div>
          {view === 'sync-runs' ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="刷新同步记录">
                <RefreshCw size={12} /> 刷新
              </Button>
              <Button size="sm" variant="primary" onClick={() => void handleSync()} disabled={syncing}>
                <RefreshCw size={12} /> {syncing ? '同步中...' : '同步元数据'}
              </Button>
            </div>
          ) : null}
        </div>

        {syncNotice ? (
          <div className="mb-3 rounded-md border px-3 py-2 text-xs text-2" style={{ borderColor: 'var(--border)' }}>
            {syncNotice}
          </div>
        ) : null}

        {error ? (
          <Card>
            <CardBody className="px-6 py-10 text-center text-sm text-danger">{error}</CardBody>
          </Card>
        ) : loading ? (
          <Card>
            <CardBody className="px-6 py-10 text-center text-sm text-3">{t('common.loading', '加载中…')}</CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            {view === 'radar' ? <RadarSection radar={radar} syncRate={syncRate} /> : null}
            {view === 'radar' ? <DriftSummary issues={driftIssues} /> : null}
            {view === 'radar' || view === 'tables' ? (
              <TablesSection
                tables={tables}
                columns={columns}
                keyword={tableKeyword}
                page={tablePage}
                pageSize={TABLE_PAGE_SIZE}
                total={tableTotal}
                sourceFilter={sourceFilter}
                databaseFilter={databaseFilter}
                schemaFilter={schemaFilter}
                syncStatusFilter={syncStatusFilter}
                onKeywordChange={handleTableKeywordChange}
                onSourceFilterChange={handleSourceFilterChange}
                onDatabaseFilterChange={handleDatabaseFilterChange}
                onSchemaFilterChange={handleSchemaFilterChange}
                onSyncStatusFilterChange={handleSyncStatusFilterChange}
                onPageChange={setTablePage}
              />
            ) : null}
            {view !== 'radar' && view !== 'tables' && view !== 'sync-runs' ? (
              <SelectedTableControl
                tables={tables}
                selectedTableId={selectedTableId}
                onSelectedTableChange={setSelectedTableId}
              />
            ) : null}
            {view === 'quality' ? (
              <TableProfileSection tables={tables} evidence={evidence} selectedTableId={selectedTableId} />
            ) : null}
            {view === 'fields' ? (
              <FieldProfileSection
                fields={fields}
                semanticCandidates={fieldSemantics}
                semanticError={fieldSemanticError}
                semanticLoading={fieldSemanticLoading}
                selectedTableId={selectedTableId}
                onInferSemantics={handleInferFieldSemantics}
              />
            ) : null}
            {view === 'lineage' ? <LineageUsageSection evidence={evidence} /> : null}
            {view === 'sync-runs' ? <SyncRunsSection syncRuns={syncRuns} /> : null}
          </div>
        )}
      </div>
    </div>
  )
}

function RadarSection({ radar, syncRate }: { radar: DataAssetRadarResponse; syncRate: number }) {
  const cards = [
    { label: '健康分', value: radar.health.score, hint: radar.health.label },
    { label: '物理表', value: radar.summary.physical_table_count, hint: `已同步 ${radar.summary.synced_table_count}` },
    { label: '字段', value: radar.summary.field_count, hint: '字段画像候选' },
    { label: '血缘边', value: radar.summary.lineage_edge_count, hint: '表级依赖' },
    { label: '质量问题', value: radar.summary.quality_issue_count, hint: radar.health.label },
  ]

  return (
    <Card>
      <CardHead
        title="底座健康概览"
        subtitle={`健康分 ${radar.health.score} · 同步覆盖 ${syncRate}% · 最近同步 ${fmtDateTime(radar.summary.last_sync_at)}`}
        actions={<Chip tone={radar.health.level === 'healthy' ? 'success' : 'warning'}>{radar.health.label}</Chip>}
      />
      <CardBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {cards.map((card) => (
            <div key={card.label} className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[11px] text-3">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold text-1">{fmtNumber(card.value)}</div>
              <div className="mt-1 text-[11px] text-3">{card.hint}</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function DriftSummary({ issues }: { issues: SemanticGovernanceIssue[] }) {
  if (issues.length === 0) return null

  return (
    <Card>
      <CardHead
        title="Schema 漂移风险"
        subtitle={`复用语义治理接口发现 ${fmtNumber(issues.length)} 条资产快照漂移信号`}
      />
      <CardBody>
        <div className="space-y-2">
          {issues.map((issue) => {
            const title = issue.object_name || issue.title || issue.code
            const message = issue.message || issue.code
            return (
              <div key={issue.id} className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-1">{title}</div>
                    <div className="mt-1 text-xs text-3">{message}</div>
                  </div>
                  <Chip tone={governanceIssueTone(issue.severity)}>{issue.severity}</Chip>
                </div>
                <div className="mt-2 text-[11px] text-3">{issue.code}</div>
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}

function governanceIssueTone(severity: string): 'danger' | 'warning' | 'neutral' {
  if (severity === 'error' || severity === 'critical') return 'danger'
  if (severity === 'warn' || severity === 'warning') return 'warning'
  return 'neutral'
}

function TablesSection({
  tables,
  columns,
  keyword,
  page,
  pageSize,
  total,
  sourceFilter,
  databaseFilter,
  schemaFilter,
  syncStatusFilter,
  onKeywordChange,
  onSourceFilterChange,
  onDatabaseFilterChange,
  onSchemaFilterChange,
  onSyncStatusFilterChange,
  onPageChange,
}: {
  tables: DataAssetPhysicalTable[]
  columns: TableColumn<DataAssetPhysicalTable>[]
  keyword: string
  page: number
  pageSize: number
  total: number
  sourceFilter: string
  databaseFilter: string
  schemaFilter: string
  syncStatusFilter: string
  onKeywordChange: (value: string) => void
  onSourceFilterChange: (value: string) => void
  onDatabaseFilterChange: (value: string) => void
  onSchemaFilterChange: (value: string) => void
  onSyncStatusFilterChange: (value: string) => void
  onPageChange: (page: number) => void
}) {
  return (
    <Card>
      <CardHead title="物理表列表" subtitle="当前已纳入资产底座的物理表" />
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <ToolbarSearch
            value={keyword}
            onChange={onKeywordChange}
            placeholder="筛选表名 / 数据源 / Schema"
            ariaLabel="筛选物理表"
            width={260}
          />
          <div className="text-xs text-3">共 {fmtNumber(total)} 张表</div>
        </div>
        <div className="mb-3">
          <TableFilters
            source={sourceFilter}
            database={databaseFilter}
            schema={schemaFilter}
            syncStatus={syncStatusFilter}
            onSourceChange={onSourceFilterChange}
            onDatabaseChange={onDatabaseFilterChange}
            onSchemaChange={onSchemaFilterChange}
            onSyncStatusChange={onSyncStatusFilterChange}
          />
        </div>
        <Table
          columns={columns}
          rows={tables}
          rowKey={(row) => row.id}
          emptyText="暂无物理表，请先同步元数据。"
        />
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          alwaysShow
        />
      </CardBody>
    </Card>
  )
}

function TableFilters({
  source,
  database,
  schema,
  syncStatus,
  onSourceChange,
  onDatabaseChange,
  onSchemaChange,
  onSyncStatusChange,
}: {
  source: string
  database: string
  schema: string
  syncStatus: string
  onSourceChange: (value: string) => void
  onDatabaseChange: (value: string) => void
  onSchemaChange: (value: string) => void
  onSyncStatusChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <Input
        aria-label="筛选数据源"
        className="h-8 text-xs"
        value={source}
        onChange={(event) => onSourceChange(event.target.value)}
        placeholder="数据源"
      />
      <Input
        aria-label="筛选库"
        className="h-8 text-xs"
        value={database}
        onChange={(event) => onDatabaseChange(event.target.value)}
        placeholder="库 / Project"
      />
      <Input
        aria-label="筛选 Schema"
        className="h-8 text-xs"
        value={schema}
        onChange={(event) => onSchemaChange(event.target.value)}
        placeholder="Schema"
      />
      <Select
        aria-label="筛选同步状态"
        className="h-8 text-xs"
        value={syncStatus}
        onChange={(event) => onSyncStatusChange(event.target.value)}
      >
        <option value="">全部状态</option>
        <option value="success">同步成功</option>
        <option value="drift_risk">漂移风险</option>
        <option value="failed">同步失败</option>
      </Select>
    </div>
  )
}

function SelectedTableControl({
  tables,
  selectedTableId,
  onSelectedTableChange,
}: {
  tables: DataAssetPhysicalTable[]
  selectedTableId: string | null
  onSelectedTableChange: (tableId: string) => void
}) {
  if (tables.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-3" htmlFor="asset-selected-table">画像表</label>
      <Select
        id="asset-selected-table"
        aria-label="选择画像物理表"
        className="h-8 min-w-72 text-xs"
        value={selectedTableId ?? tables[0].id}
        onChange={(event) => onSelectedTableChange(event.target.value)}
      >
        {tables.map((table) => (
          <option key={table.id} value={table.id}>
            {(table.display_name || table.table_name) + ' / ' + table.datasource_name}
          </option>
        ))}
      </Select>
    </div>
  )
}

function TableProfileSection({
  tables,
  evidence,
  selectedTableId,
}: {
  tables: DataAssetPhysicalTable[]
  evidence: DataAssetEvidenceBundle | null
  selectedTableId: string | null
}) {
  const profile = asRecord(evidence?.sample_profile)
  const partitionCount = profileNumber(profile, 'partition_count')
  const profileStatus = profileString(profile, 'profile_status') || 'unknown'

  return (
    <Card>
      <CardHead title="表画像明细" subtitle="表级行数、分区、刷新状态和同步信号" />
      <CardBody>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tables.length > 0 ? tables.map((table) => {
            const isSelected = table.id === selectedTableId
            const rowCount = isSelected ? profileNumber(profile, 'row_count') ?? table.row_count : table.row_count
            return (
              <div key={table.id} className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-1">{table.display_name || table.table_name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-3">{table.datasource_name}</div>
                  </div>
                  <StatusChip status={table.sync_status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <MetricCell label="行数" value={fmtNumber(rowCount)} />
                  <MetricCell label="字段" value={fmtNumber(table.field_count)} />
                  <MetricCell label="分区" value={isSelected ? fmtNumber(partitionCount) : '-'} />
                  <MetricCell label="画像状态" value={isSelected ? profileStatus : '-'} />
                </div>
                <div className="mt-3 text-[11px] text-3">最近更新 {fmtDateTime(table.updated_at)}</div>
              </div>
            )
          }) : (
            <EmptyBlock>暂无表画像，请先同步元数据。</EmptyBlock>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function FieldProfileSection({
  fields,
  semanticCandidates,
  semanticError,
  semanticLoading,
  selectedTableId,
  onInferSemantics,
}: {
  fields: DataAssetFieldProfile[]
  semanticCandidates: DataAssetFieldSemanticCandidate[]
  semanticError: string | null
  semanticLoading: boolean
  selectedTableId: string | null
  onInferSemantics: () => void
}) {
  const columns = useMemo<TableColumn<DataAssetFieldProfile>[]>(
    () => [
      {
        key: 'name',
        title: '字段',
        render: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-1">{row.name}</div>
            {row.comment ? <div className="mt-0.5 text-[11px] text-3">{row.comment}</div> : null}
          </div>
        ),
      },
      { key: 'data_type', title: '类型', render: (row) => row.data_type },
      { key: 'nullable', title: '可空', render: (row) => (row.nullable ? '是' : '否') },
      {
        key: 'null_rate',
        title: '空值率',
        align: 'right',
        render: (row) => `空值率 ${fmtProfileNumber(row.profile?.null_rate)}`,
      },
      {
        key: 'cardinality',
        title: '基数',
        align: 'right',
        render: (row) => `基数 ${fmtProfileNumber(row.profile?.cardinality)}`,
      },
    ],
    [],
  )

  return (
    <Card>
      <CardHead
        title="字段画像明细"
        subtitle="字段类型、注释、空值率与基数线索"
        extra={
          <Button size="sm" variant="ghost" disabled={!selectedTableId || fields.length === 0 || semanticLoading} onClick={onInferSemantics}>
            {semanticLoading ? t('assets.fieldSemantic.running', '识别中...') : t('assets.fieldSemantic.action', '一键识别语义')}
          </Button>
        }
      />
      <CardBody>
        {semanticError ? (
          <div className="mb-3 rounded border px-3 py-2 text-xs text-danger" style={{ borderColor: 'var(--border)' }}>
            {semanticError}
          </div>
        ) : null}
        {semanticCandidates.length > 0 ? <FieldSemanticCandidatePanel candidates={semanticCandidates} /> : null}
        <Table
          columns={columns}
          rows={fields}
          rowKey={(row) => row.id}
          emptyText={t('assets.fields.empty', '暂无字段画像，请先同步元数据。')}
        />
      </CardBody>
    </Card>
  )
}

function FieldSemanticCandidatePanel({ candidates }: { candidates: DataAssetFieldSemanticCandidate[] }) {
  return (
    <div className="mb-3 rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-1">{t('assets.fieldSemantic.title', '字段语义候选')}</div>
        <Chip tone="accent">{candidates.length} 项</Chip>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {candidates.slice(0, 8).map((candidate, index) => {
          const field = String(candidate.field ?? candidate.name ?? `field-${index + 1}`)
          const label = String(candidate.label ?? candidate.semantic_type ?? candidate.role ?? t('assets.fieldSemantic.pending', '待确认语义'))
          const confidence = typeof candidate.confidence === 'number' ? `${Math.round(candidate.confidence * 100)}%` : '—'
          return (
            <div key={`${field}:${index}`} className="rounded bg-[var(--bg-surface)] px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-1">{field}</code>
                <Chip tone="neutral">{confidence}</Chip>
              </div>
              <div className="mt-1 text-2">{label}</div>
              {candidate.evidence?.length ? <div className="mt-1 text-[11px] text-3">{candidate.evidence.slice(0, 2).join('；')}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineageUsageSection({ evidence }: { evidence: DataAssetEvidenceBundle | null }) {
  const usageItems = evidence?.usage_evidence ?? []
  const lineageItems = evidence?.lineage_evidence ?? []

  return (
    <Card>
      <CardHead title="血缘使用明细" subtitle="SQL 使用记录、Cube 引用和上下游依赖线索" />
      <CardBody>
        <div className="grid gap-3 lg:grid-cols-2">
          <EvidenceList
            title="使用记录"
            emptyText="暂无使用记录。"
            items={usageItems}
            renderItem={(item, index) => (
              <div key={`usage-${index}`} className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium text-1">{displayRecordValue(item, 'source_ref')}</div>
                <div className="mt-1 text-[11px] text-3">{displayRecordValue(item, 'source_type')}</div>
                <div className="mt-3 text-[11px] text-3">使用次数 {displayRecordValue(item, 'usage_count')}</div>
              </div>
            )}
          />
          <EvidenceList
            title="血缘边"
            emptyText="暂无血缘记录。"
            items={lineageItems}
            renderItem={(item, index) => (
              <div key={`lineage-${index}`} className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium text-1">{displayRecordValue(item, 'target_ref')}</div>
                <div className="mt-1 text-[11px] text-3">{displayRecordValue(item, 'target_type')}</div>
                <div className="mt-3 text-[11px] text-3">关系 {displayRecordValue(item, 'relation_type')}</div>
              </div>
            )}
          />
        </div>
      </CardBody>
    </Card>
  )
}

function SyncRunsSection({ syncRuns }: { syncRuns: DataAssetSyncRun[] }) {
  const columns = useMemo<TableColumn<DataAssetSyncRun>[]>(
    () => [
      { key: 'id', title: '批次', render: (row) => row.id },
      { key: 'source_id', title: '数据源', render: (row) => row.source_id || '-' },
      { key: 'status', title: '状态', render: (row) => <Chip>{row.status}</Chip> },
      { key: 'started_at', title: '开始时间', render: (row) => fmtDateTime(row.started_at) },
      { key: 'finished_at', title: '结束时间', render: (row) => fmtDateTime(row.finished_at) },
      { key: 'stats', title: '统计', render: (row) => formatStats(row.stats) },
    ],
    [],
  )

  return (
    <Card>
      <CardHead title="元数据同步记录" subtitle="同步批次、状态和写入统计" />
      <CardBody>
        <Table
          columns={columns}
          rows={syncRuns}
          rowKey={(row) => row.id}
          emptyText="暂无同步记录。"
        />
        <div className="mt-3 space-y-2">
          {syncRuns.flatMap((run) => failedSourceDetails(run)).map((item) => (
            <div key={item.key} className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="font-medium text-1">{item.sourceLabel}</div>
              <div className="mt-1 text-danger">{item.message}</div>
              <div className="mt-1 text-3">同步批次 {item.syncRunId}</div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-surface-2)] px-2.5 py-2">
      <div className="text-[11px] text-3">{label}</div>
      <div className="mt-1 font-medium text-1">{value}</div>
    </div>
  )
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border p-4 text-xs text-3" style={{ borderColor: 'var(--border)' }}>
      {children}
    </div>
  )
}

function EvidenceList({
  title,
  emptyText,
  items,
  renderItem,
}: {
  title: string
  emptyText: string
  items: Array<Record<string, unknown>>
  renderItem: (item: Record<string, unknown>, index: number) => ReactNode
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-1">{title}</div>
      <div className="space-y-2">
        {items.length > 0 ? items.map(renderItem) : <EmptyBlock>{emptyText}</EmptyBlock>}
      </div>
    </div>
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function profileNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' ? value : null
}

function profileString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function buildTableListParams({
  keyword,
  page,
  source,
  database,
  schema,
  syncStatus,
}: {
  keyword: string
  page: number
  source: string
  database: string
  schema: string
  syncStatus: string
}): DataAssetPhysicalTableListParams {
  const params: DataAssetPhysicalTableListParams = {
    q: keyword.trim() || undefined,
    page,
    page_size: TABLE_PAGE_SIZE,
  }
  const normalizedSource = source.trim()
  const normalizedDatabase = database.trim()
  const normalizedSchema = schema.trim()
  if (normalizedSource) params.source_id = normalizedSource
  if (normalizedDatabase) params.database = normalizedDatabase
  if (normalizedSchema) params.schema = normalizedSchema
  if (syncStatus) params.sync_status = syncStatus
  return params
}

function fmtProfileNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : '-'
}

function formatSyncMessage(result: DataAssetMetadataSyncResponse) {
  if (result.status === 'failed') {
    return `同步失败：${result.error_message || result.sync_run_id}`
  }
  const tableCount = syncStatNumber(result.stats, 'table_count')
  const fieldCount = syncStatNumber(result.stats, 'field_count')
  const warning = formatFailedSourceWarning(result.stats)
  return `同步完成：写入 ${fmtNumber(tableCount)} 张表 / ${fmtNumber(fieldCount)} 个字段${warning}`
}

function formatLatestSyncNotice(run: DataAssetSyncRun | undefined) {
  if (!run) return null
  if (run.status === 'failed') {
    return `最近同步失败：${run.error_message || run.id}`
  }
  const tableCount = syncStatNumber(run.stats, 'table_count')
  const fieldCount = syncStatNumber(run.stats, 'field_count')
  const warning = formatFailedSourceWarning(run.stats)
  const statusText = run.status === 'success' ? '成功' : run.status
  return `最近同步：${statusText}，写入 ${fmtNumber(tableCount)} 张表 / ${fmtNumber(fieldCount)} 个字段${warning}`
}

function syncStatNumber(stats: Record<string, unknown> | null | undefined, key: string) {
  const value = stats?.[key]
  return typeof value === 'number' ? value : 0
}

function formatFailedSourceWarning(stats: Record<string, unknown> | null | undefined) {
  const failedSourceCount = syncStatNumber(stats, 'failed_source_count')
  if (failedSourceCount <= 0) return ''

  const names = failedSourceNames(stats)
  if (names.length > 0) {
    return `，失败数据源：${names.join('、')}`
  }
  return `，${failedSourceCount} 个数据源失败`
}

function failedSourceNames(stats: Record<string, unknown> | null | undefined) {
  const sourceErrors = stats?.source_errors
  if (!Array.isArray(sourceErrors)) return []

  return Array.from(new Set(sourceErrors
    .map((item) => {
      const record = asRecord(item)
      return profileString(record, 'source_id') || profileString(record, 'source') || profileString(record, 'name')
    })
    .filter((value): value is string => Boolean(value))))
}

function failedSourceDetails(run: DataAssetSyncRun) {
  const sourceErrors = run.stats?.source_errors
  if (!Array.isArray(sourceErrors)) return []

  return sourceErrors.map((item, index) => {
    const record = asRecord(item)
    const sourceParts = [
      profileString(record, 'source_id'),
      profileString(record, 'source'),
      profileString(record, 'name'),
    ].filter((value): value is string => Boolean(value))
    const sourceLabel = Array.from(new Set(sourceParts)).join(' / ') || run.source_id || '未知数据源'
    const message = profileString(record, 'message') || run.error_message || '同步失败'
    return {
      key: `${run.id}-${sourceLabel}-${message}-${index}`,
      syncRunId: run.id,
      sourceLabel,
      message,
    }
  })
}

function displayRecordValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (value == null || value === '') return '-'
  return typeof value === 'number' ? value.toLocaleString('zh-CN') : String(value)
}

function formatStats(stats: Record<string, unknown> | null | undefined) {
  if (!stats) return '-'
  const tableCount = displayRecordValue(stats, 'table_count')
  const fieldCount = displayRecordValue(stats, 'field_count')
  return `表 ${tableCount} / 字段 ${fieldCount}${formatFailedSourceWarning(stats)}`
}

function StatusChip({ status }: { status: string }) {
  const normalized = normalizeDataAssetSyncStatus(status)
  if (normalized === 'synced') return <Chip tone="success">已同步</Chip>
  if (normalized === 'failed') return <Chip tone="danger">失败</Chip>
  if (normalized === 'pending') return <Chip tone="warning">待同步</Chip>
  return <Chip>{status || '未知'}</Chip>
}

export default function Assets() {
  return <AssetWorkspace view="radar" />
}
