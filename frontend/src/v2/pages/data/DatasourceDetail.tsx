// frontend/src/v2/pages/data/DatasourceDetail.tsx
//
// 数据源详情全屏页（L3）。从 Peek ⤢ / 直接 URL / Tab 切回均落到此处。
// B-back-4: POST /datasources/:id/test 增强字段 — 测试结果只展示后端实际返回字段
// B-back-5: GET /datasources/:id/schema — "结构" Tab 留占位

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RefreshCcw, Pencil, ServerCog, ExternalLink, Play } from 'lucide-react'
import { useDatasource, useDatasources, useTestConnection } from '@v2/hooks/datasources'
import type { Datasource, TestConnectionResult } from '@v2/api/datasources'
import {
  connectionStatusChip,
  datasourceTabLabel,
  DatasourceDetailContent,
} from './_shared/datasource-detail-content'
import { DatasourceSchemaBrowser } from './_shared/datasource-schema-browser'
import { fmtDateTime } from '@v2/lib/format'
// import { t } from '@v2/i18n'  // TODO: pending X-Crosscut delivery

// X-Crosscut 提供（编译错误留待 Phase 3 修复）
import { useAppShell } from '@v2/layout/AppShell'

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'structure', label: '结构' },   // B-back-5 占位
] as const

type TabId = (typeof TABS)[number]['id']

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
    setBreadcrumbs(['数据', '数据源', data.name])
  }, [data, setBreadcrumbs])

  // 注册 Tab
  useEffect(() => {
    if (!data) return
    openTab({
      id: `datasource:${data.id}`,
      label: datasourceTabLabel(data),
      to: `/data-center/datasources/${data.id}`,
      closeable: true,
      onClose: () => {
        navigate('/data-center/datasources')
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
          onClick={() => navigate('/data-center/datasources')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <ArrowLeft size={12} /> 返回列表
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
          style={{ color: 'var(--text-2)' }}
        >
          <RefreshCcw size={12} className={isFetching ? 'animate-spin' : ''} />
          重新加载
        </button>
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
                setTestError(e instanceof Error ? e.message : '测试失败')
              }
            }}
            disabled={testConn.isPending}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
          >
            <Play size={12} />
            {testConn.isPending ? '测试中…' : '测试连接'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(`/data-center/datasources/${numericId}/edit`)}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          <Pencil size={12} /> 编辑
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
      subtitle: `${data.source_type} · #${data.id}`,
      body: (
        <div className="space-y-4 px-4 py-4">
          <section>
            <CtxLabel>状态</CtxLabel>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {connectionStatusChip(data.connection_status)}
              <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: data.is_active ? 'var(--success-soft)' : 'var(--bg-surface-2)',
                  color: data.is_active ? 'var(--success)' : 'var(--text-3)',
                }}
              >
                {data.is_active ? '启用' : '停用'}
              </span>
            </div>
          </section>
          <section>
            <CtxLabel>邻接导航</CtxLabel>
            <div className="mt-2 space-y-1.5 text-xs">
              <NeighborBtn
                label={neighbors.prev ? `← ${neighbors.prev.name}` : '没有上一项'}
                disabled={!neighbors.prev}
                onClick={
                  neighbors.prev
                    ? () => navigate(`/data-center/datasources/${neighbors.prev!.id}`)
                    : undefined
                }
              />
              <NeighborBtn
                label={neighbors.next ? `${neighbors.next.name} →` : '没有下一项'}
                disabled={!neighbors.next}
                onClick={
                  neighbors.next
                    ? () => navigate(`/data-center/datasources/${neighbors.next!.id}`)
                    : undefined
                }
              />
            </div>
          </section>
          <section>
            <CtxLabel>下游引用</CtxLabel>
            <p className="mt-2 text-[11px] leading-5" style={{ color: 'var(--text-3)' }}>
              通过{' '}
              <code className="text-[10px]">/api/v1/data-center/datasets?source_id={data.id}</code>{' '}
              查询关联数据集。
            </p>
            <button
              type="button"
              onClick={() => navigate(`/data-center/datasets?source_id=${data.id}`)}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
              style={{ color: 'var(--text-2)' }}
            >
              <ExternalLink size={11} /> 查看关联数据集
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
        非法的数据源 ID
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs" style={{ color: 'var(--text-3)' }}>
        加载中…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {error instanceof Error ? error.message : '加载失败'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md border px-3 py-1.5 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
        >
          重试
        </button>
      </div>
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
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            DS
          </div>
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
                {data.is_active ? '启用' : '停用'}
              </span>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
              {data.source_type} · #{data.id} ·{' '}
              <code>GET /api/v1/data-center/datasources/{data.id}</code>
            </div>
          </div>
        </div>

        {/* Tab 栏 */}
        <div className="mt-3 flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="rounded px-2.5 py-1 text-xs"
              style={{
                background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
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
          <div className="h-full overflow-auto">
            <DatasourceDetailContent item={data} />
          </div>
        )}
        {tab === 'structure' && (
          <DatasourceSchemaBrowser datasourceId={data.id} />
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
            <div className="font-medium">连接成功 · {latency} ms</div>
            <div className="text-[11px] opacity-80">
              {tested ? `测试时间 ${tested}` : null}
              {result?.details?.server_version ? (
                <> · 服务端版本 <code>{result.details.server_version}</code></>
              ) : null}
              {' · TLS '}
              {result?.details?.tls ? '启用' : '未启用'}
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">
              连接失败
              {result?.error_code ? <> · <code>{result.error_code}</code></> : null}
              {latency != null ? <> · {latency} ms</> : null}
            </div>
            <div className="text-[11px] opacity-80">
              {result?.error_message || fallbackError || '未知错误'}
            </div>
            {result?.hint ? (
              <div className="text-[11px] opacity-80">提示：{result.hint}</div>
            ) : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-1.5 text-[10px]"
        style={{ color: tone.fg }}
        title="关闭"
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
  label: string
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
