import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Boxes,
  ServerCog,
  ShieldCheck,
  Table2,
} from 'lucide-react'
import { useDatasources, useTestConnection } from '@v2/hooks/datasources'
import { useDatasets } from '@v2/hooks/datasets'
import type { Datasource } from '@v2/api/datasources'
import type { Dataset } from '@v2/api/datasets'
import { Button, Table, type TableColumn } from '@v2/components/ui'
import { CreateButton, RefreshButton, Toolbar, ToolbarSearch } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import { useToast } from '@v2/components/ui/Toast'
import { useAppShell } from '@v2/layout/AppShell'
import { fmtDateTime } from '@v2/lib/format'
import { isConnectedDatasourceStatus, normalizeDatasourceConnectionStatus } from '@v2/lib/factSources'
import { t } from '@v2/i18n'
import {
  connectionStatusChip,
  datasourceTypeLabel,
  DatasourceTypeIcon,
} from './_shared/datasource-detail-content'
import { syncStatusChip } from './_shared/dataset-detail-content'
import { DATA_CENTER_TABS, dataCenterTabFromPath } from './_shared/data-center-tabs'

function assetSourceId(asset: Dataset): number | null {
  return asset.source_id ?? asset.datasource_id ?? null
}

function assetSourceName(asset: Dataset, sourceNameById: Map<number, string>): string {
  const sourceId = assetSourceId(asset)
  if (sourceId != null) return asset.datasource_name ?? sourceNameById.get(sourceId) ?? `#${sourceId}`
  return asset.datasource_name ?? '-'
}

