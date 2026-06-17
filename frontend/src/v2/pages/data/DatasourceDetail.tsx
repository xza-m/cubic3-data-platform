// frontend/src/v2/pages/data/DatasourceDetail.tsx
//
// 连接详情全屏页（L3）。从列表 / 直接 URL / Tab 切回均落到此处。
// B-back-4: POST /datasources/:id/test 增强字段 — 测试结果只展示后端实际返回字段
// B-back-5: GET /datasources/:id/schema — "结构" Tab 留占位

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, ServerCog, ExternalLink, Play } from 'lucide-react'
import { useDatasource, useDatasources, useTestConnection } from '@v2/hooks/datasources'
import type { Datasource, TestConnectionResult } from '@v2/api/datasources'
import { RefreshButton } from '@v2/components/CommonControls'
import { RetryState } from '@v2/components/LoadState'
import { Tab, Tabs } from '@v2/components/ui/Tabs'
import {
  connectionStatusChip,
  datasourceTypeLabel,
  datasourceTabLabel,
  DatasourceDetailContent,
  DatasourceTypeIcon,
} from './_shared/datasource-detail-content'
import { DatasourceSchemaBrowser } from './_shared/datasource-schema-browser'
import { fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

const TAB_IDS = ['overview', 'structure'] as const
type TabId = (typeof TAB_IDS)[number]

function buildTabs(): { id: TabId; label: string }[] {
  return [
    { id: 'overview',  label: t('datasourceDetail.tab.overview', '概览') },
    { id: 'structure', label: t('datasourceDetail.tab.structure', '结构') },
  ]
}

export default function DatasourceDetail() {
  const { id } = useParams<{ id: string }>()
  const numericId = Number(id)
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel, openTab } = useAppShell()
  const [tab, setTab] = useState<TabId>('overview')
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isFetching } = useDatasource(numericId)

  // 列表查询（用于邻接导航）
  const { data: listData } = useDatasources({ page: 1, page_size: 100 })

  const testConn = useTestConnection()

  // 面包屑
  useEffect(() => {
    if (!data) return
    setBreadcrumbs([
      t('datasourceDetail.breadcrumb.data', '数据'),
      t('datasourceDetail.breadcrumb.datasources', '连接管理'),
      data.name,
    ])
  }, [data, setBreadcrumbs])

  // 注册 Tab
  useEffect(() => {
    if (!data) return
    openTab({
      id: `datasource:${data.id}`,
      label: datasourceTabLabel(data),
      to: `/data-center/connections/${data.id}`,
      closeable: true,
      onClose: () => {
        navigate('/data-center/connections')
        return true
      },
    })
  }, [data, openTab, navigate])

  // TopBar
  useEffect(() => {
    setTopBarActions(
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/data-center/connections')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> {t('datasourceDetail.action.back', '返回列表')}
        </button>
        <RefreshButton
          onClick={() => refetch()}
          loading={isFetching}
          label={t('datasourceDetail.action.reload', '重新加载')}
          loadingLabel={t('datasourceDetail.action.reloading', '重新加载中…')}
          ariaLabel={t('datasourceDetail.action.reload', '重新加载')}
        />
        {data ? (
          <button
            type="button"
            onClick={async () => {
              setTestResult(null)
              setTestError(null)
              try {
                const result = await testConn.mutateAsync(data.id)
                setTestResult(result)
                if (!result.ok) {
                  setTestError(result.error_message || result.message)
                }
              } catch (e) {
                setTestError(e instanceof Error ? e.message : t('datasourceDetail.test.failed', '测试失败'))
              }
            }}
            disabled={testConn.isPending}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Play size={12} />
            {testConn.isPending
              ? t('datasourceDetail.test.running', '测试中…')
              : t('datasourceDetail.test.run', '测试连接')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(`/data-center/connections/${numericId}/edit`)}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Pencil size={12} /> {t('datasourceDetail.action.edit', '编辑')}
        </button>
      </div>,
    )
    return () => setTopBarActions(null)
  }, [setTopBarActions, refetch, isFetching, navigate, data, testConn, numericId])

  // 邻接导航
  const neighbors = useMemo(() => {
    const items = listData?.items ?? []
    if (!data) return { prev: null as Datasource | null, next: null as Datasource | null }
    const idx = items.findIndex((it) => it.id === data.id)
    if (idx < 0) return { prev: null, next: null }
    return {
      prev: items[idx - 1] ?? null,
      next: items[idx + 1] ?? null,
    }
  }, [listData?.items, data])

  // ContextPanel
  useEffect(() => {
    if (!data) return
    setContextPanel({
      title: (
        <div className="flex items-center gap-1.5">
          <ServerCog size={12} style={{ color: 'var(--text-3)' }} />
          {data.name}
        </div>
      ),
      subtitle: `${datasourceTypeLabel(data.source_type)} · #${data.id}`,
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>{t('datasourceDetail.ctx.status', '状态')}</CtxLabel>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {connectionStatusChip(data.connection_status)}
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: data.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                  color: data.is_active ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {data.is_active
                  ? t('datasourceDetail.active.on', '启用')
                  : t('datasourceDetail.active.off', '停用')}
              </span>
            </div>
          </section>
          <section>
            <CtxLabel>{t('datasourceDetail.ctx.neighbors', '邻接导航')}</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <NeighborBtn
                label={neighbors.prev ? `← ${neighbors.prev.name}` : t('datasourceDetail.neighbor.noPrev', '没有上一项')}
                disabled={!neighbors.prev}
                onClick={
                  neighbors.prev
                    ? () => navigate(`/data-center/connections/${neighbors.prev!.id}`)
                    : undefined
                }
              />
              <NeighborBtn
                label={neighbors.next ? `${neighbors.next.name} →` : t('datasourceDetail.neighbor.noNext', '没有下一项')}
                disabled={!neighbors.next}
                onClick={
                  neighbors.next
                    ? () => navigate(`/data-center/connections/${neighbors.next!.id}`)
                    : undefined
                }
              />
            </div>
          </section>
          <section>
            <CtxLabel>{t('datasourceDetail.ctx.downstream', '影响分析')}</CtxLabel>
            <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
              {t('datasourceDetail.downstream.hint', '查看基于该连接登记的数据资产、同步状态和后续语义建设入口。')}
            </p>
            <button
              type="button"
              onClick={() => navigate(`/data-center/assets?source_id=${data.id}`)}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
              style={{ color: 'var(--text-2)' }}
            >
              <ExternalLink size={11} /> {t('datasourceDetail.downstream.view', '查看关联资产')}
            </button>
          </section>
        </div>
      ),
    })
    return () => setContextPanel(null)
  }, [data, neighbors, setContextPanel, navigate])

  // ── 渲染 ─────────────────────────────────────────────────────────────────────

  if (!Number.isFinite(numericId)) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('datasourceDetail.state.invalidId', '非法的连接 ID')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        {t('datasourceDetail.state.loading', '加载中…')}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <RetryState
        className="flex-1"
        message={error instanceof Error ? error.message : t('datasourceDetail.state.loadFailed', '加载失败')}
        onRetry={() => refetch()}
        retryAriaLabel={t('datasourceDetail.action.retry', '重试加载连接')}
      />
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 页头 */}
      <header
        className="border-b px-4 py-3"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <DatasourceTypeIcon type={data.source_type} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              <span className="truncate">{data.name}</span>
              {connectionStatusChip(data.connection_status)}
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: data.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                  color: data.is_active ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {data.is_active
                  ? t('datasourceDetail.active.on', '启用')
                  : t('datasourceDetail.active.off', '停用')}
              </span>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              {datasourceTypeLabel(data.source_type)} · #{data.id} · {t('datasourceDetail.subtitle', '连接配置与同步状态')}
            </div>
          </div>
        </div>

        {/* Tab 栏 */}
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as TabId)}
          size="sm"
          bordered={false}
          aria-label={t('datasourceDetail.tabs.label', '连接详情导航')}
          className="mt-3"
        >
          {buildTabs().map((tb) => (
            <Tab
              key={tb.id}
              value={tb.id}
              id={`datasource-detail-tab-${tb.id}`}
              aria-controls={`datasource-detail-panel-${tb.id}`}
              className="rounded px-2.5"
            >
              {tb.label}
            </Tab>
          ))}
        </Tabs>
      </header>

      {/* 测试结果提示 (B-back-4) */}
      {testResult || testError ? (
        <TestResultBanner
          result={testResult}
          fallbackError={testError}
          onDismiss={() => {
            setTestResult(null)
            setTestError(null)
          }}
        />
      ) : null}

      {/* 内容 */}
      <div className="flex-1 overflow-hidden">
        {tab === 'overview' && (
          <div
            id="datasource-detail-panel-overview"
            role="tabpanel"
            aria-labelledby="datasource-detail-tab-overview"
            className="h-full overflow-auto"
          >
            <DatasourceDetailContent item={data} />
          </div>
        )}
        {tab === 'structure' && (
          <div
            id="datasource-detail-panel-structure"
            role="tabpanel"
            aria-labelledby="datasource-detail-tab-structure"
            className="h-full"
          >
            <DatasourceSchemaBrowser datasourceId={data.id} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── 内部组件 ──────────────────────────────────────────────────────────────────

function CtxLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
      {children}
    </div>
  )
}

