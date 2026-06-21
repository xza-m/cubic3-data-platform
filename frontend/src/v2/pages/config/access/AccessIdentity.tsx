/* eslint-disable react-refresh/only-export-components */
// frontend/src/v2/pages/config/access/AccessIdentity.tsx
//
// 访问网关工作台：权限配置、权限审计和网关观测。

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  KeyRound,
  Pencil,
  PowerOff,
  RotateCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import { IdentityName } from '@v2/components/IdentityName'
import { Can } from '@v2/components/Can'
import { Button, Chip, Dialog, Input, Skeleton, Tab, Tabs, useToast, useConfirm } from '@v2/components/ui'
import {
  CreateButton,
  RefreshButton,
  Toolbar,
  ToolbarSearch,
} from '@v2/components/CommonControls'
import { ListPagination } from '@v2/components/ListPagination'
import { fmtDateTime } from '@v2/lib/format'
import { identityDisplayName } from '@v2/utils/identity'
import { t } from '@v2/i18n'
import {
  useAccessPrincipal,
  useAccessPrincipals,
  useAccessPermissionPackages,
  useAccessRoleCatalog,
  useCreateDataPolicy,
  useCreateApiKey,
  useCreateServicePrincipal,
  useGatewayObservability,
  useDataPolicies,
  useExecutionProfiles,
  useM2Allowlist,
  usePolicyDecisions,
  useRevokeApiKey,
  useRotateApiKey,
  useServicePrincipal,
  useServicePrincipals,
  useUpdateAccessPermissionPackages,
  useUpdateDataPolicy,
  useUpdateExecutionProfile,
} from '@v2/hooks/access'
import type {
  AccessDataPolicy,
  AccessExecutionProfile,
  AccessPermissionPackage,
  AccessPolicyDecision,
  AccessPrincipal,
  AccessPrincipalDetail,
  AccessRoleBinding,
  AccessServicePrincipal,
  EffectiveRowScopeEntry,
  GatewayRuntimeAlerts,
  GatewayQueryRun,
  GatewayTelemetrySummary,
  GatewayObservabilitySnapshot,
  GatewayContractCompleteness,
  GatewayTimeseriesPoint,
  CreatedApiKey,
  M2AllowlistItem,
  M2AllowlistPrincipal,
} from '@v2/api/access'
import { AppError } from '@v2/api/types'

type TabId = 'principals' | 'allowlist' | 'policies'

type AccessViewId = 'permissions' | 'audit' | 'observability'

type GatewayObservabilityTab = 'overview' | 'runtime' | 'trace' | 'quality'

interface AccessIdentityProps {
  view?: AccessViewId
}

const EMPTY_GATEWAY_ALERTS: GatewayRuntimeAlerts = {
  status: 'healthy',
  alerts: [],
  thresholds: {},
  readiness: {},
  summary: {},
  evaluated_at: null,
}

const EMPTY_GATEWAY_SUMMARY: GatewayTelemetrySummary = {
  query_count: 0,
  success_count: 0,
  failed_count: 0,
  physical_denied_count: 0,
  stability: 100,
  success_rate: 100,
  timeout_rate: 0,
  by_data_level: {},
  queued_count: 0,
  running_count: 0,
  pending_count: 0,
  avg_queue_wait_ms: 0,
  max_current_queue_wait_ms: 0,
  queue_wait_p95_ms: 0,
  avg_execute_ms: 0,
  execute_p95_ms: 0,
  remote_timeout_count: 0,
  client_wait_timeout_count: 0,
  timeout_count: 0,
  rejected_count: 0,
  export_request_count: 0,
  export_started_count: 0,
  export_not_ready_count: 0,
  export_success_count: 0,
  export_failure_count: 0,
  export_failure_by_reason: {},
  publish_conflict_count: 0,
  result_rejected_count: 0,
  result_rejected_by_reason: {},
  result_too_large_rejected_count: 0,
  result_row_too_large_rejected_count: 0,
  max_result_rejected_bytes: 0,
  max_result_rejected_row_bytes: 0,
  result_object_count: 0,
  spool_object_count: 0,
  spool_result_total_bytes: 0,
  spool_age_buckets: {},
  cleanup_lag_seconds: 0,
  auth_denied_count: 0,
  invalid_token_count: 0,
  missing_token_count: 0,
  legacy_protocol_count: 0,
  sql_guard_rejected_count: 0,
  credential_missing_count: 0,
  credential_invalid_count: 0,
  worker_heartbeat_stale_count: 0,
  worker_orphan_lease_reclaimed_count: 0,
  worker_housekeeping_completed_count: 0,
  gateway_readyz_degraded_count: 0,
  active_worker_count: 0,
  live_worker_count: 0,
  draining_worker_count: 0,
  worker_capacity: 0,
  generated_at: null,
  metric_version: null,
  source: null,
}

const GATEWAY_OBSERVABILITY_PARAMS = { window: '24h', bucket: '1h', limit: 200 }
const GATEWAY_RECORD_PAGE_SIZE = 10
const DATA_LEVEL_OPTIONS = ['M0', 'M1', 'M2', 'M3']
const TABLE_LAYER_OPTIONS = ['dim', 'dws', 'ads', 'dwd', 'ods', 'raw']
const POLICY_ACTION_OPTIONS = ['metadata.read', 'semantic.plan', 'query']
const PIXEL_SUBJECT_ICON_SIZE = 16

type PrincipalSubjectRow =
  | { kind: 'human'; id: string; principal: AccessPrincipal }
  | { kind: 'service'; id: string; service: AccessServicePrincipal }

export default function AccessIdentity({ view = 'permissions' }: AccessIdentityProps) {
  const [tab, setTab] = useState<TabId>('principals')
  const header = {
    principals: {
      title: t('access.principals.title', '主体权限'),
      subtitle: t('access.principals.subtitle', '统一管理碳基成员和硅基机器人，平台角色决定能做什么，数据访问权限决定最多能读到哪层数据'),
    },
    allowlist: {
      title: t('access.allowlist.title', 'M2 白名单'),
      subtitle: t('access.allowlist.subtitle', '解释默认 M2 权限来源、匹配状态和当前授权结果'),
    },
    policies: {
      title: t('access.policies.title', '数据访问规则'),
      subtitle: t('access.policies.subtitle', '查询执行层只配置 M 等级准入和执行护栏，项目、表、列权限仍以 MaxCompute RAM 为准'),
    },
  }[tab]
  const viewMeta = {
    permissions: {
      title: t('access.permissions.title', '权限管理'),
      subtitle: header.subtitle,
    },
    audit: {
      title: t('access.audit.title', '权限审计'),
      subtitle: t('access.audit.subtitle', '集中查看策略判定、治理要求和访问拦截记录'),
    },
    observability: {
      title: t('access.observability.title', '网关观测'),
      subtitle: t('access.observability.subtitle', '按概览、运行、Trace 和契约质量排查网关问题'),
    },
  }[view]

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <header className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {viewMeta.title}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {viewMeta.subtitle}
            </p>
          </div>
        </header>
        {view === 'permissions' ? (
          <Tabs
            value={tab}
            onChange={(value) => setTab(value as TabId)}
            size="sm"
            className="px-4"
            aria-label={t('access.permissions.innerTabs', '权限管理分组')}
          >
            <Tab value="principals">
              <UserRound size={12} /> {t('access.tab.principals', '主体权限')}
            </Tab>
            <Tab value="allowlist">
              <ShieldCheck size={12} /> {t('access.tab.allowlist', 'M2 白名单')}
            </Tab>
            <Tab value="policies">
              <ShieldCheck size={12} /> {t('access.tab.policies', '数据访问规则')}
            </Tab>
          </Tabs>
        ) : null}
        {view === 'permissions'
          ? (
            tab === 'principals'
              ? <PrincipalWorkspace />
              : tab === 'allowlist'
                ? <M2AllowlistWorkspace />
                : tab === 'policies'
                  ? <PolicyWorkspace />
                  : null
          )
          : view === 'audit' ? <PermissionAuditWorkspace /> : <GatewayObservabilityWorkspace />}
      </div>
    </div>
  )
}