export default function DataCenter() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [testingId, setTestingId] = useState<number | null>(null)
  const activeTab = dataCenterTabFromPath(location.pathname)
  const activeTabItem = DATA_CENTER_TABS.find((tab) => tab.id === activeTab) ?? DATA_CENTER_TABS[0]

  const datasources = useDatasources({ page: 1, page_size: 100 })
  const datasets = useDatasets({ page: 1, page_size: 100 })
  const testConnection = useTestConnection()

  const sourceRows = useMemo(() => datasources.data?.items ?? [], [datasources.data?.items])
  const assetRows = useMemo(() => datasets.data?.items ?? [], [datasets.data?.items])

  const sourceNameById = useMemo(() => {
    const map = new Map<number, string>()
    for (const source of sourceRows) map.set(source.id, source.name)
    return map
  }, [sourceRows])

  const assetCountBySource = useMemo(() => {
    const map = new Map<number, number>()
    for (const asset of assetRows) {
      const sourceId = assetSourceId(asset)
      if (sourceId == null) continue
      map.set(sourceId, (map.get(sourceId) ?? 0) + 1)
    }
    return map
  }, [assetRows])

  const filteredSources = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return sourceRows
    return sourceRows.filter((source) =>
      [source.name, source.description, datasourceTypeLabel(source.source_type)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [keyword, sourceRows])

  const filteredAssets = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (!query) return assetRows
    return assetRows.filter((asset) =>
      [
        asset.dataset_name,
        asset.dataset_code,
        asset.physical_table,
        asset.owner,
        assetSourceName(asset, sourceNameById),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [assetRows, keyword, sourceNameById])

  const summary = useMemo(() => {
    const connected = sourceRows.filter((source) => isConnectedDatasourceStatus(source.connection_status)).length
    const failedConnections = sourceRows.filter(
      (source) => normalizeDatasourceConnectionStatus(source.connection_status) === 'failed',
    ).length
    const pendingConnections = sourceRows.filter(
      (source) => normalizeDatasourceConnectionStatus(source.connection_status) === 'unknown',
    ).length
    const failedAssets = assetRows.filter((asset) => asset.sync_status === 'failed').length
    const syncedAssets = assetRows.filter((asset) => asset.sync_status === 'synced').length
    return {
      connected,
      failedConnections,
      pendingConnections,
      failedAssets,
      syncedAssets,
      sourceTotal: sourceRows.length,
      assetTotal: assetRows.length,
    }
  }, [assetRows, sourceRows])

  const handleRefreshAll = useCallback(async () => {
    const [sourceResult, assetResult] = await Promise.all([datasources.refetch(), datasets.refetch()])
    const ok = sourceResult.status === 'success' && assetResult.status === 'success'
    toast.show({
      title: ok ? t('dataCenter.toast.refreshed', '已刷新数据中心') : t('dataCenter.toast.partial', '刷新未完成'),
      description: ok
        ? t('dataCenter.toast.refreshedDesc', '连接、资产与同步摘要已更新。')
        : t('dataCenter.toast.partialDesc', '部分数据加载失败，请查看页面错误态。'),
      tone: ok ? 'success' : 'warning',
    })
  }, [datasources, datasets, toast])

  const handleTestConnection = useCallback(
    async (source: Datasource) => {
      if (testingId != null) return
      setTestingId(source.id)
      try {
        const result = await testConnection.mutateAsync(source.id)
        toast.show({
          title: result.ok ? t('dataCenter.toast.testPassed', '连接测试通过') : t('dataCenter.toast.testFailed', '连接测试未通过'),
          description: `${source.name} · ${result.message || result.error_message || ''}`.trim(),
          tone: result.ok ? 'success' : 'danger',
        })
        await datasources.refetch()
      } catch (error) {
        toast.show({
          title: t('dataCenter.toast.testFailed', '连接测试未通过'),
          description: error instanceof Error ? error.message : source.name,
          tone: 'danger',
        })
      } finally {
        setTestingId(null)
      }
    },
    [datasources, testConnection, testingId, toast],
  )

  useEffect(() => {
    setBreadcrumbs([t('dataCenter.breadcrumb.data', '数据'), activeTabItem.label])
  }, [activeTabItem.label, setBreadcrumbs])

  useEffect(() => {
    const primaryAction =
      activeTab === 'assets'
        ? { label: t('dataCenter.action.registerAsset', '登记资产'), to: '/data-center/assets/register' }
        : activeTab === 'sync'
          ? { label: t('dataCenter.action.createTask', '新建任务'), to: '/data-center/sync/tasks/new' }
          : activeTab === 'impact'
            ? null
            : { label: t('dataCenter.action.createConnection', '新建连接'), to: '/data-center/connections/new' }

    setTopBarActions(
      <Toolbar>
        <RefreshButton
          onClick={() => void handleRefreshAll()}
          loading={datasources.isFetching || datasets.isFetching}
          label={t('dataCenter.action.refresh', '刷新数据中心')}
          ariaLabel={t('dataCenter.action.refresh', '刷新数据中心')}
        />
        {primaryAction ? (
          <CreateButton label={primaryAction.label} onClick={() => navigate(primaryAction.to)} />
        ) : null}
      </Toolbar>,
    )
    return () => setTopBarActions(null)
  }, [activeTab, datasources.isFetching, datasets.isFetching, handleRefreshAll, navigate, setTopBarActions])

  useEffect(() => {
    const items = [
      summary.failedConnections > 0
        ? t('dataCenter.ctx.failedConnections', '{n} 个连接异常，优先检查连接健康。', { n: summary.failedConnections })
        : null,
      summary.pendingConnections > 0
        ? t('dataCenter.ctx.pendingConnections', '{n} 个连接待测试。', { n: summary.pendingConnections })
        : null,
      summary.failedAssets > 0
        ? t('dataCenter.ctx.failedAssets', '{n} 个资产同步失败。', { n: summary.failedAssets })
        : null,
    ].filter(Boolean) as string[]

    setContextPanel({
      title: t('dataCenter.ctx.title', '数据健康'),
      subtitle:
        items.length > 0
          ? t('dataCenter.ctx.hasIssues', '{n} 项待处理', { n: items.length })
          : t('dataCenter.ctx.noIssues', '当前无阻断项'),
      body: (
        <div className="space-y-4 px-4 py-4 text-xs">
          <ContextSection title={t('dataCenter.ctx.currentData', '当前数据')}>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label={t('dataCenter.unit.connection', '连接')} value={summary.sourceTotal} />
              <MiniStat label={t('dataCenter.unit.asset', '资产')} value={summary.assetTotal} />
            </div>
          </ContextSection>
          <ContextSection title={t('dataCenter.ctx.todo', '待处理')}>
            {items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item} className="rounded-md border px-3 py-2 leading-5 text-2" style={{ borderColor: 'var(--border)' }}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border px-3 py-2 leading-5 text-3" style={{ borderColor: 'var(--border)' }}>
                {t('dataCenter.ctx.noTodo', '连接和资产同步状态正常。')}
              </div>
            )}
          </ContextSection>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [setContextPanel, summary])

  const loading = datasources.isLoading || datasets.isLoading
  const error = datasources.error ?? datasets.error
  const isError = datasources.isError || datasets.isError

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
        {isError ? (
          <RetryState
            message={error instanceof Error ? error.message : t('dataCenter.error.loadFailed', '加载数据中心失败')}
            onRetry={() => void handleRefreshAll()}
            retryAriaLabel={t('dataCenter.error.retry', '重试加载数据中心')}
          />
        ) : loading ? (
          <DataCenterSkeleton />
        ) : (
          <>
            {activeTab === 'overview' ? (
              <OverviewPanel
                summary={summary}
                onOpenConnections={() => navigate('/data-center/connections')}
                onOpenAssets={() => navigate('/data-center/assets')}
              />
            ) : null}
            {activeTab === 'connections' ? (
              <ConnectionsPanel
                rows={filteredSources}
                keyword={keyword}
                onKeywordChange={setKeyword}
                assetCountBySource={assetCountBySource}
                testingId={testingId}
                onTestConnection={handleTestConnection}
                onOpenDetail={(source) => navigate(`/data-center/connections/${source.id}`)}
              />
            ) : null}
            {activeTab === 'assets' ? (
              <AssetsPanel
                rows={filteredAssets}
                keyword={keyword}
                onKeywordChange={setKeyword}
                sourceNameById={sourceNameById}
                onOpenDetail={(asset) => navigate(`/data-center/assets/${asset.id}`)}
              />
            ) : null}
            {activeTab === 'sync' ? (
              <SyncPanel sources={sourceRows} assets={assetRows} sourceNameById={sourceNameById} />
            ) : null}
            {activeTab === 'impact' ? (
              <ImpactPanel sources={sourceRows} assets={assetRows} sourceNameById={sourceNameById} />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

function OverviewPanel({
  summary,
  onOpenConnections,
  onOpenAssets,
}: {
  summary: {
    connected: number
    failedConnections: number
    pendingConnections: number
    failedAssets: number
    syncedAssets: number
    sourceTotal: number
    assetTotal: number
  }
  onOpenConnections: () => void
  onOpenAssets: () => void
}) {
  const risks = [
    {
      label: t('dataCenter.risk.failedConnection', '异常连接'),
      value: summary.failedConnections,
      tone: summary.failedConnections > 0 ? 'danger' : 'neutral',
    },
    {
      label: t('dataCenter.risk.pendingConnection', '待测试连接'),
      value: summary.pendingConnections,
      tone: summary.pendingConnections > 0 ? 'warning' : 'neutral',
    },
    {
      label: t('dataCenter.risk.failedAsset', '同步失败资产'),
      value: summary.failedAssets,
      tone: summary.failedAssets > 0 ? 'danger' : 'neutral',
    },
  ] as const

  return (
    <div className="space-y-4 overflow-auto scroll-thin">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard title={t('dataCenter.metric.connections', '连接总数')} value={summary.sourceTotal} icon={ServerCog} helper={t('dataCenter.metric.connectionsDesc', '可测试、可同步的外部连接')} />
        <MetricCard title={t('dataCenter.metric.connected', '连通连接')} value={summary.connected} icon={ShieldCheck} helper={t('dataCenter.metric.connectedDesc', '最近测试通过的连接')} tone="success" />
        <MetricCard title={t('dataCenter.metric.assets', '数据资产')} value={summary.assetTotal} icon={Boxes} helper={t('dataCenter.metric.assetsDesc', '已登记或可运营的表资产')} />
        <MetricCard title={t('dataCenter.metric.syncedAssets', '已同步资产')} value={summary.syncedAssets} icon={Table2} helper={t('dataCenter.metric.syncedAssetsDesc', '字段结构可用的资产')} tone="success" />
      </div>

      <div className="min-h-[280px]">
        <Panel title={t('dataCenter.overview.todo', '今日待处理')} subtitle={t('dataCenter.overview.todoDesc', '把分散的错误和未知态收敛成运营队列。')}>
          <div className="grid grid-cols-3 gap-2">
            {risks.map((risk) => (
              <RiskCard key={risk.label} label={risk.label} value={risk.value} tone={risk.tone} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <TaskCard
              icon={ServerCog}
              title={t('dataCenter.task.checkConnection', '检查连接健康')}
              description={t('dataCenter.task.checkConnectionDesc', '优先处理异常或尚未测试的数据连接。')}
              cta={t('dataCenter.task.openConnections', '进入连接管理')}
              onClick={onOpenConnections}
            />
            <TaskCard
              icon={Boxes}
              title={t('dataCenter.task.confirmAssets', '确认资产目录')}
              description={t('dataCenter.task.confirmAssetsDesc', '从已连通的数据连接沉淀可用于语义建设的表资产。')}
              cta={t('dataCenter.task.openAssets', '进入资产目录')}
              onClick={onOpenAssets}
            />
          </div>
        </Panel>
      </div>
    </div>
  )
}

function ConnectionsPanel({
  rows,
  keyword,
  onKeywordChange,
  assetCountBySource,
  testingId,
  onTestConnection,
  onOpenDetail,
}: {
  rows: Datasource[]
  keyword: string
  onKeywordChange: (value: string) => void
  assetCountBySource: Map<number, number>
  testingId: number | null
  onTestConnection: (source: Datasource) => void
  onOpenDetail: (source: Datasource) => void
}) {
  const columns = useMemo<TableColumn<Datasource>[]>(
    () => [
      {
        key: 'name',
        title: t('dataCenter.connection.col.name', '连接'),
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <DatasourceTypeIcon type={row.source_type} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-1">{row.name}</div>
              <div className="truncate text-[11px] text-3">{row.description || t('dataCenter.common.noDescription', '暂无描述')}</div>
            </div>
          </div>
        ),
      },
      {
        key: 'source_type',
        title: t('dataCenter.connection.col.type', '类型'),
        width: 120,
        render: (row) => <span className="text-xs font-medium text-2">{datasourceTypeLabel(row.source_type)}</span>,
      },
      {
        key: 'connection_status',
        title: t('dataCenter.connection.col.status', '连接状态'),
        width: 120,
        render: (row) => connectionStatusChip(testingId === row.id ? 'pending' : row.connection_status),
      },
      {
        key: 'assets',
        title: t('dataCenter.connection.col.assets', '关联资产'),
        width: 96,
        render: (row) => <span className="text-xs tabular-nums text-2">{assetCountBySource.get(row.id) ?? 0}</span>,
      },
      {
        key: 'last_test_at',
        title: t('dataCenter.connection.col.lastTest', '最近测试'),
        width: 150,
        render: (row) => <span className="text-[11px] text-3">{fmtDateTime(row.last_test_at)}</span>,
      },
      {
        key: 'actions',
        title: t('dataCenter.common.actions', '操作'),
        width: 190,
        render: (row) => (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              loading={testingId === row.id}
              disabled={testingId != null && testingId !== row.id}
              onClick={(event) => {
                event.stopPropagation()
                onTestConnection(row)
              }}
            >
              {t('dataCenter.connection.test', '测试连接')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                onOpenDetail(row)
              }}
            >
              {t('dataCenter.common.detail', '详情')}
            </Button>
          </div>
        ),
      },
    ],
    [assetCountBySource, onOpenDetail, onTestConnection, testingId],
  )

  return (
    <Panel
      title={t('dataCenter.connection.title', '连接管理')}
      subtitle={t('dataCenter.connection.subtitle', '把外部连接、凭证、连接测试和目录同步收敛到一个对象视角。')}
      toolbar={<ToolbarSearch value={keyword} onChange={onKeywordChange} placeholder={t('dataCenter.connection.search', '搜索连接名称、类型或描述…')} width={300} />}
      fullHeight
    >
      <Table columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={onOpenDetail} emptyText={t('dataCenter.connection.empty', '暂无连接')} />
    </Panel>
  )
}

function AssetsPanel({
  rows,
  keyword,
  onKeywordChange,
  sourceNameById,
  onOpenDetail,
}: {
  rows: Dataset[]
  keyword: string
  onKeywordChange: (value: string) => void
  sourceNameById: Map<number, string>
  onOpenDetail: (asset: Dataset) => void
}) {
  const navigate = useNavigate()
  const columns = useMemo<TableColumn<Dataset>[]>(
    () => [
      {
        key: 'dataset_name',
        title: t('dataCenter.asset.col.name', '资产'),
        render: (row) => (
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-1">{row.dataset_name}</div>
            <div className="truncate text-[11px] text-3">{row.physical_table ?? row.dataset_code}</div>
          </div>
        ),
      },
      {
        key: 'source',
        title: t('dataCenter.asset.col.source', '来源连接'),
        width: 180,
        render: (row) => <span className="text-xs text-2">{assetSourceName(row, sourceNameById)}</span>,
      },
      {
        key: 'owner',
        title: 'Owner',
        width: 120,
        render: (row) => <span className="text-xs text-2">{row.owner || '-'}</span>,
      },
      {
        key: 'sync_status',
        title: t('dataCenter.asset.col.sync', '同步'),
        width: 110,
        render: (row) => syncStatusChip(row.sync_status),
      },
      {
        key: 'semantic_status',
        title: t('dataCenter.asset.col.semantic', '语义状态'),
        width: 120,
        render: (row) => (
          <span
            className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
            style={{
              background: row.sync_status === 'synced' ? 'var(--accent-soft)' : 'var(--bg-surface-2)',
              color: row.sync_status === 'synced' ? 'var(--accent)' : 'var(--text-3)',
            }}
          >
            {row.sync_status === 'synced' ? t('dataCenter.asset.semanticReady', '可建模') : t('dataCenter.asset.semanticPending', '需同步')}
          </span>
        ),
      },
      {
        key: 'actions',
        title: t('dataCenter.common.actions', '操作'),
        width: 190,
        render: (row) => (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                // #8: 把所选数据集作为快速建模的源表带入，避免上下文丢失。
                navigate('/semantic/modeling-workbench/quick', {
                  state: {
                    workbenchMode: 'quick',
                    projectId: 'quick-project',
                    candidateId: 'quick-asset',
                    candidateTitle: row.dataset_name,
                    target: 'semantic_center',
                    source: row.physical_table || row.dataset_name,
                    grain: t('semantic.modelingWorkbench.fallbackGrainQuick', '待确认资产粒度'),
                    risk: 'medium',
                    evidence: [],
                  },
                })
              }}
            >
              {t('dataCenter.asset.modeling', '语义建设')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation()
                onOpenDetail(row)
              }}
            >
              {t('dataCenter.common.detail', '详情')}
            </Button>
          </div>
        ),
      },
    ],
    [navigate, onOpenDetail, sourceNameById],
  )

  return (
    <Panel
      title={t('dataCenter.asset.title', '资产目录')}
      subtitle={t('dataCenter.asset.subtitle', '把底层表和文件沉淀为用户能理解的数据资产目录。')}
      toolbar={<ToolbarSearch value={keyword} onChange={onKeywordChange} placeholder={t('dataCenter.asset.search', '搜索资产、表路径、Owner…')} width={300} />}
      fullHeight
    >
      <Table columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={onOpenDetail} emptyText={t('dataCenter.asset.empty', '暂无数据资产')} />
    </Panel>
  )
}

function SyncPanel({
  sources,
  assets,
  sourceNameById,
}: {
  sources: Datasource[]
  assets: Dataset[]
  sourceNameById: Map<number, string>
}) {
  const rows = useMemo(() => {
    const sourceRuns = sources.map((source) => ({
      id: `source-${source.id}`,
      object: source.name,
      type: t('dataCenter.sync.catalog', '目录同步'),
      status: isConnectedDatasourceStatus(source.connection_status)
        ? t('dataCenter.sync.refreshable', '可刷新')
        : t('dataCenter.sync.checkConnection', '需检查连接'),
      tone: isConnectedDatasourceStatus(source.connection_status) ? 'success' : 'danger',
      updatedAt: source.updated_at,
      owner: datasourceTypeLabel(source.source_type),
    }))
    const assetRuns = assets.slice(0, 12).map((asset) => ({
      id: `asset-${asset.id}`,
      object: asset.dataset_name,
      type: t('dataCenter.sync.fields', '字段同步'),
      status: asset.sync_status === 'synced'
        ? t('dataCenter.sync.synced', '已同步')
        : asset.sync_status === 'failed'
          ? t('dataCenter.sync.failed', '失败')
          : t('dataCenter.sync.pending', '待同步'),
      tone: asset.sync_status === 'synced' ? 'success' : asset.sync_status === 'failed' ? 'danger' : 'warning',
      updatedAt: asset.last_sync_at ?? asset.updated_at,
      owner: assetSourceName(asset, sourceNameById),
    }))
    return [...sourceRuns, ...assetRuns]
  }, [assets, sourceNameById, sources])

  const columns = useMemo<TableColumn<(typeof rows)[number]>[]>(
    () => [
      { key: 'object', title: t('dataCenter.sync.col.object', '对象'), render: (row) => <span className="text-xs font-medium text-1">{row.object}</span> },
      { key: 'type', title: t('dataCenter.sync.col.type', '任务类型'), width: 120 },
      {
        key: 'status',
        title: t('dataCenter.sync.col.status', '状态'),
        width: 130,
        render: (row) => (
          <span
            className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
            style={{
              background: row.tone === 'danger' ? 'var(--danger-soft)' : row.tone === 'warning' ? 'var(--warning-soft)' : 'var(--success-soft)',
              color: row.tone === 'danger' ? 'var(--danger)' : row.tone === 'warning' ? 'var(--warning)' : 'var(--success)',
            }}
          >
            {row.status}
          </span>
        ),
      },
      { key: 'owner', title: t('dataCenter.sync.col.source', '来源'), width: 180 },
      { key: 'updatedAt', title: t('dataCenter.sync.col.updatedAt', '最近更新'), width: 160, render: (row) => <span className="text-[11px] text-3">{fmtDateTime(row.updatedAt)}</span> },
    ],
    [],
  )

  return (
    <Panel title={t('dataCenter.sync.title', '同步任务')} subtitle={t('dataCenter.sync.subtitle', '元数据刷新、字段同步、失败重试集中在任务视角，不散落到每个页面。')} fullHeight>
      <Table columns={columns} rows={rows} rowKey={(row) => row.id} emptyText={t('dataCenter.sync.empty', '暂无同步任务')} />
    </Panel>
  )
}

function ImpactPanel({
  sources,
  assets,
  sourceNameById,
}: {
  sources: Datasource[]
  assets: Dataset[]
  sourceNameById: Map<number, string>
}) {
  const rows = useMemo(() => {
    return assets.slice(0, 16).map((asset) => ({
      id: asset.id,
      asset: asset.dataset_name,
      source: assetSourceName(asset, sourceNameById),
      semantic: asset.sync_status === 'synced' ? t('dataCenter.impact.semanticReady', '可进入语义建设') : t('dataCenter.impact.semanticPending', '等待同步'),
      blocker:
        asset.sync_status === 'synced'
          ? t('dataCenter.impact.blocker.none', '暂无阻断')
          : t('dataCenter.impact.blocker.sync', '等待资产同步'),
    }))
  }, [assets, sourceNameById])

  const columns = useMemo<TableColumn<(typeof rows)[number]>[]>(
    () => [
      { key: 'asset', title: t('dataCenter.impact.col.asset', '数据资产'), render: (row) => <span className="text-xs font-medium text-1">{row.asset}</span> },
      { key: 'source', title: t('dataCenter.impact.col.source', '来源连接'), width: 180 },
      { key: 'semantic', title: t('dataCenter.impact.col.semantic', '语义可用性'), width: 160 },
      { key: 'blocker', title: t('dataCenter.impact.col.blocker', '阻断项'), width: 160 },
    ],
    [],
  )

  const impactSummary = useMemo(() => {
    const readyAssets = assets.filter((asset) => asset.sync_status === 'synced')
    const blockedAssets = assets.filter((asset) => asset.sync_status !== 'synced')
    const assetCountBySource = new Map<number, number>()
    for (const asset of assets) {
      const sourceId = assetSourceId(asset)
      if (sourceId == null) continue
      assetCountBySource.set(sourceId, (assetCountBySource.get(sourceId) ?? 0) + 1)
    }
    const coveredSources = sources.filter((source) => (assetCountBySource.get(source.id) ?? 0) > 0)
    const pendingSources = coveredSources.filter((source) => !isConnectedDatasourceStatus(source.connection_status))

    return {
      readyAssets,
      blockedAssets,
      coveredSources,
      pendingSources,
      assetCountBySource,
    }
  }, [assets, sources])

  const actionItems = useMemo(() => {
    if (assets.length === 0) {
      return [t('dataCenter.impact.action.noAssets', '暂无可分析资产，先完成连接和资产同步。')]
    }
    const items: string[] = []
    if (impactSummary.blockedAssets.length > 0) {
      items.push(t('dataCenter.impact.action.blockedAssets', '{n} 个资产未完成同步，暂不进入语义建设。', { n: impactSummary.blockedAssets.length }))
    }
    if (impactSummary.pendingSources.length > 0) {
      items.push(t('dataCenter.impact.action.pendingSources', '{n} 个来源连接未连通，可能阻断资产刷新。', { n: impactSummary.pendingSources.length }))
    }
    if (items.length === 0) {
      items.push(t('dataCenter.impact.action.allClear', '暂无阻断项，已同步资产可继续进入语义建设。'))
    }
    return items
  }, [assets.length, impactSummary.blockedAssets.length, impactSummary.pendingSources.length])

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1fr_300px] gap-4">
      <Panel title={t('dataCenter.impact.title', '影响准备度')} subtitle={t('dataCenter.impact.subtitle', '基于资产同步状态和来源连接判断资产是否可进入语义建设。')} fullHeight>
        <Table columns={columns} rows={rows} rowKey={(row) => row.id} emptyText={t('dataCenter.impact.empty', '暂无资产影响准备度')} />
      </Panel>
      <Panel title={t('dataCenter.impact.summary.title', '准备度摘要')} subtitle={t('dataCenter.impact.summary.subtitle', '从资产可用性、阻断项和来源覆盖判断建设风险。')}>
        <div className="grid grid-cols-2 gap-2">
          <ImpactStat label={t('dataCenter.impact.summary.readyAssets', '可建模资产')} value={impactSummary.readyAssets.length} helper={t('dataCenter.impact.summary.readyAssetsDesc', '已同步，可进入语义建设')} />
          <ImpactStat label={t('dataCenter.impact.summary.blockedAssets', '待补齐资产')} value={impactSummary.blockedAssets.length} helper={t('dataCenter.impact.summary.blockedAssetsDesc', '未同步或失败，暂不进入建设')} tone={impactSummary.blockedAssets.length > 0 ? 'warning' : 'neutral'} />
          <ImpactStat label={t('dataCenter.impact.summary.coveredSources', '涉及连接')} value={impactSummary.coveredSources.length} helper={t('dataCenter.impact.summary.coveredSourcesDesc', '当前资产覆盖的来源连接')} />
          <ImpactStat label={t('dataCenter.impact.summary.pendingSources', '待检查连接')} value={impactSummary.pendingSources.length} helper={t('dataCenter.impact.summary.pendingSourcesDesc', '可能影响资产刷新')} tone={impactSummary.pendingSources.length > 0 ? 'warning' : 'neutral'} />
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-3">{t('dataCenter.impact.summary.actions', '待处理影响')}</div>
          <div className="space-y-2">
            {actionItems.map((item) => (
              <ImpactActionItem key={item} label={item} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-3">{t('dataCenter.impact.summary.sources', '来源覆盖')}</div>
          <div className="space-y-2">
            {impactSummary.coveredSources.length > 0 ? (
              impactSummary.coveredSources.slice(0, 4).map((source) => (
                <ImpactSourceRow
                  key={source.id}
                  source={source}
                  assetCount={impactSummary.assetCountBySource.get(source.id) ?? 0}
                />
              ))
            ) : (
              <div className="rounded-md border px-3 py-2 text-[12px] text-3" style={{ borderColor: 'var(--border)' }}>
                {t('dataCenter.impact.summary.noSources', '暂无资产来源覆盖')}
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  )
}

function ImpactStat({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string
  value: number
  helper: string
  tone?: 'neutral' | 'warning'
}) {
  const color = tone === 'warning' ? 'var(--warning)' : 'var(--text-1)'
  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="text-[11px] font-medium text-3">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-3">{helper}</div>
    </div>
  )
}

function ImpactActionItem({ label }: { label: string }) {
  return (
    <div className="flex gap-2 rounded-md border px-3 py-2 text-[12px] leading-5 text-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <AlertCircle size={14} className="mt-0.5 shrink-0 text-[color:var(--accent)]" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

function ImpactSourceRow({ source, assetCount }: { source: Datasource; assetCount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-1">{source.name}</div>
        <div className="mt-0.5 text-[11px] text-3">{t('dataCenter.impact.summary.assetCount', '{n} 个资产', { n: assetCount })}</div>
      </div>
      <div className="shrink-0">{connectionStatusChip(source.connection_status)}</div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = 'neutral',
}: {
  title: string
  value: number
  helper: string
  icon: typeof Activity
  tone?: 'neutral' | 'success'
}) {
  return (
    <div className="rounded-md border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-3">{title}</span>
        <Icon size={16} style={{ color: tone === 'success' ? 'var(--success)' : 'var(--accent)' }} />
      </div>
      <div className="mt-3 text-[26px] font-semibold tabular-nums text-1">{value}</div>
      <div className="mt-1 text-[11px] text-3">{helper}</div>
    </div>
  )
}

function RiskCard({ label, value, tone }: { label: string; value: number; tone: 'danger' | 'warning' | 'neutral' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--text-2)'
  return (
    <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="flex items-center gap-2 text-[12px] font-medium text-2">
        <AlertCircle size={14} style={{ color }} />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function TaskCard({
  icon: Icon,
  title,
  description,
  cta,
  onClick,
}: {
  icon: typeof Activity
  title: string
  description: string
  cta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="rounded-md border p-3 text-left transition-colors hover:bg-[color:var(--bg-surface-2)]"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-1">
        <Icon size={15} className="text-[color:var(--accent)]" />
        {title}
      </div>
      <p className="mt-1 text-[12px] leading-5 text-3">{description}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--accent)]">
        {cta}
        <ArrowRight size={12} />
      </div>
    </button>
  )
}

function Panel({
  title,
  subtitle,
  toolbar,
  children,
  fullHeight = false,
}: {
  title: string
  subtitle: string
  toolbar?: React.ReactNode
  children: React.ReactNode
  fullHeight?: boolean
}) {
  return (
    <section
      className={`min-h-0 rounded-md border ${fullHeight ? 'flex flex-1 flex-col overflow-hidden' : ''}`}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-1">{title}</h2>
          <p className="mt-1 text-[12px] leading-5 text-3">{subtitle}</p>
        </div>
        {toolbar ? <div className="shrink-0">{toolbar}</div> : null}
      </div>
      <div className={fullHeight ? 'min-h-0 flex-1 overflow-hidden p-3' : 'p-3'}>{children}</div>
    </section>
  )
}

function ContextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-3">{title}</div>
      {children}
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
      <div className="text-[10px] text-3">{label}</div>
      <div className="text-base font-semibold tabular-nums text-1">{value}</div>
    </div>
  )
}

function DataCenterSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-md border"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
        />
      ))}
    </div>
  )
}