function TestResultBanner({
  result,
  fallbackError,
  onDismiss,
}: {
  result: TestConnectionResult | null
  fallbackError: string | null
  onDismiss: () => void
}) {
  const ok = !!result?.ok
  // ok=true 即成功；其他情况一律按失败处理
  const tone = ok
    ? { bg: 'var(--success-soft)', fg: 'var(--success)' }
    : { bg: 'var(--danger-soft)', fg: 'var(--danger)' }

  const tested = result?.tested_at ? fmtDateTime(result.tested_at) : null
  const latency = result?.latency_ms

  return (
    <div
      className="flex items-start gap-3 border-b px-4 py-2 text-xs"
      style={{
        borderColor: 'var(--border)',
        background: tone.bg,
        color: tone.fg,
      }}
    >
      <div className="flex-1 space-y-0.5">
        {ok ? (
          <>
            <div className="font-medium">
              {t('datasourceDetail.test.ok', '连接成功')} · {latency} ms
            </div>
            <div className="text-[11px] opacity-80">
              {tested ? t('datasourceDetail.test.testedAt', '测试时间 {time}', { time: tested }) : null}
              {result?.details?.server_version ? (
                <> · {t('datasourceDetail.test.serverVersion', '服务端版本')} <code>{result.details.server_version}</code></>
              ) : null}
              {' · TLS '}
              {result?.details?.tls
                ? t('datasourceDetail.test.tlsOn', '启用')
                : t('datasourceDetail.test.tlsOff', '未启用')}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">
              {t('datasourceDetail.test.failedHeader', '连接失败')}
              {result?.error_code ? <> · <code>{result.error_code}</code></> : null}
              {latency != null ? <> · {latency} ms</> : null}
            </div>
            <div className="text-[11px] opacity-80">
              {result?.error_message || fallbackError || t('datasourceDetail.test.unknownError', '未知错误')}
            </div>
            {result?.hint ? (
              <div className="text-[11px] opacity-80">
                {t('datasourceDetail.test.hint', '提示：{hint}', { hint: result.hint })}
              </div>
            ) : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-1.5 text-[10px]"
        style={{ color: tone.fg }}
        title={t('datasourceDetail.test.close', '关闭')}
      >
        ×
      </button>
    </div>
  )
}

function NeighborBtn({
  label,
  onClick,
  disabled,
}: {
  label: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center rounded-md border px-2 py-1 text-left text-xs"
      style={{
        borderColor: 'var(--border)',
        color: 'var(--text-2)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