function PrincipalWorkspace() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingPrincipalId, setEditingPrincipalId] = useState<string | null>(null)
  const [creatingService, setCreatingService] = useState(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const params = { q: q || undefined, principal_type: 'human' as const, page: 1, page_size: 200 }
  const {
    data: principalData,
    isLoading: loadingPrincipals,
    isError: principalError,
    refetch: refetchPrincipals,
    isFetching: fetchingPrincipals,
  } = useAccessPrincipals(params)
  const {
    data: serviceData,
    isLoading: loadingServices,
    isError: serviceError,
    refetch: refetchServices,
    isFetching: fetchingServices,
  } = useServicePrincipals()
  const { data: packageCatalog } = useAccessPermissionPackages()
  const humanRows = useMemo(() => principalData?.items ?? [], [principalData?.items])
  const serviceRows = useMemo(
    () => filterServicePrincipals(serviceData ?? [], q),
    [q, serviceData],
  )
  const rows = useMemo<PrincipalSubjectRow[]>(() => [
    ...humanRows.map((principal) => ({ kind: 'human' as const, id: principal.principal_id, principal })),
    ...serviceRows.map((service) => ({ kind: 'service' as const, id: service.principal_id, service })),
  ], [humanRows, serviceRows])
  const total = rows.length
  const paginated = useMemo(
    () => paginatePrincipalSubjects(rows, page, 20),
    [page, rows],
  )
  const selectedSubject = rows.find((row) => row.id === selectedId) ?? null
  const selectedPrincipal = selectedSubject?.kind === 'human' ? selectedSubject.principal : null
  const selectedService = selectedSubject?.kind === 'service' ? selectedSubject.service : null
  const isLoading = loadingPrincipals || loadingServices
  const isError = principalError || serviceError

  const handleRefresh = async () => {
    setManualRefreshing(true)
    try {
      const results = await Promise.all([refetchPrincipals(), refetchServices()])
      if (results.some((result) => result.isError)) throw new Error('主体权限刷新失败')
      toast.show({ tone: 'success', title: t('access.refresh.principalsSuccess', '主体权限已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.refresh.principalsFailed', '主体权限刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }
  const refreshing = manualRefreshing || fetchingPrincipals || fetchingServices

  useEffect(() => {
    setPage(1)
    setSelectedId(null)
  }, [q])

  useEffect(() => {
    if (page > paginated.totalPages) setPage(paginated.totalPages)
  }, [page, paginated.totalPages])

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Toolbar className="justify-start">
            <ToolbarSearch
              value={q}
              onChange={(value) => {
                setQ(value)
              }}
              placeholder={t('access.principals.search', '搜索主体 / 姓名 / 邮箱 / 机器人')}
              ariaLabel={t('access.principals.searchAria', '搜索主体权限')}
              width={240}
            />
            <RefreshButton
              onClick={() => void handleRefresh()}
              loading={refreshing}
              ariaLabel={t('access.refresh.principals', '刷新主体权限')}
            />
          </Toolbar>
          <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
            <Button
              size="sm"
              disabled={selectedSubject?.kind !== 'human'}
              onClick={() => setEditingPrincipalId(selectedPrincipal?.principal_id ?? null)}
            >
              <Pencil size={12} /> {t('access.detail.adjustPackages', '调整权限')}
            </Button>
          </Can>
          <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
            <CreateButton
              label={t('access.services.create', '新建机器人')}
              onClick={() => setCreatingService(true)}
            />
          </Can>
          <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
            {t('access.principals.totalSubjects', '共 {n} 个主体', { n: total })}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.principals.loadFailed', '主体权限加载失败')} />
          ) : rows.length === 0 ? (
            <EmptyState text={t('access.principals.empty', '暂无主体权限')} />
          ) : (
            <PrincipalTable
              rows={paginated.items}
              packages={packageCatalog?.items ?? []}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>
        <div className="border-t px-4 pb-3" style={{ borderColor: 'var(--border)' }}>
          <ListPagination page={page} pageSize={20} total={total} onPageChange={setPage} />
        </div>
      </section>
      {selectedSubject ? (
        <aside
          role="complementary"
          aria-label={t('access.detail.ariaLabel', '主体权限配置')}
          className="flex w-[420px] shrink-0 flex-col border-l"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <div className="flex items-start gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <PixelSubjectIcon kind={selectedSubject.kind} size={24} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                {selectedPrincipal
                  ? identityDisplayName(selectedPrincipal.display_name, selectedPrincipal.principal_id)
                  : identityDisplayName(selectedService?.display_name, selectedService?.principal_id ?? '')}
              </h2>
              <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
                {selectedSubject.kind === 'human'
                  ? `${t('access.principals.carbon', '碳基生物')} · ${selectedPrincipal?.tenant_key ?? ''}`
                  : `${t('access.principals.silicon', '硅基生物')} · ${selectedService?.service_type ?? ''}`}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors hover:bg-[color:var(--bg-hover)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              aria-label={t('access.detail.close', '关闭详情')}
              onClick={() => setSelectedId(null)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {selectedSubject.kind === 'human'
              ? <PrincipalDetailPanel principalId={selectedSubject.id} />
              : <ServiceDetailPanel principalId={selectedSubject.id} />}
          </div>
        </aside>
      ) : null}
      <PermissionPackageDialog principalId={editingPrincipalId} onClose={() => setEditingPrincipalId(null)} />
      <CreateServiceDialog open={creatingService} onClose={() => setCreatingService(false)} />
    </div>
  )
}

function PrincipalTable({
  rows,
  packages,
  selectedId,
  onSelect,
}: {
  rows: PrincipalSubjectRow[]
  packages: AccessPermissionPackage[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.principals.col.principal', '主体')}</Th>
          <Th>{t('access.principals.col.kind', '身份类别')}</Th>
          <Th>{t('access.principals.col.platformRole', '平台角色 / 接入类型')}</Th>
          <Th>{t('access.principals.col.dataAccess', '数据权限 / 凭证')}</Th>
          <Th>{t('access.principals.col.permissionSource', '权限来源 / 负责人')}</Th>
          <Th>{t('access.principals.col.lastSeen', '最近出现')}</Th>
          <Th>{t('access.principals.col.status', '状态')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isHuman = row.kind === 'human'
          const principal = isHuman ? row.principal : null
          const service = row.kind === 'service' ? row.service : null
          const platformSummary = principal ? summarizePrincipalPlatformPackages(principal, packages) : service?.service_type ?? ''
          const dataSummary = principal ? summarizePrincipalDataPackage(principal, packages) : formatServiceCredentialSummary(service)
          const sourceSummary = principal ? summarizePrincipalPermissionSource(principal) : null
          const displayName = principal
            ? identityDisplayName(principal.display_name, principal.principal_id)
            : identityDisplayName(service?.display_name, service?.principal_id ?? '')
          const principalId = principal?.principal_id ?? service?.principal_id ?? row.id
          const handleOpen = () => onSelect(row.id)
          const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            handleOpen()
          }
          return (
            <tr
              key={`${row.kind}:${row.id}`}
              className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
              role="button"
              tabIndex={0}
              aria-label={t('access.principals.openDetailAria', '查看主体权限详情 {name}', { name: displayName })}
              style={{
                borderBottom: '1px solid var(--border)',
                background: selectedId === row.id ? 'var(--accent-soft)' : 'transparent',
              }}
              onClick={handleOpen}
              onKeyDown={handleKeyDown}
            >
              <td className="max-w-[300px] px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <PixelSubjectIcon kind={row.kind} />
                  <div className="min-w-0">
                    <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>
                      {displayName}
                    </div>
                    <div className="truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {principalId}
                    </div>
                    {service?.description ? (
                      <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{service.description}</div>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5">
                <PrincipalKindChip kind={row.kind} />
              </td>
              <td className="px-4 py-2.5">
                <Chip tone={isHuman ? 'accent' : 'violet'}>{platformSummary}</Chip>
              </td>
              <td className="px-4 py-2.5">
                {dataSummary ? (
                  <Chip tone={isHuman ? 'warning' : 'neutral'}>{dataSummary}</Chip>
                ) : (
                  <span style={{ color: 'var(--text-3)' }}>{t('access.detail.noDataAccess', '无数据访问权限')}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {sourceSummary ? (
                  <Chip tone={sourceSummary.tone}>{sourceSummary.label}</Chip>
                ) : service ? (
                  <IdentityName value={service.owner_principal_id} displayName={service.owner_display_name} />
                ) : null}
              </td>
              <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
                {principal?.last_seen_at ? fmtDateTime(principal.last_seen_at) : service?.created_at ? fmtDateTime(service.created_at) : '—'}
              </td>
              <td className="px-4 py-2.5"><StatusChip status={principal?.status ?? service?.status ?? 'active'} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PrincipalKindChip({ kind }: { kind: PrincipalSubjectRow['kind'] }) {
  if (kind === 'service') {
    return (
      <Chip tone="violet" className="inline-flex items-center gap-1.5">
        <PixelSubjectIcon kind="service" />
        {t('access.principals.silicon', '硅基生物')}
      </Chip>
    )
  }
  return (
    <Chip tone="success" className="inline-flex items-center gap-1.5">
      <PixelSubjectIcon kind="human" />
      {t('access.principals.carbon', '碳基生物')}
    </Chip>
  )
}

function PixelSubjectIcon({
  kind,
  size = PIXEL_SUBJECT_ICON_SIZE,
}: {
  kind: PrincipalSubjectRow['kind']
  size?: number
}) {
  const rows = kind === 'human'
    ? [
      '..1111..',
      '.122221.',
      '.12CC21.',
      '.122221.',
      '..1111..',
      '.133331.',
      '11333311',
      '11....11',
    ]
    : [
      '...2....',
      '..222...',
      '.111111.',
      '12C22C21',
      '12222221',
      '.111111.',
      '..1..1..',
      '.11..11.',
    ]
  const palette: Record<string, string> = kind === 'human'
    ? {
      1: '#0f766e',
      2: '#5eead4',
      3: '#22d3ee',
      C: '#0f3d5e',
    }
    : {
      1: '#0f4c81',
      2: '#38bdf8',
      C: '#0f766e',
    }
  const auraColor = kind === 'human' ? '#14b8a6' : '#38bdf8'

  return (
    <span
      aria-hidden="true"
      data-subject-icon={kind}
      className="inline-grid shrink-0 overflow-hidden rounded-[2px]"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(8, minmax(0, 1fr))',
        boxShadow: `0 0 0 1px color-mix(in srgb, ${auraColor} 32%, transparent), 0 0 0 3px color-mix(in srgb, ${auraColor} 10%, transparent)`,
      }}
    >
      {rows.flatMap((row, rowIndex) => row.split('').map((cell, cellIndex) => (
        <span
          key={`${rowIndex}-${cellIndex}`}
          style={{
            background: cell === '.' ? 'transparent' : palette[cell],
          }}
        />
      )))}
    </span>
  )
}

function filterServicePrincipals(rows: AccessServicePrincipal[], q: string): AccessServicePrincipal[] {
  const keyword = q.trim().toLowerCase()
  if (!keyword) return rows
  return rows.filter((row) => [
    row.principal_id,
    row.display_name,
    row.service_type,
    row.owner_display_name,
    row.owner_principal_id,
    row.owner_team,
    row.description,
    row.allowed_tenants.join(','),
  ].some((value) => String(value || '').toLowerCase().includes(keyword)))
}

function formatServiceCredentialSummary(service: AccessServicePrincipal | null): string | null {
  if (!service) return null
  const apiKeyCount = service.api_keys?.length
  if (typeof apiKeyCount === 'number') {
    return apiKeyCount > 0
      ? t('access.services.apiKeyCount', '{n} 个 API Key', { n: apiKeyCount })
      : t('access.apiKeys.empty', '暂无 API Key')
  }
  return t('access.services.apiKeyManaged', 'API Key 管理')
}

function paginatePrincipalSubjects(
  rows: PrincipalSubjectRow[],
  page: number,
  pageSize = 20,
): {
  items: PrincipalSubjectRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
} {
  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  }
}

function PrincipalDetailPanel({ principalId }: { principalId: string | null }) {
  const { data, isLoading, isError } = useAccessPrincipal(principalId)
  const { data: packageCatalog, isLoading: loadingPackages } = useAccessPermissionPackages()

  if (!principalId) {
    return (
      <div className="p-3">
        <EmptyState text={t('access.detail.pickPrincipal', '选择一个成员查看权限配置')} />
      </div>
    )
  }
  if (isLoading) {
    return <LoadingRows />
  }
  if (isError || !data) {
    return <div className="p-3"><EmptyState tone="danger" text={t('access.detail.loadFailed', '详情加载失败')} /></div>
  }

  const rawRoles = [...(data.platform_roles || []), ...(data.data_roles || [])]
  const packageCodes = getAssignedAccessPackageCodes(data, packageCatalog?.items ?? [])

  return (
    <div className="min-h-full space-y-4 p-3">
      <InfoGrid items={[
        [t('access.principals.col.type', '来源'), <TypeChip type={data.principal_type} />],
        [t('access.principals.col.status', '状态'), <StatusChip status={data.status} />],
        [t('access.detail.idp', '身份来源'), data.idp === 'feishu' ? t('access.detail.idpFeishu', '飞书') : data.idp],
        [t('access.detail.tenant', '租户'), data.tenant_key],
        [t('access.detail.lastSeen', '最近出现'), data.last_seen_at ? fmtDateTime(data.last_seen_at) : '—'],
      ]} />
      <PermissionPackageSummary
        loading={loadingPackages}
        packages={packageCatalog?.items ?? []}
        value={packageCodes}
      />
      <SectionTitle>{t('access.detail.rawRoles', '底层角色（系统计算）')}</SectionTitle>
      <div className="flex flex-wrap gap-1">
        {rawRoles.length === 0 ? (
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('access.detail.noRawRoles', '暂无底层角色')}
          </span>
        ) : rawRoles.map((role) => <Chip key={role}>{role}</Chip>)}
      </div>
      <SectionTitle>{t('access.detail.bindingRaw', '绑定记录（审计）')}</SectionTitle>
      <BindingList bindings={data.role_bindings} />
      <SectionTitle>{t('access.detail.aliases', '技术别名（高级）')}</SectionTitle>
      <div className="space-y-2">
        {data.aliases.length === 0 ? (
          <div className="text-xs text-3">{t('access.detail.noAliases', '暂无技术别名')}</div>
        ) : data.aliases.map((alias) => (
          <div key={alias.id} className="rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--border)' }}>
            <span className="font-medium" style={{ color: 'var(--text-2)' }}>{alias.external_id_type}</span>
            <span className="ml-2 break-all font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{alias.external_id}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function M2AllowlistWorkspace() {
  const toast = useToast()
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const { data, isLoading, isError, isFetching, refetch } = useM2Allowlist()
  const refreshing = manualRefreshing || isFetching
  const summary = data?.summary ?? {
    configured_count: 0,
    matched_count: 0,
    unmatched_count: 0,
    current_m2_count: 0,
    sync_cubic3_allowlist: false,
  }
  const items = data?.items ?? []
  const currentPrincipals = data?.current_principals ?? []

  const refresh = async () => {
    setManualRefreshing(true)
    try {
      const result = await refetch()
      if (result.isError) throw result.error
      toast.show({ tone: 'success', title: t('access.allowlist.refreshSuccess', 'M2 白名单预览已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.allowlist.refreshFailed', 'M2 白名单预览刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {t('access.allowlist.heading', '默认 M2 查询权限')}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {t('access.allowlist.helper', '白名单只决定 data-platform DataPolicy 是否放行 M2；真实执行仍经过 gateway SQL guard 和 MaxCompute RAM。')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton
              onClick={() => void refresh()}
              loading={refreshing}
              label={t('access.allowlist.refreshPreview', '刷新预览')}
              loadingLabel={t('access.allowlist.refreshPreviewing', '刷新中…')}
              ariaLabel={t('access.allowlist.refresh', '刷新 M2 白名单预览')}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {isError ? (
            <div className="mb-3">
              <EmptyState tone="danger" text={t('access.allowlist.loadFailed', 'M2 白名单加载失败')} />
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-4">
            <GatewayMetricCard
              label={t('access.allowlist.metric.configured', '配置标识')}
              value={isLoading ? '—' : summary.configured_count}
              detail={t('access.allowlist.metric.configuredDetail', 'open_id / union_id / principal_id 去重后数量')}
            />
            <GatewayMetricCard
              label={t('access.allowlist.metric.matched', '已匹配主体')}
              value={isLoading ? '—' : summary.matched_count}
              detail={t('access.allowlist.metric.matchedDetail', '已能解析为 access principal')}
            />
            <GatewayMetricCard
              label={t('access.allowlist.metric.unmatched', '待首次登录')}
              value={isLoading ? '—' : summary.unmatched_count}
              tone={summary.unmatched_count > 0 ? 'warning' : 'neutral'}
              detail={t('access.allowlist.metric.unmatchedDetail', '未匹配主体时需等待飞书 SSO 登录')}
            />
            <GatewayMetricCard
              label={t('access.allowlist.metric.currentM2', '当前 M2 成员')}
              value={isLoading ? '—' : summary.current_m2_count}
              detail={t('access.allowlist.metric.currentM2Detail', '已绑定明细数据读取权限的成员')}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="min-w-0 space-y-4">
              <AllowlistSourcePanel syncCubic3={summary.sync_cubic3_allowlist} rawEnv={data?.sources.feishu_m2_reader_open_ids ?? ''} />
              <section className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <PanelTitle title={t('access.allowlist.items.section', '配置标识匹配结果')} count={items.length} />
                {isLoading ? (
                  <LoadingRows />
                ) : items.length === 0 ? (
                  <EmptyState text={t('access.allowlist.items.empty', '暂无 M2 白名单配置')} />
                ) : (
                  <AllowlistIdentifierTable rows={items} />
                )}
              </section>
            </section>

            <aside className="space-y-4">
              <section className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
                  {t('access.allowlist.confirm.section', '确认策略')}
                </div>
                <div className="mt-3 space-y-2">
                  <GatewayCheckRow
                    label={t('access.allowlist.confirm.login', '首次登录')}
                    text={t('access.allowlist.confirm.loginText', '自动落 Principal')}
                  />
                  <GatewayCheckRow
                    label={t('access.allowlist.confirm.grant', '命中白名单')}
                    text={t('access.allowlist.confirm.grantText', '授予 M0/M1/M2')}
                  />
                  <GatewayCheckRow
                    label={t('access.allowlist.confirm.gateway', '真实执行')}
                    text={t('access.allowlist.confirm.gatewayText', '仍走 gateway')}
                  />
                  <GatewayCheckRow
                    label={t('access.allowlist.confirm.m3', 'M3 / RAW')}
                    text={t('access.allowlist.confirm.m3Text', '默认阻断')}
                  />
                </div>
              </section>
              <section className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
                <PanelTitle title={t('access.allowlist.current.section', '当前 M2 成员')} count={currentPrincipals.length} />
                {isLoading ? (
                  <LoadingRows />
                ) : currentPrincipals.length === 0 ? (
                  <EmptyState text={t('access.allowlist.current.empty', '暂无已绑定 M2 的成员')} />
                ) : (
                  <AllowlistCurrentPrincipalList rows={currentPrincipals} />
                )}
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}

function AllowlistSourcePanel({
  syncCubic3,
  rawEnv,
}: {
  syncCubic3: boolean
  rawEnv: string
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        <div className="font-semibold" style={{ color: 'var(--text-1)' }}>FEISHU_M2_READER_OPEN_IDS</div>
        <div className="mt-1" style={{ color: 'var(--text-3)' }}>
          {rawEnv ? t('access.allowlist.source.envConfigured', '已配置环境变量名单') : t('access.allowlist.source.envEmpty', '未配置环境变量名单')}
        </div>
      </div>
      <div className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        <div className="font-semibold" style={{ color: 'var(--text-1)' }}>CUBIC3 allowed_user_ids</div>
        <div className="mt-1" style={{ color: 'var(--text-3)' }}>
          {syncCubic3
            ? t('access.allowlist.source.cubic3Enabled', '已启用复用，作为默认 M2 白名单来源')
            : t('access.allowlist.source.cubic3Disabled', '未启用复用，默认 M2 只看环境变量名单')}
        </div>
      </div>
    </section>
  )
}

function AllowlistIdentifierTable({ rows }: { rows: M2AllowlistItem[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.allowlist.item_col.identifier', '标识')}</Th>
          <Th>{t('access.allowlist.item_col.source', '来源')}</Th>
          <Th>{t('access.allowlist.item_col.principal', '匹配主体')}</Th>
          <Th>{t('access.allowlist.item_col.result', '授权结果')}</Th>
          <Th>{t('access.allowlist.item_col.risk', '风险')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.source}:${row.identifier}`} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="max-w-[260px] px-4 py-2.5 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.identifier}</td>
            <td className="px-4 py-2.5"><Chip tone="neutral">{allowlistSourceLabel(row.source)}</Chip></td>
            <td className="max-w-[260px] px-4 py-2.5">
              {row.principal_id ? (
                <IdentityName value={row.principal_id} displayName={row.display_name} />
              ) : (
                <span style={{ color: 'var(--text-3)' }}>{t('access.allowlist.items.unmatched', '等待首次 SSO 登录')}</span>
              )}
            </td>
            <td className="px-4 py-2.5"><Chip tone={allowlistGrantTone(row.grant_status)}>{allowlistGrantLabel(row.grant_status)}</Chip></td>
            <td className="px-4 py-2.5">
              {row.risk ? (
                <Chip tone="warning">{allowlistRiskLabel(row.risk)}</Chip>
              ) : (
                <span style={{ color: 'var(--text-3)' }}>—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AllowlistCurrentPrincipalList({ rows }: { rows: M2AllowlistPrincipal[] }) {
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => (
        <div key={row.principal_id} className="rounded border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-1)' }}>
              {row.display_name || row.principal_id}
            </span>
            <Chip tone={row.in_configured_allowlist ? 'success' : 'neutral'}>
              {row.in_configured_allowlist ? t('access.allowlist.current.configured', '白名单') : bindingSourceLabel(row.source)}
            </Chip>
          </div>
          <div className="mt-1 truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.principal_id}</div>
          <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            {row.last_bound_at ? fmtDateTime(row.last_bound_at) : t('access.allowlist.current.noBoundAt', '暂无绑定时间')}
          </div>
        </div>
      ))}
      {rows.length > 8 ? (
        <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {t('access.allowlist.current.more', '另有 {count} 个 M2 成员未在此处展开', { count: rows.length - 8 })}
        </div>
      ) : null}
    </div>
  )
}

function ServiceDetailPanel({ principalId }: { principalId: string | null }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [creatingKey, setCreatingKey] = useState(false)
  const [revealedKey, setRevealedKey] = useState<CreatedApiKey | null>(null)
  const { data, isLoading, isError } = useServicePrincipal(principalId)
  const revoke = useRevokeApiKey()
  const rotate = useRotateApiKey()

  const handleRotate = async (keyId: string) => {
    const next = await rotate.mutateAsync(keyId)
    setRevealedKey(next)
    toast.show({ tone: 'warning', title: t('access.apiKeys.rotated', 'API Key 已轮换') })
  }

  const handleRevoke = async (keyId: string) => {
    if (!(await confirm({ title: t('access.apiKeys.revokeConfirm', '吊销这个 API Key？'), tone: 'danger' }))) return
    await revoke.mutateAsync(keyId)
    toast.show({ tone: 'warning', title: t('access.apiKeys.revoked', 'API Key 已吊销') })
  }

  if (!principalId) {
    return <div className="p-3"><EmptyState text={t('access.services.pick', '选择机器人查看接入凭证')} /></div>
  }
  if (isLoading) return <LoadingRows />
  if (isError || !data) return <div className="p-3"><EmptyState tone="danger" text={t('access.services.detailFailed', '详情加载失败')} /></div>

  return (
    <>
      <div className="space-y-4 p-3">
        <InfoGrid items={[
          [t('access.services.col.type', '类型'), <Chip tone="violet">{data.service_type}</Chip>],
          [t('access.principals.col.status', '状态'), <StatusChip status={data.status} />],
          [
            t('access.services.owner', '负责人'),
            <IdentityName value={data.owner_principal_id} displayName={data.owner_display_name} />,
          ],
          [t('access.services.team', '负责团队'), data.owner_team || '—'],
          [t('access.services.tenants', '允许租户'), data.allowed_tenants.join(', ') || '—'],
          [t('access.services.description', '描述'), data.description || t('access.services.noDesc', '暂无描述')],
          [t('access.services.createdAt', '创建时间'), data.created_at ? fmtDateTime(data.created_at) : '—'],
        ]} />
        <div className="flex items-center justify-between">
          <SectionTitle>{t('access.apiKeys.title', 'API Key')}</SectionTitle>
          <Button size="sm" variant="primary" onClick={() => setCreatingKey(true)}>
            <KeyRound size={12} /> {t('access.apiKeys.create', '签发接入 Key')}
          </Button>
        </div>
        <div className="space-y-2">
          {(data.api_keys ?? []).length === 0 ? (
            <EmptyState text={t('access.apiKeys.empty', '暂无 API Key')} />
          ) : (data.api_keys ?? []).map((key) => (
            <div key={key.key_id} className="rounded border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <KeyRound size={13} style={{ color: 'var(--text-3)' }} />
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-1)' }}>{key.key_prefix}</span>
                <StatusChip status={key.status} />
                <span className="ml-auto tabular-nums" style={{ color: 'var(--text-3)' }}>
                  {t('access.apiKeys.usage', '{n} 次', { n: key.usage_count })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {key.scopes.map((scope) => <Chip key={scope}>{scope}</Chip>)}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--text-3)' }}>
                <span>{key.last_used_at ? fmtDateTime(key.last_used_at) : t('access.apiKeys.neverUsed', '尚未使用')}</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="hover:underline" onClick={() => void handleRotate(key.key_id)}>
                    <RotateCw size={11} className="mr-1 inline" /> {t('access.apiKeys.rotate', '轮换')}
                  </button>
                  <button type="button" className="hover:underline" style={{ color: 'var(--danger)' }} onClick={() => void handleRevoke(key.key_id)}>
                    {t('access.apiKeys.revoke', '吊销')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <CreateApiKeyDialog
        principalId={data.principal_id}
        open={creatingKey}
        onClose={() => setCreatingKey(false)}
        onCreated={(key) => setRevealedKey(key)}
      />
      <RevealApiKeyDialog keyPayload={revealedKey} onClose={() => setRevealedKey(null)} />
    </>
  )
}

function PolicyWorkspace() {
  const toast = useToast()
  const confirm = useConfirm()
  const [creatingPolicy, setCreatingPolicy] = useState(false)
  const [showAdvancedProfiles, setShowAdvancedProfiles] = useState(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<AccessDataPolicy | null>(null)
  const [editingProfile, setEditingProfile] = useState<AccessExecutionProfile | null>(null)
  const {
    data: policies,
    isLoading: loadingPolicies,
    isError: policyError,
    isFetching: fetchingPolicies,
    refetch: refetchPolicies,
  } = useDataPolicies()
  const {
    data: profiles,
    isLoading: loadingProfiles,
    isError: profileError,
    isFetching: fetchingProfiles,
    refetch: refetchProfiles,
  } = useExecutionProfiles()
  const updatePolicy = useUpdateDataPolicy()
  const updateProfile = useUpdateExecutionProfile()

  const refreshAll = async () => {
    setManualRefreshing(true)
    try {
      const results = await Promise.all([
        refetchPolicies(),
        refetchProfiles(),
      ])
      const failed = results.find((result) => result.isError)
      if (failed) throw failed.error
      toast.show({ tone: 'success', title: t('access.refresh.policiesSuccess', '数据访问规则已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.refresh.policiesFailed', '数据访问规则刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }
  const refreshing = manualRefreshing || fetchingPolicies || fetchingProfiles

  const disablePolicy = async (policy: AccessDataPolicy) => {
    if (!(await confirm({ title: t('access.policies.disableConfirm', '停用这个访问规则？'), tone: 'danger' }))) return
    await updatePolicy.mutateAsync({
      policyCode: policy.policy_code,
      payload: { status: 'disabled' },
    })
    toast.show({ tone: 'warning', title: t('access.policies.disabled', '访问规则已停用') })
  }

  const disableProfile = async (profile: AccessExecutionProfile) => {
    if (!(await confirm({ title: t('access.profiles.disableConfirm', '停用这个执行配置？'), tone: 'danger' }))) return
    await updateProfile.mutateAsync({
      profileCode: profile.profile_code,
      payload: { status: 'disabled' },
    })
    toast.show({ tone: 'warning', title: t('access.profiles.disabled', '执行配置已停用') })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <section className="min-h-0 h-full overflow-auto p-4">
          <div className="mb-3 flex justify-end gap-2">
            <RefreshButton
              onClick={() => void refreshAll()}
              loading={refreshing}
              ariaLabel={t('access.refresh.policies', '刷新数据访问规则')}
            />
            <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
              <CreateButton
                label={t('access.policies.create', '新建访问规则')}
                onClick={() => setCreatingPolicy(true)}
              />
            </Can>
          </div>
          <PanelTitle title={t('access.policies.section', '访问规则')} count={policies?.total ?? 0} />
          {loadingPolicies ? (
            <LoadingRows />
          ) : policyError ? (
            <EmptyState tone="danger" text={t('access.policies.loadFailed', '访问规则加载失败')} />
          ) : (policies?.items ?? []).length === 0 ? (
            <EmptyState text={t('access.policies.empty', '暂无访问规则')} />
          ) : (
            <DataPolicyTable
              rows={policies?.items ?? []}
              onEdit={setEditingPolicy}
              onDisable={(policy) => void disablePolicy(policy)}
              disabling={updatePolicy.isPending}
            />
          )}
          <section className="mt-4 rounded-md border" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--bg-hover)]"
              onClick={() => setShowAdvancedProfiles((value) => !value)}
            >
              <div className="flex min-w-0 items-center gap-2">
                {showAdvancedProfiles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <div className="min-w-0">
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                    {t('access.profiles.section', '执行护栏（高级）')}
                    <span className="ml-2 font-normal" style={{ color: 'var(--text-3)' }}>{profiles?.total ?? 0}</span>
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {t('access.profiles.helper', '仅调整 data-platform 侧行数、超时、审计和状态；真实 CredentialBinding / RAM 由 gateway 维护')}
                  </div>
                </div>
              </div>
              {showAdvancedProfiles ? (
                <Chip tone="neutral">{t('access.profiles.controlled', '受控配置')}</Chip>
              ) : (
                <Chip tone="neutral">{t('access.profiles.collapsed', '默认收起')}</Chip>
              )}
            </button>
            {showAdvancedProfiles && (
              <div className="border-t p-3" style={{ borderColor: 'var(--border)' }}>
                {loadingProfiles ? (
                  <LoadingRows />
                ) : profileError ? (
                  <EmptyState tone="danger" text={t('access.profiles.loadFailed', '执行配置加载失败')} />
                ) : (profiles?.items ?? []).length === 0 ? (
                  <EmptyState text={t('access.profiles.empty', '暂无执行配置')} />
                ) : (
                  <ExecutionProfileList
                    rows={profiles?.items ?? []}
                    onEdit={setEditingProfile}
                    onDisable={(profile) => void disableProfile(profile)}
                    disabling={updateProfile.isPending}
                  />
                )}
              </div>
            )}
          </section>
        </section>
      </div>
      <ExecutionProfileDialog
        open={Boolean(editingProfile)}
        profile={editingProfile}
        onClose={() => setEditingProfile(null)}
      />
      <DataPolicyDialog open={creatingPolicy} onClose={() => setCreatingPolicy(false)} />
      <DataPolicyDialog
        open={Boolean(editingPolicy)}
        policy={editingPolicy}
        onClose={() => setEditingPolicy(null)}
      />
    </div>
  )
}

function PermissionAuditWorkspace() {
  const toast = useToast()
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const {
    data: decisions,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = usePolicyDecisions({ limit: 50 })
  const rows = decisions?.items ?? []
  const governanceRows = rows.filter((row) => row.governance_required)
  const deniedRows = rows.filter((row) => row.decision !== 'allow')
  const refreshing = manualRefreshing || isFetching

  const refresh = async () => {
    setManualRefreshing(true)
    try {
      const result = await refetch()
      if (result.isError) throw result.error
      toast.show({ tone: 'success', title: t('access.audit.refreshSuccess', '权限审计已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.audit.refreshFailed', '权限审计刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex justify-end">
        <RefreshButton
          onClick={() => void refresh()}
          loading={refreshing}
          ariaLabel={t('access.audit.refresh', '刷新权限审计')}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <GatewayMetricCard
          label={t('access.audit.metric.governanceRequired', '需治理记录')}
          value={governanceRows.length}
          detail={t('access.audit.metric.governanceRequiredDetail', '需要治理、阻断或人工复核的访问判定')}
        />
        <GatewayMetricCard
          label={t('access.audit.metric.decisions', '权限判定记录')}
          value={decisions?.total ?? rows.length}
          detail={t('access.audit.metric.decisionsDetail', '最近策略命中与准入结果')}
        />
        <GatewayMetricCard
          label={t('access.audit.metric.denied', '拦截记录')}
          value={deniedRows.length}
          tone={deniedRows.length > 0 ? 'warning' : 'neutral'}
          detail={t('access.audit.metric.deniedDetail', 'DataPolicy 或执行护栏拒绝')}
        />
      </div>

      <div className="mt-4 space-y-4">
        <section className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
          <PanelTitle title={t('access.audit.governance.section', '治理要求记录')} count={governanceRows.length} />
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.audit.loadFailed', '权限审计加载失败')} />
          ) : governanceRows.length === 0 ? (
            <EmptyState text={t('access.audit.governance.empty', '暂无需要治理或复核的访问记录')} />
          ) : (
            <GovernanceRecordTable rows={governanceRows} />
          )}
        </section>
        <section className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
          <PanelTitle title={t('access.audit.decisions.section', '最近权限判定')} count={rows.length} />
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.decisions.loadFailed', '判定记录加载失败')} />
          ) : rows.length === 0 ? (
            <EmptyState text={t('access.decisions.empty', '暂无判定记录')} />
          ) : (
            <PolicyDecisionTable rows={rows.slice(0, 8)} />
          )}
        </section>
      </div>
    </div>
  )
}

function GatewayObservabilityWorkspace() {
  const [traceRun, setTraceRun] = useState<GatewayQueryRun | null>(null)
  const [recordPage, setRecordPage] = useState(1)
  const [activeGatewayTab, setActiveGatewayTab] = useState<GatewayObservabilityTab>('overview')
  const snapshotQuery = useGatewayObservability(GATEWAY_OBSERVABILITY_PARAMS)
  const snapshot = snapshotQuery.data
  const summary = snapshot?.summary ?? EMPTY_GATEWAY_SUMMARY
  const alertEvaluation = snapshot?.alerts ?? EMPTY_GATEWAY_ALERTS
  const rows = useMemo(() => snapshot?.query_runs.items ?? [], [snapshot?.query_runs.items])
  const isLoading = snapshotQuery.isLoading
  const isError = snapshotQuery.isError
  const dataQuality = useMemo(
    () => summarizeGatewayDataQuality(rows, snapshot?.contract_completeness),
    [rows, snapshot?.contract_completeness],
  )
  const trendRows = useMemo(
    () => buildGatewayTrendFromTimeseries(snapshot?.timeseries.points ?? []) || buildGatewayTrend(rows),
    [rows, snapshot?.timeseries.points],
  )
  const trendSummary = useMemo(() => summarizeGatewayTrend(trendRows), [trendRows])
  const paginatedRows = useMemo(
    () => paginateGatewayRows(rows, recordPage, GATEWAY_RECORD_PAGE_SIZE),
    [recordPage, rows],
  )
  const breakdownRows = useMemo(
    () => gatewayBreakdownRows(snapshot, summary),
    [snapshot, summary],
  )
  const credentialIssueCount = Number(summary.credential_missing_count ?? 0) + Number(summary.credential_invalid_count ?? 0)
  const gatewayDeniedCount = Number(summary.sql_guard_rejected_count ?? summary.rejected_count ?? 0)
  const refresh = () => {
    void snapshotQuery.refetch()
  }
  const gatewayTabs = [
    { value: 'overview', label: t('access.gateway.tabs.overview', '监控概览'), icon: Activity },
    { value: 'runtime', label: t('access.gateway.tabs.runtime', '运行指标'), icon: RotateCw },
    { value: 'trace', label: t('access.gateway.tabs.trace', 'Trace 查询'), icon: FileSearch },
    { value: 'quality', label: t('access.gateway.tabs.quality', '契约质量'), icon: ShieldCheck },
  ] as const
  const handleGatewayTabChange = (value: string) => {
    if (value === 'overview' || value === 'runtime' || value === 'trace' || value === 'quality') {
      setActiveGatewayTab(value)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[240px] flex-1 text-xs" style={{ color: 'var(--text-3)' }}>
          {t('access.gateway.source.detail', '当前页展示查询运行、稳定性、拦截、物理拒绝与契约质量等网关遥测结果。')}
        </div>
        <RefreshButton
          onClick={refresh}
          loading={snapshotQuery.isFetching}
          ariaLabel={t('access.gateway.refresh', '刷新网关观测')}
        />
      </div>
      <Tabs
        value={activeGatewayTab}
        onChange={handleGatewayTabChange}
        size="sm"
        className="mb-3"
        aria-label={t('access.gateway.tabs.label', '网关观测模块')}
      >
        {gatewayTabs.map(({ value, label, icon: Icon }) => (
          <Tab key={value} value={value}>
            <Icon size={13} />
            <span>{label}</span>
          </Tab>
        ))}
      </Tabs>
      {isError ? (
        <div className="mb-3">
          <EmptyState tone="danger" text={t('access.gateway.loadFailed', '网关观测加载失败，请检查 data-platform 到 dw-query-gateway 的服务令牌和网络连通性')} />
        </div>
      ) : null}
      <GatewayDataQualityPanel quality={dataQuality} loading={snapshotQuery.isLoading} />
      {activeGatewayTab === 'overview' ? (
        <>
          <GatewayAlertPanel evaluation={alertEvaluation} loading={snapshotQuery.isLoading} />
          <GatewayQueryMetricGrid summary={summary} isLoading={isLoading} gatewayDeniedCount={gatewayDeniedCount} />
          <AccessTrendPanel
            rows={trendRows}
            summary={trendSummary}
            quality={dataQuality}
            windowLabel={snapshot?.window ?? GATEWAY_OBSERVABILITY_PARAMS.window}
          />
        </>
      ) : null}
      {activeGatewayTab === 'runtime' ? (
        <>
          <GatewayRuntimeMetricGrid summary={summary} isLoading={isLoading} />
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <GatewayRuntimeObjectPanel summary={summary} loading={isLoading} />
            <PhysicalPermissionPanel
              physicalDeniedCount={summary.physical_denied_count}
              credentialIssueCount={credentialIssueCount}
              deniedCount={gatewayDeniedCount}
              stabilityRate={`${summary.stability}%`}
            />
          </div>
        </>
      ) : null}
      {activeGatewayTab === 'trace' ? (
        <section className="rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
          <PanelTitle title={t('access.gateway.records.section', '全平台访问记录')} count={snapshot?.query_runs.total ?? rows.length} />
          {isLoading ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState text={t('access.gateway.records.empty', '暂无网关执行记录')} />
          ) : (
            <>
              <GatewayExecutionRecordTable rows={paginatedRows.items} onOpenTrace={setTraceRun} />
              <ListPagination
                page={paginatedRows.page}
                pageSize={paginatedRows.pageSize}
                total={paginatedRows.total}
                onPageChange={setRecordPage}
              />
            </>
          )}
        </section>
      ) : null}
      {activeGatewayTab === 'quality' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <GatewayContractPanel contract={snapshot?.contract_completeness} loading={isLoading} />
          </div>
          <GatewayBreakdownPanel rows={breakdownRows} total={summary.query_count} />
        </div>
      ) : null}
      <GatewayTraceDialog run={traceRun} onClose={() => setTraceRun(null)} />
    </div>
  )
}

function GatewayRuntimeMetricGrid({
  summary,
  isLoading,
}: {
  summary: GatewayTelemetrySummary
  isLoading: boolean
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <GatewayMetricCard
        label={t('access.gateway.runtime.queue', '排队 / 运行 / 等待')}
        value={isLoading ? '—' : `${summary.queued_count} / ${summary.running_count} / ${summary.pending_count}`}
        detail={t('access.gateway.runtime.queueDetail', '当前运行态')}
        tone={summary.pending_count > 0 ? 'warning' : 'neutral'}
      />
      <GatewayMetricCard
        label={t('access.gateway.runtime.queueWait', '排队等待')}
        value={isLoading
          ? '—'
          : `${formatDurationMs(summary.avg_queue_wait_ms)} / ${formatDurationMs(summary.max_current_queue_wait_ms)}`}
        detail={t('access.gateway.runtime.queueWaitDetail', '平均等待 / 当前最大等待，P95 {p95}', {
          p95: formatDurationMs(summary.queue_wait_p95_ms ?? 0),
        })}
        tone={summary.max_current_queue_wait_ms > 0 ? 'warning' : 'neutral'}
      />
      <GatewayMetricCard
        label={t('access.gateway.runtime.executeMs', '执行耗时')}
        value={isLoading
          ? '—'
          : `${formatDurationMs(summary.avg_execute_ms)} / ${formatDurationMs(summary.execute_p95_ms ?? 0)}`}
        detail={t('access.gateway.runtime.executeMsDetail', '平均 / P95 执行耗时')}
      />
      <GatewayMetricCard
        label={t('access.gateway.runtime.timeouts', '超时 / 拒绝')}
        value={isLoading ? '—' : `${summary.timeout_count} / ${summary.rejected_count}`}
        detail={t('access.gateway.runtime.timeoutsDetail', '远端、客户端等待和策略拒绝')}
        tone={summary.timeout_count + summary.rejected_count > 0 ? 'warning' : 'neutral'}
      />
    </div>
  )
}

function GatewayQueryMetricGrid({
  summary,
  isLoading,
  gatewayDeniedCount,
}: {
  summary: GatewayTelemetrySummary
  isLoading: boolean
  gatewayDeniedCount: number
}) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <GatewayMetricCard
        label={t('access.gateway.metric.queries', '查询次数')}
        value={isLoading ? '—' : summary.query_count}
        detail={t('access.gateway.metric.queriesDetail', '真实执行记录')}
      />
      <GatewayMetricCard
        label={t('access.gateway.metric.allowed', '执行成功')}
        value={isLoading ? '—' : summary.success_count}
        detail={t('access.gateway.metric.allowedDetail', '按 query_runs 状态统计')}
      />
      <GatewayMetricCard
        label={t('access.gateway.metric.denied', '网关拦截')}
        value={isLoading ? '—' : gatewayDeniedCount}
        detail={t('access.gateway.metric.deniedDetail', 'SQL guard 或执行护栏拦截')}
      />
      <GatewayMetricCard
        label={t('access.gateway.metric.physicalDenied', '物理拒绝')}
        value={isLoading ? '—' : summary.physical_denied_count}
        detail={t('access.gateway.metric.physicalDeniedDetail', '平台放行后的物理权限拒绝')}
        tone={summary.physical_denied_count > 0 ? 'warning' : 'neutral'}
      />
      <GatewayMetricCard
        label={t('access.gateway.metric.stability', '稳定性')}
        value={isLoading ? '—' : `${summary.stability}%`}
        detail={formatGatewayStabilityBasis(summary)}
      />
    </div>
  )
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0ms'
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let current = value
  let index = 0
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`
}

function GatewayAlertPanel({
  evaluation,
  loading,
}: {
  evaluation: GatewayRuntimeAlerts
  loading: boolean
}) {
  const tone = gatewayAlertTone(evaluation.status)
  const color = tone === 'danger'
    ? 'var(--danger)'
    : tone === 'warning'
      ? 'var(--warning)'
      : 'var(--success)'
  const soft = tone === 'danger'
    ? 'var(--danger-soft)'
    : tone === 'warning'
      ? 'var(--warning-soft)'
      : 'var(--success-soft)'
  const Icon = tone === 'neutral' ? CheckCircle2 : AlertTriangle
  const checks = evaluation.readiness?.checks && typeof evaluation.readiness.checks === 'object'
    ? Object.entries(evaluation.readiness.checks)
    : []
  const visibleAlerts = evaluation.alerts.slice(0, 2)
  const extraAlertCount = Math.max(0, evaluation.alerts.length - visibleAlerts.length)
  return (
    <section
      className="mb-3 rounded-md border px-3 py-2 text-xs"
      style={{
        borderColor: color,
        background: soft,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0" style={{ color }} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                {t('access.gateway.alerts.section', 'Gateway 告警')}
              </span>
              <Chip tone={tone}>{formatGatewayAlertSeverityLabel(evaluation.status)}</Chip>
              {evaluation.evaluated_at ? (
                <span style={{ color: 'var(--text-3)' }}>
                  {t('access.gateway.alerts.evaluatedAt', '评价时间 {time}', { time: fmtDateTime(evaluation.evaluated_at) })}
                </span>
              ) : null}
            </div>
            <div className="mt-1" style={{ color: 'var(--text-3)' }}>
              {t('access.gateway.alerts.source', '基于网关健康检查与运行遥测评价。')}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {checks.slice(0, 5).map(([name, value]) => {
            const ok = String(value).toLowerCase() === 'ok' || String(value).toLowerCase() === 'healthy' || String(value) === '0'
            return (
              <Chip key={name} tone={ok ? 'neutral' : 'danger'}>
                {name}: {String(value)}
              </Chip>
            )
          })}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}
        </div>
      ) : evaluation.alerts.length === 0 ? (
        <div className="mt-2 rounded border border-dashed px-3 py-2" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
          {t('access.gateway.alerts.empty', '当前未触发基础运行态告警')}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {visibleAlerts.map((alert) => (
            <div
              key={alert.code}
              className="min-w-[260px] flex-1 rounded border px-3 py-2"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-1)' }}>{alert.title}</span>
                <Chip tone={gatewayAlertTone(alert.severity)}>{formatGatewayAlertSeverityLabel(alert.severity)}</Chip>
              </div>
              <div className="mt-1 truncate" style={{ color: 'var(--text-3)' }} title={alert.message}>{alert.message}</div>
            </div>
          ))}
          {extraAlertCount > 0 ? (
            <div className="flex items-center rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-3)' }}>
              {t('access.gateway.alerts.more', '还有 {count} 个告警', { count: extraAlertCount })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function GatewayRuntimeObjectPanel({
  summary,
  loading,
}: {
  summary: GatewayTelemetrySummary
  loading: boolean
}) {
  return (
    <section className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
        {t('access.gateway.runtime.section', '运行对象')}
      </div>
      <div className="mt-3 space-y-2">
        <GatewayCheckRow
          label={t('access.gateway.runtime.timeoutBreakdown', '超时拆分')}
          text={loading ? '—' : `${summary.remote_timeout_count} / ${summary.client_wait_timeout_count}`}
          helper={t('access.gateway.runtime.timeoutBreakdownDetail', '远端超时 / 客户端等待超时')}
          danger={!loading && summary.timeout_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.exportFlow', '导出链路')}
          text={loading ? '—' : `${summary.export_request_count} / ${summary.export_started_count} / ${summary.export_success_count} / ${summary.export_not_ready_count} / ${summary.export_failure_count}`}
          helper={t('access.gateway.runtime.exportFlowDetail', '请求 / 已开始 / 成功 / 未就绪 / 失败')}
          danger={!loading && summary.export_failure_count + summary.export_not_ready_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.resultGuardrails', '结果护栏')}
          value={loading ? undefined : summary.result_rejected_count}
          text={loading ? '—' : undefined}
          helper={t('access.gateway.runtime.resultGuardrailsDetail', '整体过大 {tooLarge}，单行过大 {rowTooLarge}，最大结果 {maxBytes}，最大单行 {maxRowBytes}', {
            tooLarge: summary.result_too_large_rejected_count,
            rowTooLarge: summary.result_row_too_large_rejected_count,
            maxBytes: formatBytes(summary.max_result_rejected_bytes),
            maxRowBytes: formatBytes(summary.max_result_rejected_row_bytes),
          })}
          danger={!loading && summary.result_rejected_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.resultObjects', '结果对象')}
          value={loading ? undefined : summary.result_object_count}
          text={loading ? '—' : undefined}
          helper={t('access.gateway.runtime.resultObjectsDetail', 'gateway 管理的结果对象数量')}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.spoolObjects', 'Spool 对象')}
          value={loading ? undefined : summary.spool_object_count}
          text={loading ? '—' : undefined}
          helper={summary.generated_at ? t('access.gateway.runtime.spoolObjectsDetail', '总量 {bytes}，更新时间 {time}', { bytes: formatBytes(summary.spool_result_total_bytes), time: fmtDateTime(summary.generated_at) }) : t('access.gateway.runtime.generatedAtEmpty', '等待 gateway 汇总时间')}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.authProtocolEvents', '认证 / 协议事件')}
          text={loading ? '—' : `${summary.auth_denied_count} / ${summary.invalid_token_count ?? 0} / ${summary.missing_token_count ?? 0} / ${summary.legacy_protocol_count}`}
          helper={t('access.gateway.runtime.authProtocolEventsDetail', '认证拒绝 / 无效令牌 / 缺失令牌 / legacy 协议调用')}
          danger={!loading && summary.auth_denied_count + (summary.invalid_token_count ?? 0) + (summary.missing_token_count ?? 0) + summary.legacy_protocol_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.credentialEvents', '凭据事件')}
          text={loading ? '—' : `${summary.credential_missing_count ?? 0} / ${summary.credential_invalid_count ?? 0}`}
          helper={t('access.gateway.runtime.credentialEventsDetail', '绑定缺失 / 凭据无效')}
          danger={!loading && (summary.credential_missing_count ?? 0) + (summary.credential_invalid_count ?? 0) > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.workerEvents', 'Worker 健康事件')}
          text={loading ? '—' : `${summary.worker_heartbeat_stale_count} / ${summary.worker_orphan_lease_reclaimed_count} / ${summary.gateway_readyz_degraded_count}`}
          helper={t('access.gateway.runtime.workerEventsDetail', '心跳过期 / 孤儿租约回收 / 健康检查降级')}
          danger={!loading && summary.worker_heartbeat_stale_count + summary.gateway_readyz_degraded_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.runtime.workerCapacity', 'Worker 容量')}
          text={loading ? '—' : `${summary.live_worker_count ?? 0} / ${summary.active_worker_count ?? 0} / ${summary.worker_capacity ?? 0}`}
          helper={t('access.gateway.runtime.workerCapacityDetail', '存活 / 活跃 / 配置容量')}
          danger={!loading && Number(summary.worker_capacity ?? 0) > 0 && Number(summary.live_worker_count ?? 0) <= 0}
        />
      </div>
    </section>
  )
}

function GatewayDataQualityPanel({
  quality,
  loading,
}: {
  quality: GatewayDataQualitySummary
  loading: boolean
}) {
  if (loading || !quality.hasDataGap) return null
  return (
    <section
      className="mb-3 rounded-md border px-3 py-2 text-xs"
      style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
        <span className="font-medium" style={{ color: 'var(--text-1)' }}>
          {t('access.gateway.quality.title', '最近执行记录存在字段缺失')}
        </span>
        <Chip tone={quality.hasIdentityGap ? 'warning' : 'neutral'}>
          {t('access.gateway.quality.identityMissing', '身份缺失 {count}/{total}', {
            count: quality.identityMissingCount,
            total: quality.total,
          })}
        </Chip>
        <Chip tone={quality.dataLevelMissingCount > 0 ? 'warning' : 'neutral'}>
          {t('access.gateway.quality.levelMissing', '等级缺失 {count}/{total}', {
            count: quality.dataLevelMissingCount,
            total: quality.total,
          })}
        </Chip>
        <Chip tone={quality.executionProfileMissingCount > 0 ? 'warning' : 'neutral'}>
          {t('access.gateway.quality.profileMissing', '执行方式缺失 {count}/{total}', {
            count: quality.executionProfileMissingCount,
            total: quality.total,
          })}
        </Chip>
        <Chip tone={quality.policyDecisionMissingCount > 0 ? 'warning' : 'neutral'}>
          {t('access.gateway.quality.policyDecisionMissing', '策略链路缺失 {count}/{total}', {
            count: quality.policyDecisionMissingCount,
            total: quality.total,
          })}
        </Chip>
        <Chip tone={quality.credentialRefMissingCount > 0 ? 'warning' : 'neutral'}>
          {t('access.gateway.quality.credentialMissing', '执行凭据缺失 {count}/{total}', {
            count: quality.credentialRefMissingCount,
            total: quality.total,
          })}
        </Chip>
      </div>
      {quality.hasIdentityGap ? (
        <div className="mt-1 pl-6" style={{ color: 'var(--text-3)' }}>
          {quality.source === 'contract'
            ? t('access.gateway.quality.contractNote', '缺口来自 gateway contract-completeness；gateway-only {gatewayOnly} 条、legacy actor {legacyActor} 条、平台治理链路 {governed} 条。', {
              gatewayOnly: quality.gatewayOnlyCount,
              legacyActor: quality.legacyActorCount,
              governed: quality.platformGovernedCount,
            })
            : t('access.gateway.quality.identityNote', 'DAU 只能按 gateway 返回的 principal / actor 计算；缺身份的记录不会计入活跃主体。')}
        </div>
      ) : null}
    </section>
  )
}

function GatewayMetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  detail: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: tone === 'warning' ? 'var(--warning)' : 'var(--border)',
        background: 'var(--bg-surface)',
      }}
    >
      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{detail}</div>
    </div>
  )
}

function AccessTrendPanel({
  rows,
  summary,
  quality,
  windowLabel,
}: {
  rows: AccessTrendPoint[]
  summary: GatewayTrendSummary
  quality: GatewayDataQualitySummary
  windowLabel?: string
}) {
  const maxCount = Math.max(1, ...rows.map((row) => row.total))
  const maxSecondary = Math.max(1, ...rows.map((row) => summary.usesGatewayTimeseries ? Number(row.executeP95Ms ?? 0) : row.dau))
  const latestDauValue = summary.latestDayQueries > 0 && summary.latestDayDau === 0 && quality.hasIdentityGap ? '—' : summary.latestDayDau
  const latestSuccessRate = summary.latestSuccessRate == null ? '—' : `${formatRatioPercent(summary.latestSuccessRate)}%`
  return (
    <section className="mt-4 rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('access.gateway.trend.section', '查询量日趋势')}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
            {summary.usesGatewayTimeseries
              ? t('access.gateway.trend.helperTimeseries', '按聚合窗口统计查询量、成功率和执行 P95')
              : t('access.gateway.trend.helper', '按最近执行记录聚合每日查询量、成功/失败和活跃主体')}
          </div>
        </div>
        <Chip tone="neutral">{summary.usesGatewayTimeseries ? (windowLabel || '24h') : t('access.gateway.trend.window', '最近记录')}</Chip>
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <TrendSummaryItem
          label={t('access.gateway.trend.totalQueries', '窗口查询量')}
          value={summary.totalQueries}
          detail={summary.usesGatewayTimeseries ? t('access.gateway.trend.totalQueriesDetailTimeseries', 'gateway 聚合窗口合计') : t('access.gateway.trend.totalQueriesDetail', '最近记录窗口合计')}
        />
        <TrendSummaryItem
          label={summary.usesGatewayTimeseries ? t('access.gateway.trend.latestBucketQueries', '最新桶查询') : t('access.gateway.trend.latestQueries', '最新日查询')}
          value={summary.latestDayQueries}
          detail={summary.latestDayLabel || t('access.gateway.trend.noLatestDay', '暂无日期')}
        />
        <TrendSummaryItem
          label={summary.usesGatewayTimeseries ? t('access.gateway.trend.latestSuccessRate', '最新桶成功率') : t('access.gateway.trend.latestDau', '最新日 DAU')}
          value={summary.usesGatewayTimeseries ? latestSuccessRate : latestDauValue}
          detail={summary.usesGatewayTimeseries ? t('access.gateway.trend.latestSuccessRateDetail', 'gateway success_rate') : quality.hasIdentityGap ? t('access.gateway.trend.latestDauMissing', 'gateway 未返回部分身份') : t('access.gateway.trend.latestDauDetail', '去重 principal / actor')}
        />
        <TrendSummaryItem
          label={summary.usesGatewayTimeseries ? t('access.gateway.trend.peakExecuteP95', '执行 P95 峰值') : t('access.gateway.trend.windowDau', '窗口活跃主体')}
          value={summary.usesGatewayTimeseries ? formatDurationMs(summary.peakExecuteP95Ms) : summary.windowDau}
          detail={summary.usesGatewayTimeseries ? t('access.gateway.trend.peakExecuteP95Detail', '窗口内最高执行 P95') : t('access.gateway.trend.windowDauDetail', '跨日去重')}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState text={t('access.gateway.trend.empty', '暂无访问趋势')} />
      ) : (
        <div
          className="grid min-h-[168px] items-end gap-2 overflow-x-auto"
          style={{ gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(36px, 1fr))` }}
        >
          {rows.map((row) => {
            const totalHeight = Math.max(10, Math.round((row.total / maxCount) * 96))
            const allowHeight = row.total > 0 ? Math.max(2, Math.round((row.allow / row.total) * totalHeight)) : 0
            const blockedHeight = Math.max(0, totalHeight - allowHeight)
            const secondaryValue = summary.usesGatewayTimeseries ? Number(row.executeP95Ms ?? 0) : row.dau
            const secondaryHeight = secondaryValue > 0 ? Math.max(4, Math.round((secondaryValue / maxSecondary) * 28)) : 0
            return (
              <div key={row.key} className="flex min-w-0 flex-col items-center gap-1.5">
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className="flex w-full max-w-[44px] flex-col justify-end overflow-hidden rounded-t"
                    style={{ height: totalHeight, background: 'var(--bg-surface-2)' }}
                    title={t('access.gateway.chartTitle', '{label} · 查询 {total} · DAU {dau}', {
                      label: row.label,
                      total: row.total,
                      dau: row.dau,
                    })}
                  >
                    {blockedHeight > 0 ? (
                      <div style={{ height: blockedHeight, background: 'var(--danger)' }} />
                    ) : null}
                    {allowHeight > 0 ? (
                      <div style={{ height: allowHeight, background: 'var(--accent)' }} />
                    ) : null}
                  </div>
                </div>
                <div className="flex h-7 w-full items-end justify-center">
                  <div
                    className="w-full max-w-[44px] rounded-t"
                    style={{
                      height: secondaryHeight,
                      background: secondaryValue > 0 ? 'var(--success)' : 'var(--bg-surface-2)',
                    }}
                    title={summary.usesGatewayTimeseries ? `${row.label} · P95 ${formatDurationMs(secondaryValue)}` : `${row.label} · DAU ${row.dau}`}
                  />
                </div>
                <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{row.label}</div>
                <div className="font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.total}</div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                  {summary.usesGatewayTimeseries ? `P95 ${formatDurationMs(secondaryValue)}` : `DAU ${row.dau}`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TrendSummaryItem({
  label,
  value,
  detail,
}: {
  label: string
  value: number | string
  detail: string
}) {
  return (
    <div className="rounded border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" style={{ color: 'var(--text-1)' }}>{value}</div>
      <div className="mt-1 truncate text-[10px]" style={{ color: 'var(--text-3)' }}>{detail}</div>
    </div>
  )
}

function GatewayBreakdownPanel({
  rows,
  total,
}: {
  rows: Array<{ level: string; count: number }>
  total: number
}) {
  return (
    <section className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
        {t('access.gateway.breakdown.section', '访问等级分布')}
      </div>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <EmptyState text={t('access.gateway.breakdown.empty', '暂无访问分布')} />
        ) : rows.map((row) => {
          const width = total > 0 ? Math.max(8, Math.round((row.count / total) * 100)) : 0
          return (
            <div key={row.level}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span style={{ color: 'var(--text-2)' }}>{formatGatewayBreakdownKey(row.level)}</span>
                <span className="tabular-nums" style={{ color: 'var(--text-3)' }}>{row.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--bg-surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${width}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GatewayContractPanel({
  contract,
  loading,
}: {
  contract?: GatewayContractCompleteness | null
  loading: boolean
}) {
  const data = contract ?? {
    total: 0,
    platform_governed_count: 0,
    gateway_only_count: 0,
    legacy_actor_count: 0,
    principal_present_rate: 100,
    actor_present_rate: 100,
    policy_decision_present_rate: 100,
    data_level_present_rate: 100,
    execution_profile_present_rate: 100,
    credential_ref_present_rate: 100,
  }
  return (
    <section className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
        {t('access.gateway.contract.section', '契约完整度')}
      </div>
      <div className="mt-3 space-y-2">
        <GatewayCheckRow
          label={t('access.gateway.contract.coverage', '平台治理 / gateway-only')}
          text={loading ? '—' : `${data.platform_governed_count} / ${data.gateway_only_count}`}
          helper={t('access.gateway.contract.coverageDetail', '新版 GatewayAccessContext 覆盖情况')}
          danger={!loading && data.gateway_only_count > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.contract.identity', '身份字段')}
          text={loading ? '—' : `${formatGatewayContractRate(data.principal_present_rate)} / ${formatGatewayContractRate(data.actor_present_rate)}`}
          helper={t('access.gateway.contract.identityDetail', 'principal / actor present rate')}
          danger={!loading && Math.min(data.principal_present_rate, data.actor_present_rate) < 95}
        />
        <GatewayCheckRow
          label={t('access.gateway.contract.policyProfile', '策略 / 执行方式')}
          text={loading ? '—' : `${formatGatewayContractRate(data.policy_decision_present_rate)} / ${formatGatewayContractRate(data.execution_profile_present_rate)}`}
          helper={t('access.gateway.contract.policyProfileDetail', 'policy_decision / execution_profile present rate')}
          danger={!loading && Math.min(data.policy_decision_present_rate, data.execution_profile_present_rate) < 95}
        />
        <GatewayCheckRow
          label={t('access.gateway.contract.dataCredential', '等级 / 凭据')}
          text={loading ? '—' : `${formatGatewayContractRate(data.data_level_present_rate)} / ${formatGatewayContractRate(data.credential_ref_present_rate)}`}
          helper={t('access.gateway.contract.dataCredentialDetail', 'data_level / credential_ref present rate')}
          danger={!loading && Math.min(data.data_level_present_rate, data.credential_ref_present_rate) < 95}
        />
      </div>
    </section>
  )
}

function GatewayExecutionRecordTable({
  rows,
  onOpenTrace,
}: {
  rows: GatewayQueryRun[]
  onOpenTrace: (run: GatewayQueryRun) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[920px] w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: 132 }} />
          <col style={{ width: 210 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 168 }} />
          <col style={{ width: 92 }} />
          <col />
          <col style={{ width: 64 }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
            <Th>{t('access.gateway.record_col.time', '时间')}</Th>
            <Th>{t('access.gateway.record_col.principal', '成员')}</Th>
            <Th>{t('access.gateway.record_col.level', '等级')}</Th>
            <Th>{t('access.gateway.record_col.profile', '执行方式')}</Th>
            <Th>{t('access.gateway.record_col.result', '结果')}</Th>
            <Th>{t('access.gateway.record_col.reason', '原因')}</Th>
            <Th>{t('access.gateway.record_col.trace', 'Trace')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.query_id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-3)' }}>
                {row.created_at ? fmtDateTime(row.created_at) : '—'}
              </td>
              <td className="px-4 py-2.5">
                <GatewayRunActorCell row={row} />
              </td>
              <td className="px-4 py-2.5">
                {row.data_level ? formatDataLevelLabel(row.data_level) : <MissingGatewayField label={t('access.gateway.records.missingLevelShort', '未返回')} title={t('access.gateway.records.missingLevel', '未返回等级')} />}
              </td>
              <td className="px-4 py-2.5">
                <ExecutionProfileCell
                  profileCode={row.execution_profile_code}
                  missingTitle={t('access.gateway.records.missingProfile', '未返回执行方式')}
                />
                <div className="mt-1 truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.credential_ref || '—'}</div>
              </td>
              <td className="px-4 py-2.5">
                <StatusChip status={row.physical_denied ? 'physical_denied' : row.status} />
              </td>
              <td className="px-4 py-2.5">
                <ReasonCell reasonCode={row.reason_code} physicalDenied={row.physical_denied} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded border transition-colors hover:bg-[color:var(--bg-hover)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                  aria-label={t('access.gateway.records.openTraceAria', '查看执行 Trace {queryId}', { queryId: row.query_id })}
                  title={t('access.gateway.records.trace', '查看')}
                  onClick={() => onOpenTrace(row)}
                >
                  <FileSearch size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GatewayRunActorCell({ row }: { row: GatewayQueryRun }) {
  return (
    <span className="block truncate" title={formatGatewayRunActorDisplayName(row)} style={{ color: 'var(--text-1)' }}>
      {formatGatewayRunActorDisplayName(row)}
    </span>
  )
}

function formatGatewayRunActorDisplayName(row: GatewayQueryRun): string {
  const displayName = [
    row.principal_display_name,
    row.principal_name,
    row.actor_display_name,
    row.actor_name,
  ]
    .map((value) => String(value || '').trim())
    .find(Boolean)
  return displayName || t('access.gateway.records.mysteryUser', '神秘用户')
}

function MissingGatewayField({
  label,
  title,
  tone = 'neutral',
}: {
  label: string
  title: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[11px]"
      title={title}
      style={{
        color: tone === 'warning' ? 'var(--warning)' : 'var(--text-3)',
        background: tone === 'warning' ? 'var(--warning-soft)' : 'var(--bg-surface-2)',
      }}
    >
      {label}
    </span>
  )
}

function ExecutionProfileCell({
  profileCode,
  missingTitle = t('access.profiles.missing', '未配置执行方式'),
}: {
  profileCode?: string | null
  missingTitle?: string
}) {
  if (!String(profileCode || '').trim()) {
    return <MissingGatewayField label="—" title={missingTitle} />
  }
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[11px]"
      style={{ color: 'var(--text-2)', background: 'var(--bg-surface-2)' }}
    >
      {formatExecutionProfileAccessLabel(profileCode)}
    </span>
  )
}

function PhysicalPermissionPanel({
  physicalDeniedCount,
  credentialIssueCount,
  deniedCount,
  stabilityRate,
}: {
  physicalDeniedCount: number
  credentialIssueCount: number
  deniedCount: number
  stabilityRate: string
}) {
  return (
    <section className="rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
        {t('access.gateway.physical.section', '物理权限检查')}
      </div>
      <div className="mt-3 space-y-2">
        <GatewayCheckRow
          label={t('access.gateway.physical.policyDrift', '平台放行后物理拒绝')}
          value={physicalDeniedCount}
          danger={physicalDeniedCount > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.physical.credentialIssues', '凭据解析异常')}
          value={credentialIssueCount}
          danger={credentialIssueCount > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.physical.policyDenied', '网关拦截')}
          value={deniedCount}
          danger={deniedCount > 0}
        />
        <GatewayCheckRow
          label={t('access.gateway.physical.stability', '近期稳定性')}
          text={stabilityRate}
          danger={stabilityRate !== '100%'}
        />
        <GatewayCheckRow
          label={t('access.gateway.physical.rawGuard', 'ODS / RAW / M3')}
          text={t('access.gateway.physical.rawGuardValue', '默认阻断')}
        />
      </div>
    </section>
  )
}

function GatewayCheckRow({
  label,
  value,
  text,
  helper,
  danger = false,
}: {
  label: string
  value?: number
  text?: string
  helper?: string
  danger?: boolean
}) {
  return (
    <div className="rounded border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0" style={{ color: 'var(--text-2)' }}>{label}</span>
        <span className="min-w-0 break-words text-right font-medium tabular-nums" style={{ color: danger ? 'var(--danger)' : 'var(--text-1)' }}>
          {typeof value === 'number' ? value : text}
        </span>
      </div>
      {helper ? <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{helper}</div> : null}
    </div>
  )
}

function GatewayTraceDialog({
  run,
  onClose,
}: {
  run: GatewayQueryRun | null
  onClose: () => void
}) {
  const steps = run ? [
    [t('access.gateway.trace.principal', 'Principal 解析'), run.principal_id || '—'],
    [t('access.gateway.trace.policy', 'DataPolicy 判定'), run.policy_decision_id || '—'],
    [t('access.gateway.trace.profile', '执行方式'), formatExecutionProfileAccessLabel(run.execution_profile_code)],
    [t('access.gateway.trace.runtime', '执行服务'), run.status],
    [t('access.gateway.trace.physical', 'MaxCompute 兜底'), run.physical_denied ? t('access.gateway.trace.physicalDenied', '物理拒绝') : t('access.gateway.trace.physicalPending', '未触发物理拒绝')],
  ] : []

  return (
    <Dialog open={Boolean(run)} onClose={onClose} title={t('access.gateway.trace.title', '执行 Trace')} width={680}>
      {run ? (
        <div className="space-y-4 text-xs">
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded border transition-colors hover:bg-[color:var(--bg-hover)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              aria-label={t('access.gateway.trace.close', '关闭执行 Trace')}
              title={t('access.gateway.trace.close', '关闭执行 Trace')}
              onClick={onClose}
            >
              <X size={13} />
            </button>
          </div>
          <InfoGrid items={[
            [t('access.gateway.trace.queryId', 'Query ID'), run.query_id],
            [t('access.gateway.trace.traceId', 'Trace ID'), run.trace_id || '—'],
            [t('access.gateway.trace.dataLevel', '数据等级'), formatDataLevelLabel(run.data_level || '')],
            [t('access.gateway.trace.policyEpoch', '策略版本'), String(run.policy_epoch ?? '—')],
            [t('access.gateway.trace.credential', '凭据引用'), run.credential_ref || '—'],
          ]} />
          <div className="space-y-2">
            {steps.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 rounded border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text-3)' }}>{label}</span>
                <span className="max-w-[420px] break-all text-right" style={{ color: 'var(--text-1)' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}

function PanelTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>{count}</span>
    </div>
  )
}

function DataPolicyTable({
  rows,
  onEdit,
  onDisable,
  disabling,
}: {
  rows: AccessDataPolicy[]
  onEdit: (policy: AccessDataPolicy) => void
  onDisable: (policy: AccessDataPolicy) => void
  disabling: boolean
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.policies.col.policy', '规则')}</Th>
          <Th>{t('access.policies.col.roles', '谁适用')}</Th>
          <Th>{t('access.policies.col.scope', '可访问数据')}</Th>
          <Th>{t('access.policies.col.effect', '访问结果')}</Th>
          <Th>{t('access.policies.col.profile', '通过后执行方式')}</Th>
          <Th>{t('access.policies.col.status', '状态')}</Th>
          <Th>{t('access.policies.col.actions', '操作')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.policy_code} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="max-w-[260px] px-4 py-2.5">
              <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{row.name}</div>
              <div className="truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.policy_code}</div>
            </td>
            <td className="px-4 py-2.5">{renderChips(row.subject_roles, formatAccessRoleLabel)}</td>
            <td className="px-4 py-2.5">{renderChips(formatPolicyScopeChips(row.resource_scope))}</td>
            <td className="px-4 py-2.5"><StatusChip status={row.effect} /></td>
            <td className="px-4 py-2.5">
              <ExecutionProfileCell profileCode={row.execution_profile_code} />
            </td>
            <td className="px-4 py-2.5"><StatusChip status={row.status} /></td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                    aria-label={`编辑策略 ${row.policy_code}`}
                    onClick={() => onEdit(row)}
                  >
                    <Pencil size={11} /> {t('action.edit', '编辑')}
                  </button>
                </Can>
                <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                    aria-label={`停用策略 ${row.policy_code}`}
                    disabled={disabling || row.status === 'disabled'}
                    onClick={() => onDisable(row)}
                  >
                    <PowerOff size={11} /> {t('access.action.disable', '停用')}
                  </button>
                </Can>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RowScopeDetail({ row }: { row: AccessPolicyDecision }) {
  const scope = row.effective_row_scope
  if (!scope || !scope.entries?.length) return null
  const subjectId = scope.subject_principal_id || row.principal_id
  const actingId = row.actor_id || row.principal_id
  const delegated = subjectId !== actingId
  const entries = scope.entries.map(formatRowScopeEntryLabel)
  const tooltipId = `row-scope-${row.decision_id}`
  const summary = formatRowScopeSummary(row)
  return (
    <span className="group relative mt-1 inline-flex max-w-full align-middle">
      <span
        tabIndex={0}
        aria-describedby={tooltipId}
        aria-label={`${summary}: ${entries.join('；')}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] outline-none transition-colors hover:bg-[color:var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}
      >
        <Chip tone="accent">{t('access.decisions.rowScope.badge', '行级范围')}</Chip>
        <span className="truncate">{summary}</span>
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-[200] mt-1 rounded-md border px-2.5 py-2 text-left text-[11px] opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        style={{
          width: 'min(520px, calc(100vw - 48px))',
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-2)',
        }}
      >
        <span className="mb-1.5 flex flex-wrap items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
          <span>
            {t('access.decisions.rowScope.subject', '数据主体')}: <span className="font-mono">{subjectId}</span>
          </span>
          {delegated ? (
            <span>
              {t('access.decisions.rowScope.acting', '执行主体')}: <span className="font-mono">{actingId}</span>
            </span>
          ) : null}
        </span>
        <span className="block space-y-1">
          {entries.map((entry, index) => (
            <span key={`${row.decision_id}-row-scope-${index}`} className="block break-all font-mono">
              {entry}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}

function PolicyDecisionTable({ rows }: { rows: AccessPolicyDecision[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.decisions.col.time', '时间')}</Th>
          <Th>{t('access.decisions.col.principal', '成员')}</Th>
          <Th>{t('access.decisions.col.level', '等级')}</Th>
          <Th>{t('access.decisions.col.decision', '判定')}</Th>
          <Th>{t('access.decisions.col.reason', '原因')}</Th>
          <Th>{t('access.decisions.col.profile', '执行方式')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.decision_id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
              {row.created_at ? fmtDateTime(row.created_at) : '—'}
            </td>
            <td className="max-w-[260px] px-4 py-2.5">
              <IdentityName value={row.principal_id} displayName={row.principal_display_name} />
            </td>
            <td className="px-4 py-2.5">{row.data_level}</td>
            <td className="px-4 py-2.5">
              <StatusChip status={row.decision} />
            </td>
            <td className="max-w-[320px] px-4 py-2.5">
              <ReasonCell reasonCode={row.reason_code} reason={row.reason} governanceRequired={row.governance_required} />
              <RowScopeDetail row={row} />
            </td>
            <td className="px-4 py-2.5">
              <ExecutionProfileCell profileCode={row.execution_profile_code} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GovernanceRecordTable({ rows }: { rows: AccessPolicyDecision[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.audit.governance_col.time', '时间')}</Th>
          <Th>{t('access.audit.governance_col.principal', '成员')}</Th>
          <Th>{t('access.audit.governance_col.scope', '治理范围')}</Th>
          <Th>{t('access.audit.governance_col.reason', '治理原因')}</Th>
          <Th>{t('access.audit.governance_col.status', '状态')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.decision_id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>
              {row.created_at ? fmtDateTime(row.created_at) : '—'}
            </td>
            <td className="max-w-[220px] px-4 py-2.5">
              <IdentityName value={row.principal_id} displayName={row.principal_display_name} />
            </td>
            <td className="px-4 py-2.5">
              <Chip tone="accent">{formatDataLevelLabel(row.data_level)}</Chip>
            </td>
            <td className="max-w-[260px] px-4 py-2.5">
              <div className="truncate font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.reason_code}</div>
              {row.reason ? (
                <div className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{row.reason}</div>
              ) : null}
            </td>
            <td className="px-4 py-2.5">
              <StatusChip status="governance_required" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ExecutionProfileList({
  rows,
  onEdit,
  onDisable,
  disabling,
}: {
  rows: AccessExecutionProfile[]
  onEdit: (profile: AccessExecutionProfile) => void
  onDisable: (profile: AccessExecutionProfile) => void
  disabling: boolean
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.profile_code} className="rounded border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-1)' }}>
              {formatExecutionProfileAccessLabel(row.profile_code)}
            </span>
            <Chip tone="accent">{formatDataLevelLabel(row.data_level)}</Chip>
            <StatusChip status={row.status} />
            <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                aria-label={t('access.profiles.editGuardrailAria', '调整执行方式 {profileName}', { profileName: formatExecutionProfileAccessLabel(row.profile_code) })}
                onClick={() => onEdit(row)}
              >
                <Pencil size={11} /> {t('access.profiles.editGuardrail', '调整护栏')}
              </button>
            </Can>
            <Can action="access.write" disabledTip={t('access.permissions.writeRequired', '需要权限管理员才能修改访问规则')}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                aria-label={t('access.profiles.disableGuardrailAria', '停用执行方式 {profileName}', { profileName: formatExecutionProfileAccessLabel(row.profile_code) })}
                disabled={disabling || row.status === 'disabled'}
                onClick={() => onDisable(row)}
              >
                <PowerOff size={11} /> {t('access.action.disable', '停用')}
              </button>
            </Can>
          </div>
          {row.description ? (
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{row.description}</div>
          ) : null}
          <div className="mt-3">
            <InfoGrid items={[
              [t('access.profiles.credentialMode', '执行模式'), formatExecutionModeLabel(row.credential_mode)],
              [t('access.profiles.maxRows', '最大行数'), row.max_rows ? String(row.max_rows) : '—'],
              [t('access.profiles.timeout', '超时'), row.timeout_seconds ? `${row.timeout_seconds}s` : '—'],
              [t('access.profiles.audit', '强审计'), formatBooleanLabel(row.requires_strong_audit)],
            ]} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ExecutionProfileDialog({
  open,
  onClose,
  profile,
}: {
  open: boolean
  onClose: () => void
  profile?: AccessExecutionProfile | null
}) {
  const toast = useToast()
  const updateProfile = useUpdateExecutionProfile()
  const [maxRows, setMaxRows] = useState('1000')
  const [timeout, setTimeoutValue] = useState('60')
  const [requiresStrongAudit, setRequiresStrongAudit] = useState('false')
  const [status, setStatus] = useState('active')

  useEffect(() => {
    if (!open) return
    setMaxRows(profile?.max_rows == null ? '1000' : String(profile.max_rows))
    setTimeoutValue(profile?.timeout_seconds == null ? '60' : String(profile.timeout_seconds))
    setRequiresStrongAudit(profile?.requires_strong_audit ? 'true' : 'false')
    setStatus(profile?.status ?? 'active')
  }, [open, profile])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profile) return
    const payload: Partial<AccessExecutionProfile> = {
      max_rows: Number(maxRows) || null,
      timeout_seconds: Number(timeout) || null,
      requires_strong_audit: requiresStrongAudit === 'true',
      status,
    }
    await updateProfile.mutateAsync({
      profileCode: profile.profile_code,
      payload,
    })
    toast.show({ tone: 'success', title: t('access.profiles.updated', '执行护栏已更新') })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('access.profiles.guardrailTitle', '调整执行护栏')} width={560}>
      {profile ? (
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="rounded border p-3 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
          <InfoGrid items={[
            [t('access.profiles.name', '执行方式'), formatExecutionProfileAccessLabel(profile.profile_code)],
            [t('access.profiles.description', '说明'), profile.description || '—'],
            [t('access.profiles.credentialMode', '执行模式'), formatExecutionModeLabel(profile.credential_mode)],
            [t('access.profiles.dataLevel', '数据等级'), formatDataLevelLabel(profile.data_level)],
            [t('access.profiles.operations', '允许动作'), profile.allowed_operations.join(', ') || '—'],
            [t('access.profiles.export', '允许导出'), formatBooleanLabel(profile.export_allowed)],
          ]} />
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
          {t('access.profiles.guardrailHint', '此处只维护平台侧执行护栏；凭据绑定、RAM 角色和物理项目权限由 dw-query-gateway 管理。')}
        </p>
        <Field label={t('access.profiles.maxRows', '最大行数')} value={maxRows} onChange={setMaxRows} />
        <Field label={t('access.profiles.timeoutSeconds', '超时时间（秒）')} value={timeout} onChange={setTimeoutValue} />
        <SelectField
          label={t('access.profiles.audit', '强审计')}
          value={requiresStrongAudit}
          onChange={setRequiresStrongAudit}
          options={['true', 'false']}
          formatOption={(value) => formatBooleanLabel(value === 'true')}
        />
        <SelectField label={t('common.status', '状态')} value={status} onChange={setStatus} options={['active', 'disabled']} />
        <DialogActions
          onClose={onClose}
          loading={updateProfile.isPending}
          submitLabel={t('action.save', '保存')}
        />
      </form>
      ) : null}
    </Dialog>
  )
}

function DataPolicyDialog({
  open,
  onClose,
  policy,
}: {
  open: boolean
  onClose: () => void
  policy?: AccessDataPolicy | null
}) {
  const toast = useToast()
  const createPolicy = useCreateDataPolicy()
  const updatePolicy = useUpdateDataPolicy()
  const roleCatalog = useAccessRoleCatalog()
  const activeProfiles = useExecutionProfiles({ status: 'active' })
  const [policyCode, setPolicyCode] = useState('')
  const [name, setName] = useState('')
  const [subjectRoles, setSubjectRoles] = useState<string[]>(['data_m1_reader'])
  const [dataLevels, setDataLevels] = useState<string[]>(['M1'])
  const [tableLayers, setTableLayers] = useState<string[]>(['dws', 'ads'])
  const [tablePrefixes, setTablePrefixes] = useState('dws_,ads_')
  const [actions, setActions] = useState<string[]>(['query'])
  const [effect, setEffect] = useState('allow')
  const [profileCode, setProfileCode] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('active')
  const editing = Boolean(policy)
  const dataRoleOptions = useMemo(
    () => mergeOptions((roleCatalog.data?.data_roles ?? []).map((role) => role.role_code), subjectRoles),
    [roleCatalog.data?.data_roles, subjectRoles],
  )
  const profileOptions = useMemo(
    () => mergeOptions((activeProfiles.data?.items ?? []).map((profileItem) => profileItem.profile_code), profileCode ? [profileCode] : []),
    [activeProfiles.data?.items, profileCode],
  )

  useEffect(() => {
    if (!open) return
    const scope = policy?.resource_scope ?? {}
    setPolicyCode(policy?.policy_code ?? '')
    setName(policy?.name ?? '')
    setSubjectRoles(policy?.subject_roles ?? ['data_m1_reader'])
    setDataLevels(scopeValues(scope, 'data_levels', ['M1']))
    setTableLayers(scopeValues(scope, 'table_layers', ['dws', 'ads']))
    setTablePrefixes(scopeValues(scope, 'table_prefixes', ['dws_', 'ads_']).join(','))
    setActions(policy?.actions ?? ['query'])
    setEffect(policy?.effect ?? 'allow')
    setProfileCode(policy?.execution_profile_code ?? '')
    setReason(policy?.reason ?? '')
    setStatus(policy?.status ?? 'active')
  }, [open, policy])

  useEffect(() => {
    if (!open || policy || effect !== 'allow' || profileCode) return
    const defaultProfile = defaultProfileForLevels(activeProfiles.data?.items ?? [], dataLevels)
    if (defaultProfile) setProfileCode(defaultProfile)
  }, [activeProfiles.data?.items, dataLevels, effect, open, policy, profileCode])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (subjectRoles.length === 0 || dataLevels.length === 0 || actions.length === 0) {
      toast.show({ tone: 'warning', title: t('access.policies.incomplete', '请至少选择角色、数据等级和允许操作') })
      return
    }
    if (effect === 'allow' && !profileCode) {
      toast.show({ tone: 'warning', title: t('access.policies.profileRequired', '允许访问时必须选择执行护栏') })
      return
    }
    const payload: Partial<AccessDataPolicy> & {
      policy_code: string
      name: string
    } = {
      policy_code: policyCode,
      name,
      status,
      priority: policy?.priority ?? 100,
      subject_roles: subjectRoles,
      resource_scope: {
        data_levels: dataLevels,
        table_layers: tableLayers,
        table_prefixes: splitList(tablePrefixes),
      },
      actions,
      effect,
      execution_profile_code: effect === 'allow' ? profileCode : null,
      reason: reason || null,
      policy_version: policy?.policy_version ?? 'v1',
    }
    if (editing && policy) {
      await updatePolicy.mutateAsync({
        policyCode: policy.policy_code,
        payload,
      })
      toast.show({ tone: 'success', title: t('access.policies.updated', '访问规则已更新') })
    } else {
      await createPolicy.mutateAsync(payload)
      toast.show({ tone: 'success', title: t('access.policies.created', '访问规则已创建') })
    }
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t('access.policies.editTitle', '编辑访问规则') : t('access.policies.createTitle', '新建访问规则')}
      width={620}
    >
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label={t('access.policies.field.policyCode', '规则编码 *')} value={policyCode} onChange={setPolicyCode} required disabled={editing} />
        <Field label={t('access.policies.field.name', '名称 *')} value={name} onChange={setName} required />
        <MultiCheckField
          label={t('access.policies.field.subjectRoles', '适用数据角色')}
          value={subjectRoles}
          onChange={setSubjectRoles}
          options={dataRoleOptions}
          formatOption={formatAccessRoleLabel}
          helper={roleCatalog.isLoading ? t('access.policies.roleCatalogLoading', '角色目录加载中…') : undefined}
        />
        <MultiCheckField
          label={t('access.policies.field.dataLevels', '可访问数据等级')}
          value={dataLevels}
          onChange={setDataLevels}
          options={DATA_LEVEL_OPTIONS}
          formatOption={formatDataLevelLabel}
        />
        <MultiCheckField
          label={t('access.policies.field.tableLayers', '可访问表层级')}
          value={tableLayers}
          onChange={setTableLayers}
          options={TABLE_LAYER_OPTIONS}
          formatOption={formatTableLayerLabel}
        />
        <Field label={t('access.policies.field.tablePrefixes', '可访问表名前缀')} value={tablePrefixes} onChange={setTablePrefixes} />
        <MultiCheckField
          label={t('access.policies.field.actions', '允许操作')}
          value={actions}
          onChange={setActions}
          options={POLICY_ACTION_OPTIONS}
          formatOption={formatPolicyActionLabel}
        />
        <SelectField label={t('access.policies.field.effect', '访问结果')} value={effect} onChange={setEffect} options={['allow', 'deny']} formatOption={formatPolicyEffectLabel} />
        <SelectField
          label={t('access.policies.field.executionGuardrail', '通过后执行护栏')}
          value={effect === 'allow' ? profileCode : ''}
          onChange={setProfileCode}
          options={profileOptions}
          formatOption={formatExecutionProfileLabel(activeProfiles.data?.items ?? [])}
          placeholder={activeProfiles.isLoading ? t('access.policies.profileLoading', '执行护栏加载中…') : t('access.policies.profilePlaceholder', '请选择执行护栏')}
          disabled={effect !== 'allow'}
        />
        <Field label={t('common.description', '说明')} value={reason} onChange={setReason} />
        <SelectField label={t('common.status', '状态')} value={status} onChange={setStatus} options={['active', 'disabled']} />
        <DialogActions
          onClose={onClose}
          loading={createPolicy.isPending || updatePolicy.isPending}
          submitLabel={editing ? t('action.save', '保存') : t('access.policies.createSubmit', '创建访问规则')}
        />
      </form>
    </Dialog>
  )
}

export function splitAccessPackages(packages: AccessPermissionPackage[]): {
  platformPackages: AccessPermissionPackage[]
  dataPackages: AccessPermissionPackage[]
} {
  return {
    platformPackages: packages.filter((item) => item.role_type === 'platform'),
    dataPackages: packages.filter((item) => item.role_type === 'data'),
  }
}

export function getAssignedAccessPackageCodes(
  principal: Pick<AccessPrincipalDetail, 'platform_roles' | 'data_roles'>,
  packages: AccessPermissionPackage[],
): string[] {
  const assignedRoles = new Set([...(principal.platform_roles || []), ...(principal.data_roles || [])])
  const { platformPackages, dataPackages } = splitAccessPackages(packages)
  const platformCode = platformPackages.find((item) => (
    item.role_codes.some((roleCode) => assignedRoles.has(roleCode))
  ))?.package_code
  const dataCode = highestDataPackageCode(
    dataPackages
      .filter((item) => item.role_codes.every((roleCode) => assignedRoles.has(roleCode)))
      .map((item) => item.package_code),
    dataPackages,
  )
  return [platformCode, dataCode].filter((item): item is string => Boolean(item))
}

export function replacePlatformPackageCode(
  value: string[],
  packages: AccessPermissionPackage[],
  packageCode: string,
): string[] {
  const { platformPackages } = splitAccessPackages(packages)
  const platformCodes = new Set(platformPackages.map((item) => item.package_code))
  const next = value.filter((item) => !platformCodes.has(item))
  if (packageCode) next.push(packageCode)
  return next
}

export function replaceDataAccessPackageCode(
  value: string[],
  packages: AccessPermissionPackage[],
  packageCode: string | null,
): string[] {
  const { dataPackages } = splitAccessPackages(packages)
  const dataPackageCodes = new Set(dataPackages.map((item) => item.package_code))
  const next = value.filter((item) => !dataPackageCodes.has(item))
  if (packageCode) next.push(packageCode)
  return next
}

export function summarizePrincipalPlatformPackages(
  principal: Pick<AccessPrincipal, 'platform_roles'>,
  packages: AccessPermissionPackage[],
): string {
  const roles = principal.platform_roles ?? []
  const { platformPackages } = splitAccessPackages(packages)
  const matched = platformPackages.find((item) => item.role_codes.some((roleCode) => roles.includes(roleCode)))
  return matched?.name || formatRoleList(roles) || t('access.detail.noPlatformRoles', '暂无平台角色')
}

export function summarizePrincipalDataPackage(
  principal: Pick<AccessPrincipal, 'data_roles'>,
  packages: AccessPermissionPackage[],
): string | null {
  const roles = principal.data_roles ?? []
  const { dataPackages } = splitAccessPackages(packages)
  const matchedPackageCode = highestDataPackageCode(
    dataPackages
      .filter((item) => item.role_codes.every((roleCode) => roles.includes(roleCode)))
      .map((item) => item.package_code),
    dataPackages,
  )
  const matched = dataPackages.find((item) => item.package_code === matchedPackageCode)
  if (matched) return matched.name || formatDataLevelLabel(matched.data_level || '')
  if (roles.includes('data_m2_detail_reader')) return formatDataLevelLabel('M2')
  if (roles.includes('data_m1_reader')) return formatDataLevelLabel('M1')
  if (roles.includes('data_m0_reader')) return formatDataLevelLabel('M0')
  return null
}

export function summarizePrincipalPermissionSource(
  principal: Pick<AccessPrincipal, 'principal_id' | 'role_bindings' | 'idp'>,
): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  const bindings = principal.role_bindings ?? []
  const dataBinding = bindings.find((binding) => binding.role_code === 'data_m2_detail_reader')
    || bindings.find((binding) => binding.role_type === 'data')
    || bindings[0]
  const source = dataBinding?.source
  if (source === 'feishu_m2_allowlist') {
    return { label: t('access.principals.source.m2Allowlist', 'M2 白名单'), tone: 'success' }
  }
  if (source === 'feishu_sso' || source === 'feishu_sync') {
    return { label: bindingSourceLabel(source), tone: 'success' }
  }
  if (source === 'manual') {
    return { label: t('access.principals.source.manual', '手动授予'), tone: 'warning' }
  }
  if (source === 'permission_package') {
    return { label: t('access.principals.source.permissionPackage', '权限配置'), tone: 'neutral' }
  }
  if (source) return { label: bindingSourceLabel(source), tone: 'neutral' }
  if (principal.idp === 'feishu' || principal.principal_id.startsWith('feishu:')) {
    return { label: bindingSourceLabel('feishu_sync'), tone: 'success' }
  }
  return { label: t('access.principals.source.systemDefault', '系统默认'), tone: 'neutral' }
}

function defaultPlatformPackageCode(platformPackages: AccessPermissionPackage[]): string {
  return platformPackages.find((item) => item.package_code === 'normal_user')?.package_code
    || platformPackages.find((item) => item.package_code === 'viewer')?.package_code
    || platformPackages[0]?.package_code
    || ''
}

function PermissionPackageSummary({
  loading,
  packages,
  value,
}: {
  loading: boolean
  packages: AccessPermissionPackage[]
  value: string[]
}) {
  const current = new Set(value)
  const { platformPackages, dataPackages } = splitAccessPackages(packages)
  const assignedPlatformPackages = platformPackages.filter((item) => current.has(item.package_code))
  const assignedDataPackage = dataPackages.find((item) => item.package_code === highestDataPackageCode(value, dataPackages))
  if (loading) return <LoadingRows />
  return (
    <div className="space-y-4">
      <AssignedPackageSection
        title={t('access.detail.platformRoles', '平台角色')}
        emptyText={t('access.detail.noPlatformRoles', '暂无平台角色')}
        packages={assignedPlatformPackages}
      />
      <AssignedPackageSection
        title={t('access.detail.dataAccess', '数据访问权限')}
        emptyText={t('access.detail.noDataAccess', '无数据访问权限')}
        packages={assignedDataPackage ? [assignedDataPackage] : []}
      />
    </div>
  )
}

function AssignedPackageSection({
  title,
  emptyText,
  packages,
}: {
  title: string
  emptyText: string
  packages: AccessPermissionPackage[]
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-2 grid grid-cols-1 gap-2">
        {packages.length === 0 ? (
          <div className="rounded border border-dashed px-2.5 py-4 text-center text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
            {emptyText}
          </div>
        ) : packages.map((item) => <PackageCard key={item.package_code} item={item} />)}
      </div>
    </div>
  )
}

function PackageCard({ item }: { item: AccessPermissionPackage }) {
  const roleSummary = formatPackageRoleSummary(item)
  return (
    <div
      className="rounded border px-2.5 py-2 text-xs"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}
    >
      <div className="flex min-w-0 items-center gap-1 font-medium" style={{ color: 'var(--text-1)' }}>
        <span className="truncate">{item.name || item.package_code}</span>
        {item.data_level ? <Chip tone="accent">{formatDataLevelLabel(item.data_level)}</Chip> : null}
      </div>
      <div className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
        {item.description || t('access.detail.noDescription', '暂无说明')}
      </div>
      {roleSummary ? (
        <div className="mt-1 truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
          {roleSummary}
        </div>
      ) : null}
    </div>
  )
}

function PermissionPackageDialog({
  principalId,
  onClose,
}: {
  principalId: string | null
  onClose: () => void
}) {
  const toast = useToast()
  const open = Boolean(principalId)
  const { data, isLoading, isError } = useAccessPrincipal(principalId)
  const { data: packageCatalog, isLoading: loadingPackages } = useAccessPermissionPackages()
  const updatePackages = useUpdateAccessPermissionPackages()
  const [packageCodes, setPackageCodes] = useState<string[]>([])

  useEffect(() => {
    if (!open || !data) return
    const packages = packageCatalog?.items ?? []
    const next = getAssignedAccessPackageCodes(data, packages)
    const { platformPackages } = splitAccessPackages(packages)
    const hasPlatformPackage = next.some((code) => platformPackages.some((item) => item.package_code === code))
    const defaultPlatform = hasPlatformPackage ? '' : defaultPlatformPackageCode(platformPackages)
    setPackageCodes(defaultPlatform ? replacePlatformPackageCode(next, packages, defaultPlatform) : next)
  }, [data, open, packageCatalog?.items])

  const save = async () => {
    if (!data) return
    const packages = packageCatalog?.items ?? []
    const { platformPackages } = splitAccessPackages(packages)
    const hasPlatformPackage = packageCodes.some((code) => platformPackages.some((item) => item.package_code === code))
    const defaultPlatform = hasPlatformPackage ? '' : defaultPlatformPackageCode(platformPackages)
    const finalPackageCodes = defaultPlatform
      ? replacePlatformPackageCode(packageCodes, packages, defaultPlatform)
      : packageCodes
    try {
      await updatePackages.mutateAsync({ principalId: data.principal_id, packageCodes: finalPackageCodes })
      toast.show({ tone: 'success', title: t('access.detail.rolesSaved', '权限配置已保存') })
      onClose()
    } catch (error) {
      toast.show({
        tone: 'danger',
        title: t('access.detail.rolesSaveFailed', '权限配置保存失败'),
        description: formatPermissionSaveError(error),
      })
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('access.detail.adjustPackagesTitle', '调整成员权限')} width={620}>
      {isLoading ? (
        <LoadingRows />
      ) : isError || !data ? (
        <EmptyState tone="danger" text={t('access.detail.loadFailed', '详情加载失败')} />
      ) : (
        <div className="space-y-4">
          <div className="rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
            <div className="font-medium" style={{ color: 'var(--text-1)' }}>
              {identityDisplayName(data.display_name, data.principal_id)}
            </div>
            <div className="mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
              {principalTypeLabel(data.principal_type)} · {data.tenant_key}
            </div>
          </div>
          <PermissionPackagePicker
            loading={loadingPackages}
            packages={packageCatalog?.items ?? []}
            value={packageCodes}
            onChange={setPackageCodes}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" type="button" onClick={onClose}>
              {t('action.cancel', '取消')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              type="button"
              loading={updatePackages.isPending}
              disabled={loadingPackages}
              onClick={() => void save()}
            >
              {t('access.detail.saveRoles', '保存权限配置')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function formatPermissionSaveError(error: unknown): string {
  if (AppError.isAppError(error)) {
    const details = isPlainRecord(error.details) ? error.details : {}
    const required = Array.isArray(details.required_roles)
      ? details.required_roles.join(' / ')
      : ''
    const current = Array.isArray(details.principal_roles)
      ? details.principal_roles.join(' / ') || t('access.detail.noCurrentRoles', '无角色')
      : ''
    if (error.code === 'INSUFFICIENT_ROLE' && required) {
      return t(
        'access.detail.rolesSaveFailedInsufficientRole',
        '当前账号没有权限配置写权限，需要 {required}，当前为 {current}。请先用管理员账号授权后再保存。',
        { required, current },
      )
    }
    return error.message || t('access.detail.rolesSaveFailedRetry', '请稍后重试，或联系管理员查看后端日志。')
  }
  if (error instanceof Error) return error.message
  return t('access.detail.rolesSaveFailedRetry', '请稍后重试，或联系管理员查看后端日志。')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function PermissionPackagePicker({
  loading,
  packages,
  value,
  onChange,
}: {
  loading: boolean
  packages: AccessPermissionPackage[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const { platformPackages, dataPackages } = splitAccessPackages(packages)
  const selectedPlatformPackageCode = value.find((item) => platformPackages.some((pkg) => pkg.package_code === item))
    || defaultPlatformPackageCode(platformPackages)
  const selectedDataPackageCode = highestDataPackageCode(value, dataPackages)
  if (loading) return <LoadingRows />
  return (
    <div className="space-y-4">
      <PermissionPackageSelect
        label={t('access.detail.platformRoles', '平台角色')}
        value={selectedPlatformPackageCode}
        options={platformPackages}
        onChange={(next) => onChange(replacePlatformPackageCode(value, packages, next))}
      />
      <PermissionPackageSelect
        label={t('access.detail.dataAccess', '数据访问权限')}
        value={selectedDataPackageCode || ''}
        options={dataPackages}
        emptyLabel={t('access.detail.noDataAccess', '无数据访问权限')}
        emptyDescription={t('access.detail.noDataAccessHint', '只保留平台使用权限，不授予查询数据的能力')}
        onChange={(next) => onChange(replaceDataAccessPackageCode(value, packages, next || null))}
      />
    </div>
  )
}

function PermissionPackageSelect({
  label,
  value,
  options,
  emptyLabel,
  emptyDescription,
  onChange,
}: {
  label: string
  value: string
  options: AccessPermissionPackage[]
  emptyLabel?: string
  emptyDescription?: string
  onChange: (next: string) => void
}) {
  const selected = options.find((item) => item.package_code === value)
  const description = selected?.description || (!value ? emptyDescription : '')
  const roleSummary = selected ? formatPackageRoleSummary(selected) : ''
  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          {label}
        </span>
        <select
          className="w-full rounded border px-2.5 py-2 text-xs outline-none"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((item) => (
            <option key={item.package_code} value={item.package_code}>
              {item.name || item.package_code}
              {item.data_level ? ` · ${formatDataLevelLabel(item.data_level)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
        <div style={{ color: 'var(--text-2)' }}>
          {description || t('access.detail.noDescription', '暂无说明')}
        </div>
        {roleSummary ? (
          <div className="mt-1 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>
            {roleSummary}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function mergeOptions(primary: string[] | undefined, selected: string[]): string[] {
  const result: string[] = []
  for (const value of [...(primary ?? []), ...selected]) {
    const item = String(value || '').trim()
    if (item && !result.includes(item)) result.push(item)
  }
  return result
}

function BindingList({ bindings }: { bindings: AccessRoleBinding[] }) {
  if (bindings.length === 0) return <div className="text-xs text-3">{t('access.bindings.empty', '暂无绑定记录')}</div>
  return (
    <div className="space-y-2">
      {bindings.map((binding) => {
        const roleName = formatAccessRoleLabel(binding.role_code)
        return (
          <div key={binding.id} className="rounded border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <Chip tone={binding.role_type === 'data' ? 'warning' : 'accent'}>
                {binding.role_type === 'data' ? t('access.roleType.data', '数据') : t('access.roleType.platform', '平台')}
              </Chip>
              <span className="font-medium" style={{ color: 'var(--text-1)' }}>{roleName}</span>
              {roleName !== binding.role_code ? (
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{binding.role_code}</span>
              ) : null}
              <StatusChip status={binding.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
              <span>{bindingSourceLabel(binding.source)}</span>
              {binding.created_at ? <span>· {fmtDateTime(binding.created_at)}</span> : null}
              {binding.created_by_display_name ? <span>· {binding.created_by_display_name}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CreateServiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const createService = useCreateServicePrincipal()
  const [tenantKey, setTenantKey] = useState('')
  const [serviceType, setServiceType] = useState('bot')
  const [code, setCode] = useState('')
  const [ownerPrincipalId, setOwnerPrincipalId] = useState('')
  const [ownerTeam, setOwnerTeam] = useState('')
  const [description, setDescription] = useState('')
  const [allowedTenants, setAllowedTenants] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ownerPrincipalId) {
      toast.show({ tone: 'danger', title: t('access.services.ownerRequired', '请选择负责人') })
      return
    }
    await createService.mutateAsync({
      tenant_key: tenantKey,
      service_type: serviceType,
      code,
      owner_principal_id: ownerPrincipalId,
      owner_team: ownerTeam || undefined,
      description: description || undefined,
      allowed_tenants: splitList(allowedTenants || tenantKey),
      delegation_rules: {},
    })
    toast.show({ tone: 'success', title: t('access.services.created', '机器人接入已创建') })
    onClose()
    setCode('')
    setDescription('')
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('access.services.createTitle', '新建机器人接入')} width={560}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label={t('access.services.field.tenant', '租户 *')} value={tenantKey} onChange={setTenantKey} required />
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('access.services.field.type', '类型 *')}</label>
          <select
            className="w-full rounded border px-2 py-1.5 text-xs outline-none"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value)}
          >
            <option value="bot">bot</option>
            <option value="agent">agent</option>
            <option value="skill">skill</option>
            <option value="job">job</option>
          </select>
        </div>
        <Field label={t('access.services.field.code', '编码 *')} value={code} onChange={setCode} required />
        <OwnerPrincipalPicker value={ownerPrincipalId} onChange={setOwnerPrincipalId} />
        <Field label={t('access.services.field.team', '负责团队')} value={ownerTeam} onChange={setOwnerTeam} />
        <Field label={t('access.services.field.allowedTenants', '允许租户（逗号分隔）')} value={allowedTenants} onChange={setAllowedTenants} />
        <Field label={t('access.services.field.description', '描述')} value={description} onChange={setDescription} />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('action.cancel', '取消')}</Button>
          <Button size="sm" variant="primary" type="submit" loading={createService.isPending}>{t('access.services.createSubmit', '创建机器人')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function OwnerPrincipalPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useAccessPrincipals({
    q: q || undefined,
    principal_type: 'human',
    page: 1,
    page_size: 8,
  })
  const rows = data?.items ?? []
  const selected = rows.find((row) => row.principal_id === value)

  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>
        {t('access.services.field.owner', '负责人 *')}
      </label>
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
        <Input
          className="pl-6"
          placeholder={t('access.services.ownerSearchPlaceholder', '搜索姓名 / 邮箱 / Principal ID')}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
      </div>
      {value ? (
        <div className="mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
          <span className="min-w-0 truncate" style={{ color: 'var(--accent)' }}>
            {selected ? identityDisplayName(selected.display_name, selected.principal_id) : value}
          </span>
          <button type="button" className="shrink-0 hover:underline" style={{ color: 'var(--accent)' }} onClick={() => onChange('')}>
            {t('action.clear', '清除')}
          </button>
        </div>
      ) : null}
      <div className="mt-2 max-h-44 overflow-auto rounded border" style={{ borderColor: 'var(--border)' }} role="listbox">
        {isLoading ? (
          <div className="px-2 py-2 text-xs" style={{ color: 'var(--text-3)' }}>{t('action.loading', '加载中')}</div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-2 text-xs" style={{ color: 'var(--text-3)' }}>{t('access.services.ownerEmpty', '暂无可选负责人')}</div>
        ) : rows.map((row) => (
          <button
            key={row.principal_id}
            type="button"
            role="option"
            aria-selected={row.principal_id === value}
            className="flex w-full items-center justify-between gap-2 border-b px-2 py-2 text-left text-xs last:border-b-0 hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
            onClick={() => {
              onChange(row.principal_id)
              setQ(identityDisplayName(row.display_name, row.principal_id))
            }}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium" style={{ color: 'var(--text-1)' }}>
                {identityDisplayName(row.display_name, row.principal_id)}
              </span>
              <span className="block truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                {row.email || row.employee_no || row.tenant_key}
              </span>
            </span>
            {row.principal_id === value ? <span style={{ color: 'var(--accent)' }}>✓</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function CreateApiKeyDialog({
  principalId,
  open,
  onClose,
  onCreated,
}: {
  principalId: string
  open: boolean
  onClose: () => void
  onCreated: (key: CreatedApiKey) => void
}) {
  const toast = useToast()
  const createKey = useCreateApiKey()
  const { data: roleCatalog } = useAccessRoleCatalog()
  const [scopes, setScopes] = useState<string[]>([])
  const [allowedIps, setAllowedIps] = useState('')
  const [rateLimit, setRateLimit] = useState('60')
  const [keyMode, setKeyMode] = useState<'scope' | 'delegation'>('scope')
  const [dataScopeAttr, setDataScopeAttr] = useState('school_ids')
  const [dataScopeValues, setDataScopeValues] = useState('')
  const scopeOptions = mergeOptions(roleCatalog?.api_key_scopes, scopes)

  useEffect(() => {
    if (scopes.length > 0) return
    const firstScope = roleCatalog?.api_key_scopes?.[0]
    if (firstScope) setScopes([firstScope])
  }, [roleCatalog, scopes.length])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const scopeValues = splitList(dataScopeValues)
    const key = await createKey.mutateAsync({
      principalId,
      payload: {
        scopes,
        allowed_ips: splitList(allowedIps),
        rate_limit_per_minute: Number(rateLimit) || null,
        mode: keyMode,
        data_scopes:
          keyMode === 'scope' && dataScopeAttr.trim() && scopeValues.length > 0
            ? [{ attribute: dataScopeAttr.trim(), values: scopeValues }]
            : undefined,
      },
    })
    toast.show({ tone: 'success', title: t('access.apiKeys.created', '接入 Key 已签发') })
    onCreated(key)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('access.apiKeys.createTitle', '签发 API Key')} width={560}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('access.apiKeys.field.mode', '身份模式')}</label>
          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input
                type="radio"
                name="api-key-mode"
                checked={keyMode === 'scope'}
                onChange={() => setKeyMode('scope')}
              />
              <span>
                <span className="font-medium">{t('access.apiKeys.mode.scope', '模式 A · 服务自带数据范围')}</span>
                <span className="mt-0.5 block" style={{ color: 'var(--text-3)' }}>
                  {t('access.apiKeys.mode.scopeHint', '为服务身份配置固定数据范围（行级求值取该范围），不允许代理用户。')}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
              <input
                type="radio"
                name="api-key-mode"
                checked={keyMode === 'delegation'}
                onChange={() => setKeyMode('delegation')}
              />
              <span>
                <span className="font-medium">{t('access.apiKeys.mode.delegation', '模式 B · 委托代理用户')}</span>
                <span className="mt-0.5 block" style={{ color: 'var(--text-3)' }}>
                  {t('access.apiKeys.mode.delegationHint', '需先在虚拟用户上配置委托白名单（允许租户）；行级求值取被代理用户的数据范围。')}
                </span>
              </span>
            </label>
          </div>
        </div>
        {keyMode === 'scope' ? (
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t('access.apiKeys.field.dataScopeAttr', '数据范围属性')}
              value={dataScopeAttr}
              onChange={setDataScopeAttr}
            />
            <Field
              label={t('access.apiKeys.field.dataScopeValues', '范围值（逗号分隔）')}
              value={dataScopeValues}
              onChange={setDataScopeValues}
            />
          </div>
        ) : null}
        <div>
          <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{t('access.apiKeys.field.scopes', 'Scope')}</label>
          <div className="grid grid-cols-1 gap-2">
            {scopeOptions.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={(event) => {
                    setScopes((prev) => event.target.checked ? [...prev, scope] : prev.filter((item) => item !== scope))
                  }}
                />
                <span className="font-mono text-[11px]">{scope}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label={t('access.apiKeys.field.allowedIps', '允许 IP（逗号分隔）')} value={allowedIps} onChange={setAllowedIps} />
        <Field label={t('access.apiKeys.field.rateLimit', '每分钟限流')} value={rateLimit} onChange={setRateLimit} />
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('action.cancel', '取消')}</Button>
          <Button size="sm" variant="primary" type="submit" loading={createKey.isPending}>{t('access.apiKeys.create', '签发接入 Key')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

function RevealApiKeyDialog({ keyPayload, onClose }: { keyPayload: CreatedApiKey | null; onClose: () => void }) {
  const toast = useToast()
  const copy = async () => {
    if (!keyPayload) return
    await navigator.clipboard.writeText(keyPayload.api_key)
    toast.show({ tone: 'success', title: t('access.apiKeys.copied', '已复制 API Key') })
  }
  return (
    <Dialog open={Boolean(keyPayload)} onClose={onClose} title={t('access.apiKeys.revealTitle', '请立即保存 API Key')} width={620}>
      {keyPayload ? (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            {t('access.apiKeys.revealHint', '明文只展示一次，关闭后无法再次查看。')}
          </p>
          <div className="rounded border p-3 font-mono text-[11px]" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-1)' }}>
            <span className="break-all">{keyPayload.api_key}</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => void copy()}><Copy size={12} /> {t('action.copy', '复制')}</Button>
            <Button size="sm" variant="primary" onClick={onClose}>{t('action.done', '完成')}</Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{label}</label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  formatOption,
  placeholder,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  formatOption?: (value: string) => string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{label}</label>
      <select
        className="w-full rounded border px-2 py-1.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{formatOption ? formatOption(option) : option}</option>)}
      </select>
    </div>
  )
}

function MultiCheckField({
  label,
  value,
  onChange,
  options,
  formatOption,
  helper,
}: {
  label: string
  value: string[]
  onChange: (value: string[]) => void
  options: string[]
  formatOption?: (value: string) => string
  helper?: string
}) {
  const selected = new Set(value)
  const toggle = (option: string) => {
    if (selected.has(option)) {
      onChange(value.filter((item) => item !== option))
    } else {
      onChange([...value, option])
    }
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{label}</label>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-9 items-center gap-2 rounded border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--border)', background: selected.has(option) ? 'var(--accent-soft)' : 'var(--bg-surface-2)', color: 'var(--text-1)' }}
          >
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => toggle(option)}
              className="h-3.5 w-3.5"
            />
            <span className="min-w-0 truncate">{formatOption ? formatOption(option) : option}</span>
          </label>
        ))}
      </div>
      {helper ? <div className="mt-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{helper}</div> : null}
    </div>
  )
}

function DialogActions({
  onClose,
  loading,
  submitLabel = t('action.create', '创建'),
}: {
  onClose: () => void
  loading: boolean
  submitLabel?: string
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button size="sm" variant="ghost" type="button" onClick={onClose}>{t('action.cancel', '取消')}</Button>
      <Button size="sm" variant="primary" type="submit" loading={loading}>{submitLabel}</Button>
    </div>
  )
}

function InfoGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y rounded border text-xs" style={{ borderColor: 'var(--border)' }}>
      {items.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-3 py-2">
          <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
          <dd className="break-all" style={{ color: 'var(--text-1)' }}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{children}</h2>
}

function TypeChip({ type }: { type: string }) {
  return <Chip tone={type === 'service' ? 'violet' : 'accent'}>{principalTypeLabel(type)}</Chip>
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const tone = normalized === 'active' || normalized === 'allow' || normalized === 'succeeded' || normalized === 'success'
    ? 'success'
    : normalized === 'revoked' || normalized === 'disabled' || normalized === 'deny' || normalized === 'failed' || normalized === 'physical_denied'
      ? 'danger'
      : normalized === 'governance_required' || normalized === 'queued' || normalized === 'running'
        ? 'warning'
        : 'neutral'
  return <Chip tone={tone}>{statusLabel(status)}</Chip>
}

function ReasonCell({
  reasonCode,
  reason,
  physicalDenied = false,
  governanceRequired = false,
}: {
  reasonCode?: string | null
  reason?: string | null
  physicalDenied?: boolean
  governanceRequired?: boolean
}) {
  const code = physicalDenied ? 'physical_denied_after_policy_allow' : String(reasonCode || '').trim()
  const label = reason || formatAccessReasonLabel(code, governanceRequired)
  return (
    <div className="min-w-0">
      <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>{label || '—'}</div>
      {code ? (
        <div className="mt-0.5 truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{code}</div>
      ) : null}
    </div>
  )
}

function principalTypeLabel(type: string): string {
  if (type === 'human') return t('access.type.human', '真人用户')
  if (type === 'service') return t('access.type.service', '机器人/服务账号')
  return type
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: t('access.status.active', '启用'),
    disabled: t('access.status.disabled', '停用'),
    deleted: t('access.status.deleted', '已删除'),
    revoked: t('access.status.revoked', '已吊销'),
    expired: t('access.status.expired', '已过期'),
    allow: formatPolicyEffectLabel('allow'),
    deny: formatPolicyEffectLabel('deny'),
    SUCCEEDED: t('access.status.succeeded', '成功'),
    FAILED: t('access.status.failed', '失败'),
    QUEUED: t('access.status.queued', '排队中'),
    RUNNING: t('access.status.running', '执行中'),
    CANCELED: t('access.status.canceled', '已取消'),
    physical_denied: t('access.status.physicalDenied', '物理拒绝'),
    governance_required: t('access.status.governanceRequired', '需治理'),
  }
  return labels[status] ?? status
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-left font-medium" style={{ color: 'var(--text-3)' }}>{children}</th>
}

function LoadingRows() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}
    </div>
  )
}

function EmptyState({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'danger' }) {
  return (
    <div className="rounded border border-dashed p-6 text-center text-xs" style={{ borderColor: 'var(--border)', color: tone === 'danger' ? 'var(--danger)' : 'var(--text-3)' }}>
      {text}
    </div>
  )
}

function splitList(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
}

function scopeValues(scope: Record<string, unknown>, key: string, fallback: string[]): string[] {
  const value = scope[key]
  if (!Array.isArray(value)) return fallback
  const items = value.map((item) => String(item || '').trim()).filter(Boolean)
  return items.length > 0 ? items : fallback
}

function renderChips(values: string[], formatter: (value: string) => string = (value) => value) {
  return <ExpandableChips values={values} formatter={formatter} />
}

function ExpandableChips({
  values,
  formatter,
  limit = 3,
}: {
  values: string[]
  formatter: (value: string) => string
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  if (!values.length) return <span style={{ color: 'var(--text-3)' }}>—</span>
  const visibleValues = expanded ? values : values.slice(0, limit)
  const hiddenCount = values.length - visibleValues.length
  return (
    <div className="flex flex-wrap gap-1">
      {visibleValues.map((value) => <Chip key={value}>{formatter(value)}</Chip>)}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
          style={{ background: 'var(--bg-surface-2)', color: 'var(--text-2)' }}
          aria-label={t('access.chips.expandHidden', '展开剩余 {count} 项', { count: hiddenCount })}
          onClick={() => setExpanded(true)}
        >
          +{hiddenCount}
        </button>
      ) : expanded && values.length > limit ? (
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
          style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}
          onClick={() => setExpanded(false)}
        >
          {t('action.collapse', '收起')}
        </button>
      ) : null}
    </div>
  )
}

function bindingSourceLabel(source: string): string {
  return {
    permission_package: t('access.bindings.source.permissionPackage', '权限配置'),
    feishu_sso: t('access.bindings.source.feishuSso', '飞书同步'),
    feishu_sync: t('access.bindings.source.feishuSync', '飞书同步'),
    manual: t('access.bindings.source.manual', '手动绑定'),
    bootstrap: t('access.bindings.source.bootstrap', '系统初始化'),
    demo_bootstrap: t('access.bindings.source.demoBootstrap', '初始化导入'),
  }[source] ?? source
}

function allowlistSourceLabel(source: string): string {
  return {
    FEISHU_M2_READER_OPEN_IDS: t('access.allowlist.source.env', '环境变量'),
    CUBIC3_ALLOWED_USER_IDS: t('access.allowlist.source.cubic3', 'CUBIC3 白名单'),
  }[source] ?? source
}

function allowlistGrantLabel(status: string): string {
  return {
    granted: t('access.allowlist.grant.granted', '已拥有 M2'),
    pending_login: t('access.allowlist.grant.pendingLogin', '等待首次登录'),
    pending_sync: t('access.allowlist.grant.pendingSync', '待同步授权'),
  }[status] ?? status
}

function allowlistGrantTone(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'granted') return 'success'
  if (status === 'pending_login' || status === 'pending_sync') return 'warning'
  return 'neutral'
}

function allowlistRiskLabel(risk: string): string {
  return {
    manual_revoke_conflict: t('access.allowlist.risk.manualRevokeConflict', '与手动撤销冲突'),
  }[risk] ?? risk
}

export function formatPolicyScopeChips(scope: Record<string, unknown>): string[] {
  const chips: string[] = []
  const append = (formatter: (value: string) => string, values: unknown) => {
    if (!Array.isArray(values)) return
    values.forEach((value) => {
      const item = String(value || '').trim()
      if (item) chips.push(formatter(item))
    })
  }
  append(formatDataLevelLabel, scope.data_levels)
  append(formatTableLayerLabel, scope.table_layers)
  append((value) => `表名前缀 ${value}`, scope.table_prefixes)
  append((value) => `资源标签 ${value}`, scope.resource_tags)
  append((value) => `业务域 ${value}`, scope.domains)
  return chips
}

function formatRoleList(roleCodes: string[]): string {
  return Array.from(new Set(roleCodes.map(formatAccessRoleLabel))).join(', ')
}

function dataLevelRank(level: string | null | undefined): number {
  const ranks: Record<string, number> = { M0: 0, M1: 1, M2: 2, M3: 3 }
  return ranks[String(level || '').toUpperCase()] ?? -1
}

function gatewayBreakdownRows(
  snapshot: GatewayObservabilitySnapshot | undefined,
  summary: GatewayTelemetrySummary,
): Array<{ level: string; count: number }> {
  const rows = snapshot?.breakdowns?.data_level
  if (Array.isArray(rows) && rows.length > 0) {
    return rows.map((row) => ({ level: row.key, count: Number(row.count || 0) }))
  }
  return Object.entries(summary.by_data_level ?? {}).map(([level, count]) => ({ level, count: Number(count) }))
}

function formatGatewayBreakdownKey(value: string): string {
  if (value === 'missing') return t('access.gateway.breakdown.missing', '未返回等级')
  return formatDataLevelLabel(value)
}

interface AccessTrendPoint {
  key: string
  label: string
  total: number
  allow: number
  blocked: number
  dau: number
  activePrincipals: string[]
  successRate?: number | null
  executeP95Ms?: number | null
  queueWaitP95Ms?: number | null
}

interface GatewayTrendSummary {
  totalQueries: number
  latestDayQueries: number
  latestDayDau: number
  latestDayLabel: string
  windowDau: number
  peakQueries: number
  peakLabel: string
  usesGatewayTimeseries: boolean
  latestSuccessRate: number | null
  peakExecuteP95Ms: number
}

interface GatewayDataQualitySummary {
  total: number
  identityMissingCount: number
  dataLevelMissingCount: number
  executionProfileMissingCount: number
  policyDecisionMissingCount: number
  credentialRefMissingCount: number
  platformGovernedCount: number
  gatewayOnlyCount: number
  legacyActorCount: number
  hasIdentityGap: boolean
  hasDataGap: boolean
  source: 'query_runs' | 'contract'
}

interface GatewayRowsPage<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  end: number
}

export function formatGatewayStabilityBasis(summary: Pick<GatewayTelemetrySummary, 'query_count' | 'success_count' | 'stability'>): string {
  const total = Number(summary.query_count || 0)
  const success = Number(summary.success_count || 0)
  if (total <= 0) return t('access.gateway.metric.stabilityNoSample', '暂无查询样本')
  const stability = Number(summary.stability)
  return t('access.gateway.metric.stabilityBasis', '网关稳定性 {rate}%；成功 {success} / 查询 {total}', {
    success,
    total,
    rate: formatRatioPercent(stability),
  })
}

export function summarizeGatewayDataQuality(
  rows: GatewayQueryRun[],
  contract?: GatewayContractCompleteness | null,
): GatewayDataQualitySummary {
  if (contract && Number(contract.total || 0) > 0) {
    const total = Number(contract.total || 0)
    const principalMissing = missingCountFromRate(total, contract.principal_present_rate)
    const actorMissing = missingCountFromRate(total, contract.actor_present_rate)
    const identityMissingCount = Math.min(total, Math.min(principalMissing, actorMissing))
    const dataLevelMissingCount = missingCountFromRate(total, contract.data_level_present_rate)
    const executionProfileMissingCount = missingCountFromRate(total, contract.execution_profile_present_rate)
    const policyDecisionMissingCount = missingCountFromRate(total, contract.policy_decision_present_rate)
    const credentialRefMissingCount = missingCountFromRate(total, contract.credential_ref_present_rate)
    return {
      total,
      identityMissingCount,
      dataLevelMissingCount,
      executionProfileMissingCount,
      policyDecisionMissingCount,
      credentialRefMissingCount,
      platformGovernedCount: Number(contract.platform_governed_count ?? 0),
      gatewayOnlyCount: Number(contract.gateway_only_count ?? 0),
      legacyActorCount: Number(contract.legacy_actor_count ?? 0),
      hasIdentityGap: identityMissingCount > 0,
      hasDataGap: [
        identityMissingCount,
        dataLevelMissingCount,
        executionProfileMissingCount,
        policyDecisionMissingCount,
        credentialRefMissingCount,
      ].some((count) => count > 0),
      source: 'contract',
    }
  }

  const total = rows.length
  const identityMissingCount = rows.filter((row) => !gatewayRunActorKey(row)).length
  const dataLevelMissingCount = rows.filter((row) => !String(row.data_level || '').trim()).length
  const executionProfileMissingCount = rows.filter((row) => !String(row.execution_profile_code || '').trim()).length
  return {
    total,
    identityMissingCount,
    dataLevelMissingCount,
    executionProfileMissingCount,
    policyDecisionMissingCount: rows.filter((row) => !String(row.policy_decision_id || '').trim()).length,
    credentialRefMissingCount: rows.filter((row) => !String(row.credential_ref || '').trim()).length,
    platformGovernedCount: rows.filter((row) => String(row.policy_decision_id || '').trim()).length,
    gatewayOnlyCount: rows.filter((row) => !String(row.policy_decision_id || '').trim()).length,
    legacyActorCount: rows.filter((row) => !String(row.actor_type || '').trim()).length,
    hasIdentityGap: total > 0 && identityMissingCount > 0,
    hasDataGap: total > 0 && (identityMissingCount > 0 || dataLevelMissingCount > 0 || executionProfileMissingCount > 0),
    source: 'query_runs',
  }
}

function missingCountFromRate(total: number, rate: number): number {
  const present = Math.round(total * (Number.isFinite(rate) ? rate : 0) / 100)
  return Math.max(0, total - present)
}

export function paginateGatewayRows<T>(rows: T[], page: number, pageSize = GATEWAY_RECORD_PAGE_SIZE): GatewayRowsPage<T> {
  const total = rows.length
  const safePageSize = Math.max(1, Math.trunc(pageSize) || GATEWAY_RECORD_PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages)
  const startIndex = (safePage - 1) * safePageSize
  const endIndex = Math.min(total, startIndex + safePageSize)
  return {
    items: rows.slice(startIndex, endIndex),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : startIndex + 1,
    end: endIndex,
  }
}

export function buildGatewayTrend(rows: GatewayQueryRun[]): AccessTrendPoint[] {
  const validKeys = rows
    .map((row) => dateKey(row.created_at))
    .filter((key): key is string => Boolean(key))
    .sort()
  if (validKeys.length === 0) return []

  const latest = parseDateKey(validKeys[validKeys.length - 1])
  const counts = new Map<string, { total: number; allow: number; blocked: number; principals: Set<string> }>()
  for (const row of rows) {
    const key = dateKey(row.created_at)
    if (!key) continue
    const current = counts.get(key) ?? { total: 0, allow: 0, blocked: 0, principals: new Set<string>() }
    current.total += 1
    if (row.status === 'SUCCEEDED') current.allow += 1
    else current.blocked += 1
    const actorKey = gatewayRunActorKey(row)
    if (actorKey) current.principals.add(actorKey)
    counts.set(key, current)
  }

  return Array.from({ length: 7 }, (_, index) => {
    const key = formatDateKey(addDays(latest, index - 6))
    const count = counts.get(key) ?? { total: 0, allow: 0, blocked: 0, principals: new Set<string>() }
    const activePrincipals = Array.from(count.principals).sort()
    return {
      key,
      label: formatShortDateLabel(key),
      total: count.total,
      allow: count.allow,
      blocked: count.blocked,
      dau: activePrincipals.length,
      activePrincipals,
    }
  })
}

export function buildGatewayTrendFromTimeseries(points: GatewayTimeseriesPoint[]): AccessTrendPoint[] | null {
  const rows = points
    .filter((point) => point.bucket_start)
    .slice(-24)
  if (rows.length === 0) return null
  return rows.map((point) => {
    const total = Number(point.query_total || 0)
    const success = Number(point.success || 0)
    const failed = Number(point.failed || 0)
    const rejected = Number(point.rejected || 0)
    const timeout = Number(point.timeout || 0)
    return {
      key: point.bucket_start,
      label: formatHourLabel(point.bucket_start),
      total,
      allow: success,
      blocked: failed + rejected + timeout,
      dau: 0,
      activePrincipals: [],
      successRate: point.success_rate == null ? null : Number(point.success_rate),
      executeP95Ms: point.execute_p95_ms == null ? null : Number(point.execute_p95_ms),
      queueWaitP95Ms: point.queue_wait_p95_ms == null ? null : Number(point.queue_wait_p95_ms),
    }
  })
}

export function summarizeGatewayTrend(rows: AccessTrendPoint[]): GatewayTrendSummary {
  const activePrincipals = new Set<string>()
  rows.forEach((row) => row.activePrincipals.forEach((principal) => activePrincipals.add(principal)))
  const latest = rows[rows.length - 1]
  const peak = rows.reduce<AccessTrendPoint | null>((current, row) => {
    if (!current || row.total > current.total) return row
    return current
  }, null)
  const usesGatewayTimeseries = rows.some((row) => row.successRate !== undefined || row.executeP95Ms !== undefined)
  return {
    totalQueries: rows.reduce((sum, row) => sum + row.total, 0),
    latestDayQueries: latest?.total ?? 0,
    latestDayDau: latest?.dau ?? 0,
    latestDayLabel: latest?.label ?? '',
    windowDau: activePrincipals.size,
    peakQueries: peak?.total ?? 0,
    peakLabel: peak?.label ?? '',
    usesGatewayTimeseries,
    latestSuccessRate: latest?.successRate ?? null,
    peakExecuteP95Ms: rows.reduce((max, row) => Math.max(max, Number(row.executeP95Ms ?? 0)), 0),
  }
}

function gatewayRunActorKey(row: GatewayQueryRun): string | null {
  const principalId = String(row.principal_id || '').trim()
  if (principalId) return principalId
  const actorId = String(row.actor_id || '').trim()
  return actorId || null
}

function formatRatioPercent(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatGatewayContractRate(value: number): string {
  return `${formatRatioPercent(Number(value || 0))}%`
}

function dateKey(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatShortDateLabel(key: string): string {
  return key.slice(5).replace('-', '/')
}

function formatHourLabel(value: string): string {
  const match = String(value || '').match(/T(\d{2}):/)
  return match ? `${match[1]}:00` : formatShortDateLabel(value)
}

function highestDataPackageCode(packageCodes: string[], dataPackages: AccessPermissionPackage[]): string | null {
  const current = new Set(packageCodes)
  const selected = dataPackages
    .filter((item) => current.has(item.package_code))
    .sort((left, right) => dataLevelRank(right.data_level) - dataLevelRank(left.data_level))
  return selected[0]?.package_code ?? null
}

function formatPackageRoleSummary(item: Pick<AccessPermissionPackage, 'name' | 'role_codes' | 'role_type'>): string | null {
  if (item.role_type === 'data') return null
  const summary = formatRoleList(item.role_codes)
  return summary && summary !== item.name ? summary : null
}

export function formatAccessRoleLabel(roleCode: string): string {
  const labels: Record<string, string> = {
    data_m0_reader: t('access.role.dataM0Reader', '基础数据读取'),
    data_m1_reader: t('access.role.dataM1Reader', '汇总数据读取'),
    data_m2_detail_reader: t('access.role.dataM2Reader', '明细数据读取'),
    data_m3_requester: t('access.role.dataM3Requester', '高敏数据申请'),
    data_m3_approved_reader: t('access.role.dataM3ApprovedReader', '高敏数据读取'),
    data_exporter: t('access.role.dataExporter', '数据开发'),
    platform_admin: t('access.role.platformAdmin', '管理员'),
    semantic_admin: t('access.role.semanticAdmin', '管理员'),
    semantic_modeler: t('access.role.semanticModeler', '数据开发'),
    semantic_reviewer: t('access.role.semanticReviewer', '数据开发'),
    governance_admin: t('access.role.governanceAdmin', '管理员'),
    auditor: t('access.role.auditor', '管理员'),
    product_manager: t('access.role.productManager', '产品经理'),
    viewer: t('access.role.viewer', '普通用户'),
  }
  return labels[roleCode] ?? roleCode
}

export function formatGatewayAlertSeverityLabel(severity: string): string {
  const labels: Record<string, string> = {
    critical: t('access.gateway.severityCritical', '严重'),
    warning: t('access.gateway.severityWarning', '预警'),
    healthy: t('access.gateway.severityHealthy', '正常'),
  }
  return labels[severity] ?? severity
}

export function gatewayAlertTone(severity: string): 'danger' | 'warning' | 'neutral' {
  if (severity === 'critical') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'neutral'
}

export function formatDataLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    M0: 'M0 基础数据',
    M1: 'M1 汇总数据',
    M2: 'M2 明细数据',
    M3: 'M3 原始高敏',
  }
  const key = String(level || '').toUpperCase()
  return labels[key] ?? level
}

export function formatAccessReasonLabel(reasonCode: string, governanceRequired = false): string {
  if (governanceRequired) return '需要先完成数据治理'
  const labels: Record<string, string> = {
    ok: '执行成功',
    policy_allow: '平台策略放行',
    policy_denied: '平台策略拒绝',
    missing_data_role: '缺少对应数据角色',
    m3_governance_required: 'M3 原始高敏阻断',
    physical_denied_after_policy_allow: 'MaxCompute 物理权限拒绝',
    credential_binding_missing: '缺少执行凭据绑定',
    credential_invalid: '执行凭据无效',
    secret_unavailable: '执行凭据不可用',
    sql_guard_denied: 'SQL guard 拦截',
    query_timeout: '查询超时',
  }
  return labels[reasonCode] ?? reasonCode
}

export function formatRowScopeEntryLabel(entry: EffectiveRowScopeEntry): string {
  const values = (entry.values || []).join(', ')
  const policy = entry.policy_code || '—'
  const attribute = entry.attribute
    ? ` · ${t('access.decisions.rowScope.attribute', '属性来源')} ${entry.attribute}`
    : ''
  return `${entry.table}.${entry.column} ${entry.operator} [${values}] · ${t('access.decisions.rowScope.policy', '策略')} ${policy}${attribute}`
}

export function formatRowScopeSummary(row: AccessPolicyDecision): string {
  const scope = row.effective_row_scope
  const count = scope?.entries?.length ?? 0
  const subjectId = scope?.subject_principal_id || row.principal_id
  if (count === 0) return t('access.decisions.rowScope.empty', '无行级范围')
  const first = scope?.entries?.[0]
  const target = first ? `${first.table}.${first.column}` : t('access.decisions.rowScope.unknownTarget', '未知字段')
  const countText = count > 1
    ? t('access.decisions.rowScope.more', '等 {count} 条', { count })
    : t('access.decisions.rowScope.single', '1 条')
  return `${countText} · ${target} · ${t('access.decisions.rowScope.subject', '数据主体')} ${subjectId}`
}

function formatTableLayerLabel(layer: string): string {
  const labels: Record<string, string> = {
    dim: 'DIM 维表层',
    dws: 'DWS 汇总层',
    ads: 'ADS 应用层',
    dwd: 'DWD 明细层',
    ods: 'ODS 原始层',
    raw: 'RAW 原始数据',
  }
  const key = String(layer || '').toLowerCase()
  return labels[key] ?? layer
}

export function formatExecutionModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    gateway_binding: '网关执行方式',
    internal_query_execution: '已下线执行模式',
    inline_policy_decision: '仅做权限判定',
    preview_only: '仅预览',
  }
  return labels[mode] ?? mode
}

export function executionProfileCodeToAccessRole(profileCode?: string | null): string | null {
  const code = String(profileCode || '').trim().toLowerCase()
  if (!code) return null
  const explicit: Record<string, string> = {
    inline_m0: 'data_m0_reader',
    inline_m1: 'data_m1_reader',
    inline_m2: 'data_m2_detail_reader',
    inline_m3: 'data_m3_requester',
    mc_m0_reader: 'data_m0_reader',
    mc_m1_reader: 'data_m1_reader',
    mc_m1_agg_reader: 'data_m1_reader',
    mc_m2_detail: 'data_m2_detail_reader',
    mc_m2_detail_reader: 'data_m2_detail_reader',
    mc_m2_controlled_reader: 'data_m2_detail_reader',
    mc_m3_raw: 'data_m3_requester',
    mc_m3_raw_approved: 'data_m3_approved_reader',
  }
  if (explicit[code]) return explicit[code]
  if (/(^|_)m0($|_)/.test(code)) return 'data_m0_reader'
  if (/(^|_)m1($|_)/.test(code)) return 'data_m1_reader'
  if (/(^|_)m2($|_)/.test(code)) return 'data_m2_detail_reader'
  if (/(^|_)m3($|_)/.test(code)) return 'data_m3_requester'
  return null
}

export function formatExecutionProfileAccessLabel(profileCode?: string | null): string {
  const roleCode = executionProfileCodeToAccessRole(profileCode)
  if (roleCode) return formatAccessRoleLabel(roleCode)
  return String(profileCode || '').trim() ? t('access.profiles.customExecution', '自定义执行方式') : '—'
}

export function getCredentialModeOptions(_currentMode?: string | null): string[] {
  return ['gateway_binding']
}

function formatPolicyActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'metadata.read': t('access.policyAction.metadataRead', '读取元数据'),
    'semantic.plan': t('access.policyAction.semanticPlan', '生成查询计划'),
    query: t('access.policyAction.query', '执行查询'),
  }
  return labels[action] ?? action
}

function formatBooleanLabel(value: boolean): string {
  return value ? t('common.yes', '是') : t('common.no', '否')
}

export function formatExecutionProfileLabel(profiles: AccessExecutionProfile[]): (profileCode: string) => string {
  const profileByCode = new Map(profiles.map((profile) => [profile.profile_code, profile]))
  return (profileCode: string) => {
    const profile = profileByCode.get(profileCode)
    if (!profile) return formatExecutionProfileAccessLabel(profileCode)
    return formatExecutionProfileAccessLabel(profile.profile_code)
  }
}

function defaultProfileForLevels(profiles: AccessExecutionProfile[], dataLevels: string[]): string {
  if (profiles.length === 0) return ''
  const preferredLevel = [...dataLevels].sort((left, right) => dataLevelRank(right) - dataLevelRank(left))[0]
  const matched = profiles.find((profile) => profile.status === 'active' && profile.data_level === preferredLevel)
  return matched?.profile_code ?? profiles.find((profile) => profile.status === 'active')?.profile_code ?? ''
}

export function formatPolicyEffectLabel(effect: string): string {
  if (effect === 'allow') return '允许访问'
  if (effect === 'deny') return '拒绝访问'
  return effect
}
