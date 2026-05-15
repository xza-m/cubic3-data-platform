/* eslint-disable react-refresh/only-export-components */
// frontend/src/v2/pages/config/access/AccessIdentity.tsx
//
// 访问网关工作台：权限配置、权限审计和网关观测。

import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSearch,
  KeyRound,
  Pencil,
  Plus,
  PowerOff,
  RotateCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { IdentityName } from '@v2/components/IdentityName'
import { Button, Chip, Dialog, Input, Skeleton, useToast } from '@v2/components/ui'
import {
  CreateButton,
  RefreshButton,
  Toolbar,
  ToolbarSearch,
  ToolbarSelect,
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
  useCreateExecutionProfile,
  useCreateApiKey,
  useCreateServicePrincipal,
  useDataPolicies,
  useExecutionProfiles,
  useGatewayQueryRuns,
  useGatewayTelemetrySummary,
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
  GatewayQueryRun,
  CreatedApiKey,
} from '@v2/api/access'
import { AppError } from '@v2/api/types'

type TabId = 'principals' | 'services' | 'policies'

type AccessViewId = 'permissions' | 'audit' | 'observability'

interface AccessIdentityProps {
  view?: AccessViewId
}

export default function AccessIdentity({ view = 'permissions' }: AccessIdentityProps) {
  const [tab, setTab] = useState<TabId>('principals')
  const header = {
    principals: {
      title: t('access.principals.title', '成员权限'),
      subtitle: t('access.principals.subtitle', '平台角色决定能做什么，数据访问权限决定最多能读到哪层数据'),
    },
    services: {
      title: t('access.services.title', '机器人接入'),
      subtitle: t('access.services.subtitle', '为 Agent、Bot 和任务签发服务账号与 API Key'),
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
      subtitle: t('access.audit.subtitle', '集中查看权限审批、策略判定和治理要求'),
    },
    observability: {
      title: t('access.observability.title', '网关观测'),
      subtitle: t('access.observability.subtitle', '管理员查看全平台访问记录、查询次数、稳定性和 MaxCompute 兜底结果'),
    },
  }[view]

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <div
        className="flex flex-1 flex-col overflow-hidden rounded-md border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              {viewMeta.title}
            </h1>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-3)' }}>
              {viewMeta.subtitle}
            </p>
          </div>
          {view === 'permissions' ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 rounded-md border p-1" style={{ borderColor: 'var(--border)' }}>
                <TabButton active={tab === 'principals'} onClick={() => setTab('principals')}>
                  <UserRound size={12} /> {t('access.tab.principals', '成员权限')}
                </TabButton>
                <TabButton active={tab === 'services'} onClick={() => setTab('services')}>
                  <Bot size={12} /> {t('access.tab.services', '机器人接入')}
                </TabButton>
                <TabButton active={tab === 'policies'} onClick={() => setTab('policies')}>
                  <ShieldCheck size={12} /> {t('access.tab.policies', '数据访问规则')}
                </TabButton>
              </div>
            </div>
          ) : null}
        </header>
        {view === 'permissions'
          ? (tab === 'principals' ? <PrincipalWorkspace /> : tab === 'services' ? <ServiceWorkspace /> : <PolicyWorkspace />)
          : view === 'audit' ? <PermissionAuditWorkspace /> : <GatewayObservabilityWorkspace />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs"
      style={{
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      {children}
    </button>
  )
}

function PrincipalWorkspace() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [principalType, setPrincipalType] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingPrincipalId, setEditingPrincipalId] = useState<string | null>(null)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const params = { q: q || undefined, principal_type: principalType as '' | 'human' | 'service', page, page_size: 20 }
  const { data, isLoading, isError, refetch, isFetching } = useAccessPrincipals(params)
  const rows = data?.items ?? []
  const total = data?.total ?? 0
  const selectedPrincipal = rows.find((row) => row.principal_id === selectedId)

  const handleRefresh = async () => {
    setManualRefreshing(true)
    try {
      const result = await refetch()
      if (result.isError) throw result.error
      toast.show({ tone: 'success', title: t('access.refresh.principalsSuccess', '成员权限已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.refresh.principalsFailed', '成员权限刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }
  const refreshing = manualRefreshing || isFetching

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <Toolbar className="justify-start">
            <ToolbarSearch
              value={q}
              onChange={(value) => {
                setQ(value)
                setPage(1)
              }}
              placeholder={t('access.principals.search', '搜索 ID / 姓名 / 邮箱')}
              ariaLabel={t('access.principals.searchAria', '搜索成员权限')}
              width={240}
            />
            <ToolbarSelect
              value={principalType}
              onChange={(value) => {
                setPrincipalType(value)
                setPage(1)
              }}
              options={[
                { value: '', label: t('access.principals.allTypes', '全部来源') },
                { value: 'human', label: t('access.principals.human', '真人用户') },
                { value: 'service', label: t('access.principals.service', '机器人/服务账号') },
              ]}
              ariaLabel={t('access.principals.filter.type', '筛选成员来源')}
              width={132}
            />
            <RefreshButton
              onClick={() => void handleRefresh()}
              loading={refreshing}
              ariaLabel={t('access.refresh.principals', '刷新成员权限')}
            />
          </Toolbar>
          <Button
            size="sm"
            disabled={!selectedId}
            onClick={() => setEditingPrincipalId(selectedId)}
          >
            <Pencil size={12} /> {t('access.detail.adjustPackages', '调整权限')}
          </Button>
          <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
            {t('access.principals.total', '共 {n} 个成员/主体', { n: total })}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.principals.loadFailed', '成员权限加载失败')} />
          ) : rows.length === 0 ? (
            <EmptyState text={t('access.principals.empty', '暂无成员权限')} />
          ) : (
            <PrincipalTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <div className="border-t px-4 pb-3" style={{ borderColor: 'var(--border)' }}>
          <ListPagination page={page} pageSize={20} total={total} onPageChange={setPage} />
        </div>
      </section>
      <aside
        role="complementary"
        aria-label={t('access.detail.ariaLabel', '成员权限配置')}
        className="flex w-[420px] shrink-0 flex-col border-l"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {selectedPrincipal
              ? identityDisplayName(selectedPrincipal.display_name, selectedPrincipal.principal_id)
              : t('access.detail.title', '成员权限配置')}
          </h2>
          <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
            {selectedPrincipal
              ? `${principalTypeLabel(selectedPrincipal.principal_type)} · ${selectedPrincipal.tenant_key}`
              : t('access.detail.pickPrincipal', '选择一个成员查看权限配置')}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <PrincipalDetailPanel principalId={selectedId} />
        </div>
      </aside>
      <PermissionPackageDialog principalId={editingPrincipalId} onClose={() => setEditingPrincipalId(null)} />
    </div>
  )
}

function PrincipalTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AccessPrincipal[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.principals.col.principal', '成员')}</Th>
          <Th>{t('access.principals.col.type', '来源')}</Th>
          <Th>{t('access.principals.col.tenant', '租户')}</Th>
          <Th>{t('access.principals.col.lastSeen', '最近出现')}</Th>
          <Th>{t('access.principals.col.status', '状态')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.principal_id}
            className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{
              borderBottom: '1px solid var(--border)',
              background: selectedId === row.principal_id ? 'var(--accent-soft)' : 'transparent',
            }}
            onClick={() => onSelect(row.principal_id)}
          >
            <td className="max-w-[320px] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {row.principal_type === 'service' ? <Bot size={13} /> : <UserRound size={13} />}
                <div className="min-w-0">
                  <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>
                    {identityDisplayName(row.display_name, row.principal_id)}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {principalTypeLabel(row.principal_type)} · {row.idp === 'feishu' ? '飞书同步' : row.idp}
                  </div>
                </div>
              </div>
            </td>
            <td className="px-4 py-2.5"><TypeChip type={row.principal_type} /></td>
            <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.tenant_key}</td>
            <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-3)' }}>{row.last_seen_at ? fmtDateTime(row.last_seen_at) : '—'}</td>
            <td className="px-4 py-2.5"><StatusChip status={row.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
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
        [t('access.detail.idp', '身份来源'), data.idp === 'feishu' ? '飞书' : data.idp],
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

function ServiceWorkspace() {
  const toast = useToast()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingService, setCreatingService] = useState(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const { data, isLoading, isError, refetch, isFetching } = useServicePrincipals()
  const rows = data ?? []
  const selectedService = rows.find((row) => row.principal_id === selectedId)

  const handleRefresh = async () => {
    setManualRefreshing(true)
    try {
      const result = await refetch()
      if (result.isError) throw result.error
      toast.show({ tone: 'success', title: t('access.refresh.servicesSuccess', '机器人接入已刷新') })
    } catch {
      toast.show({ tone: 'danger', title: t('access.refresh.servicesFailed', '机器人接入刷新失败') })
    } finally {
      setManualRefreshing(false)
    }
  }
  const refreshing = manualRefreshing || isFetching

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('access.services.title', '机器人接入 / API Key')}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            {t('access.services.total', '共 {n} 个', { n: rows.length })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <RefreshButton
              onClick={() => void handleRefresh()}
              loading={refreshing}
              ariaLabel={t('access.refresh.services', '刷新机器人接入')}
            />
            <CreateButton
              label={t('access.services.create', '新建机器人')}
              onClick={() => setCreatingService(true)}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.services.loadFailed', '机器人接入加载失败')} />
          ) : rows.length === 0 ? (
            <EmptyState text={t('access.services.empty', '暂无机器人接入')} />
          ) : (
            <ServiceTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
      </section>
      <aside
        role="complementary"
        aria-label={t('access.services.detailAriaLabel', '机器人接入配置')}
        className="flex w-[420px] shrink-0 flex-col border-l"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <h2 className="truncate text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
            {selectedService
              ? identityDisplayName(selectedService.display_name, selectedService.principal_id)
              : t('access.services.detailTitle', '机器人接入配置')}
          </h2>
          <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--text-3)' }}>
            {selectedService
              ? `${selectedService.service_type} · ${selectedService.owner_team || t('access.services.noTeam', '未设置团队')}`
              : t('access.services.pick', '选择机器人查看接入凭证')}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <ServiceDetailPanel principalId={selectedId} />
        </div>
      </aside>
      <CreateServiceDialog open={creatingService} onClose={() => setCreatingService(false)} />
    </div>
  )
}

function ServiceTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AccessServicePrincipal[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.services.col.principal', '机器人')}</Th>
          <Th>{t('access.services.col.type', '类型')}</Th>
          <Th>{t('access.services.col.owner', '负责人')}</Th>
          <Th>{t('access.services.col.tenants', '允许租户')}</Th>
          <Th>{t('access.services.col.status', '状态')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.principal_id}
            className="cursor-pointer transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{
              borderBottom: '1px solid var(--border)',
              background: selectedId === row.principal_id ? 'var(--accent-soft)' : 'transparent',
            }}
            onClick={() => onSelect(row.principal_id)}
          >
            <td className="max-w-[320px] px-4 py-2.5">
              <div className="truncate font-medium" style={{ color: 'var(--text-1)' }}>
                {identityDisplayName(row.display_name, row.principal_id)}
              </div>
              <div className="truncate font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.principal_id}</div>
              <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{row.description || '—'}</div>
            </td>
            <td className="px-4 py-2.5"><Chip tone="violet">{row.service_type}</Chip></td>
            <td className="max-w-[220px] truncate px-4 py-2.5" style={{ color: 'var(--text-2)' }}>
              <IdentityName value={row.owner_principal_id} displayName={row.owner_display_name} />
            </td>
            <td className="px-4 py-2.5" style={{ color: 'var(--text-2)' }}>{row.allowed_tenants.join(', ') || '—'}</td>
            <td className="px-4 py-2.5"><StatusChip status={row.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ServiceDetailPanel({ principalId }: { principalId: string | null }) {
  const toast = useToast()
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
    if (!window.confirm(t('access.apiKeys.revokeConfirm', '吊销这个 API Key？'))) return
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
  const [creatingPolicy, setCreatingPolicy] = useState(false)
  const [creatingProfile, setCreatingProfile] = useState(false)
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
  const {
    data: decisions,
    isLoading: loadingDecisions,
    isError: decisionError,
    isFetching: fetchingDecisions,
    refetch: refetchDecisions,
  } = usePolicyDecisions({ limit: 50 })
  const updatePolicy = useUpdateDataPolicy()
  const updateProfile = useUpdateExecutionProfile()

  const refreshAll = async () => {
    setManualRefreshing(true)
    try {
      const results = await Promise.all([
        refetchPolicies(),
        refetchProfiles(),
        refetchDecisions(),
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
  const refreshing = manualRefreshing || fetchingPolicies || fetchingProfiles || fetchingDecisions

  const disablePolicy = async (policy: AccessDataPolicy) => {
    if (!window.confirm(t('access.policies.disableConfirm', '停用这个访问规则？'))) return
    await updatePolicy.mutateAsync({
      policyCode: policy.policy_code,
      payload: { status: 'disabled' },
    })
    toast.show({ tone: 'warning', title: t('access.policies.disabled', '访问规则已停用') })
  }

  const disableProfile = async (profile: AccessExecutionProfile) => {
    if (!window.confirm(t('access.profiles.disableConfirm', '停用这个执行配置？'))) return
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
            <CreateButton
              label={t('access.policies.create', '新建访问规则')}
              onClick={() => setCreatingPolicy(true)}
            />
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
          <div className="mt-4">
            <PanelTitle title={t('access.decisions.section', '最近判定')} count={decisions?.total ?? 0} />
            {loadingDecisions ? (
              <LoadingRows />
            ) : decisionError ? (
              <EmptyState tone="danger" text={t('access.decisions.loadFailed', '判定记录加载失败')} />
            ) : (decisions?.items ?? []).length === 0 ? (
              <EmptyState text={t('access.decisions.empty', '暂无判定记录')} />
            ) : (
              <PolicyDecisionTable rows={decisions?.items ?? []} />
            )}
          </div>

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
                    {t('access.profiles.section', '执行方式（高级）')}
                    <span className="ml-2 font-normal" style={{ color: 'var(--text-3)' }}>{profiles?.total ?? 0}</span>
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {t('access.profiles.helper', '只控制行数、超时、导出和审计；真实 RAM 绑定由 gateway 维护')}
                  </div>
                </div>
              </div>
              {showAdvancedProfiles ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation()
                    setCreatingProfile(true)
                  }}
                >
                  <Plus size={12} /> {t('access.profiles.create', '新建执行方式')}
                </Button>
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
      <ExecutionProfileDialog open={creatingProfile} onClose={() => setCreatingProfile(false)} />
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
  const approvalRows = rows.filter((row) => row.governance_required)
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
          label={t('access.audit.metric.approvals', '权限审批记录')}
          value={approvalRows.length}
          detail={t('access.audit.metric.approvalsDetail', '需要治理或人工确认的访问判定')}
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
          <PanelTitle title={t('access.audit.approvals.section', '权限审批记录')} count={approvalRows.length} />
          {isLoading ? (
            <LoadingRows />
          ) : isError ? (
            <EmptyState tone="danger" text={t('access.audit.loadFailed', '权限审计加载失败')} />
          ) : approvalRows.length === 0 ? (
            <EmptyState text={t('access.audit.approvals.empty', '暂无需要审批的权限记录')} />
          ) : (
            <ApprovalRecordTable rows={approvalRows} />
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
  const summaryQuery = useGatewayTelemetrySummary()
  const runsQuery = useGatewayQueryRuns({ limit: 100 })
  const summary = summaryQuery.data ?? {
    query_count: 0,
    success_count: 0,
    failed_count: 0,
    physical_denied_count: 0,
    stability: 100,
    by_data_level: {},
  }
  const rows = useMemo(() => runsQuery.data?.items ?? [], [runsQuery.data?.items])
  const isLoading = summaryQuery.isLoading || runsQuery.isLoading
  const isError = summaryQuery.isError || runsQuery.isError
  const trendRows = useMemo(() => buildGatewayTrend(rows), [rows])
  const breakdownRows = useMemo(
    () => Object.entries(summary.by_data_level ?? {}).map(([level, count]) => ({ level, count: Number(count) })),
    [summary.by_data_level],
  )
  const credentialIssueCount = rows.filter((row) => isCredentialReason(row.reason_code || '')).length
  const gatewayDeniedCount = rows.filter((row) => row.status === 'FAILED' && !row.physical_denied).length
  const refresh = () => {
    void summaryQuery.refetch()
    void runsQuery.refetch()
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>
          {t('access.gateway.source.detail', 'data-platform 只展示 gateway 遥测；执行记录、SQL guard、MaxCompute 物理拒绝和稳定性指标由 dw-query-gateway 提供。')}
        </div>
        <RefreshButton
          onClick={refresh}
          loading={summaryQuery.isFetching || runsQuery.isFetching}
          ariaLabel={t('access.gateway.refresh', '刷新网关观测')}
        />
      </div>
      {isError ? (
        <div className="mb-3">
          <EmptyState tone="danger" text={t('access.gateway.loadFailed', '网关观测加载失败，请检查 data-platform 到 dw-query-gateway 的服务令牌和网络连通性')} />
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-5">
        <GatewayMetricCard
          label={t('access.gateway.metric.queries', '查询次数')}
          value={isLoading ? '—' : summary.query_count}
          detail={t('access.gateway.metric.queriesDetail', '来自 dw-query-gateway 的真实执行记录')}
        />
        <GatewayMetricCard
          label={t('access.gateway.metric.allowed', '执行成功')}
          value={isLoading ? '—' : summary.success_count}
          detail={t('access.gateway.metric.allowedDetail', '按 gateway query_runs 状态统计')}
        />
        <GatewayMetricCard
          label={t('access.gateway.metric.denied', '网关拦截')}
          value={isLoading ? '—' : gatewayDeniedCount}
          detail={t('access.gateway.metric.deniedDetail', 'SQL guard 或执行护栏拦截')}
        />
        <GatewayMetricCard
          label={t('access.gateway.metric.physicalDenied', '物理拒绝')}
          value={isLoading ? '—' : summary.physical_denied_count}
          detail={t('access.gateway.metric.physicalDeniedDetail', '平台放行后 MaxCompute 兜底拒绝')}
          tone={summary.physical_denied_count > 0 ? 'warning' : 'neutral'}
        />
        <GatewayMetricCard
          label={t('access.gateway.metric.stability', '稳定性')}
          value={isLoading ? '—' : `${summary.stability}%`}
          detail={t('access.gateway.metric.stabilityDetail', '成功率、P95 耗时和异常率')}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <AccessTrendPanel rows={trendRows} />
          <section className="mt-4 rounded-md border p-3" style={{ borderColor: 'var(--border)' }}>
            <PanelTitle title={t('access.gateway.records.section', '全平台访问记录')} count={rows.length} />
            {isLoading ? (
              <LoadingRows />
            ) : rows.length === 0 ? (
              <EmptyState text={t('access.gateway.records.empty', '暂无网关执行记录')} />
            ) : (
              <GatewayExecutionRecordTable rows={rows.slice(0, 30)} onOpenTrace={setTraceRun} />
            )}
          </section>
        </section>

        <aside className="space-y-4">
          <GatewayBreakdownPanel rows={breakdownRows} total={summary.query_count} />
          <PhysicalPermissionPanel
            physicalDeniedCount={summary.physical_denied_count}
            credentialIssueCount={credentialIssueCount}
            deniedCount={gatewayDeniedCount}
            stabilityRate={`${summary.stability}%`}
          />
        </aside>
      </div>
      <GatewayTraceDialog run={traceRun} onClose={() => setTraceRun(null)} />
    </div>
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

function AccessTrendPanel({ rows }: { rows: AccessTrendPoint[] }) {
  const maxCount = Math.max(1, ...rows.map((row) => row.total))
  return (
    <section className="mt-4 rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-1)' }}>
            {t('access.gateway.trend.section', '访问趋势')}
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-3)' }}>
            {t('access.gateway.trend.helper', '按最近访问记录聚合查询次数、放行和拦截')}
          </div>
        </div>
        <Chip tone="neutral">{t('access.gateway.trend.window', '最近记录')}</Chip>
      </div>
      {rows.length === 0 ? (
        <EmptyState text={t('access.gateway.trend.empty', '暂无访问趋势')} />
      ) : (
        <div className="grid min-h-[132px] grid-cols-7 items-end gap-2">
          {rows.map((row) => {
            const totalHeight = Math.max(10, Math.round((row.total / maxCount) * 96))
            const allowHeight = row.total > 0 ? Math.max(2, Math.round((row.allow / row.total) * totalHeight)) : 0
            const blockedHeight = Math.max(0, totalHeight - allowHeight)
            return (
              <div key={row.key} className="flex min-w-0 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end justify-center">
                  <div
                    className="flex w-full max-w-[44px] flex-col justify-end overflow-hidden rounded-t"
                    style={{ height: totalHeight, background: 'var(--bg-surface-2)' }}
                    title={`${row.label} · ${row.total}`}
                  >
                    {blockedHeight > 0 ? (
                      <div style={{ height: blockedHeight, background: 'var(--danger)' }} />
                    ) : null}
                    {allowHeight > 0 ? (
                      <div style={{ height: allowHeight, background: 'var(--accent)' }} />
                    ) : null}
                  </div>
                </div>
                <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>{row.label}</div>
                <div className="font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.total}</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
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
                <span style={{ color: 'var(--text-2)' }}>{formatDataLevelLabel(row.level)}</span>
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

function GatewayExecutionRecordTable({
  rows,
  onOpenTrace,
}: {
  rows: GatewayQueryRun[]
  onOpenTrace: (run: GatewayQueryRun) => void
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.gateway.records.col.time', '时间')}</Th>
          <Th>{t('access.gateway.records.col.principal', '成员')}</Th>
          <Th>{t('access.gateway.records.col.level', '等级')}</Th>
          <Th>{t('access.gateway.records.col.profile', '执行方式')}</Th>
          <Th>{t('access.gateway.records.col.result', '结果')}</Th>
          <Th>{t('access.gateway.records.col.trace', 'Trace')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.query_id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="whitespace-nowrap px-4 py-2.5" style={{ color: 'var(--text-3)' }}>
              {row.created_at ? fmtDateTime(row.created_at) : '—'}
            </td>
            <td className="max-w-[220px] px-4 py-2.5">
              <IdentityName value={row.principal_id || '—'} />
            </td>
            <td className="px-4 py-2.5">{formatDataLevelLabel(row.data_level || '')}</td>
            <td className="px-4 py-2.5">
              <div className="font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.execution_profile_code || '—'}</div>
              <div className="mt-1 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.credential_ref || '—'}</div>
            </td>
            <td className="px-4 py-2.5">
              <StatusChip status={row.physical_denied ? 'physical_denied' : row.status} />
              <div className="mt-1 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.reason_code || '—'}</div>
            </td>
            <td className="px-4 py-2.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                onClick={() => onOpenTrace(row)}
              >
                <FileSearch size={11} /> {t('access.gateway.records.trace', '查看')}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  danger = false,
}: {
  label: string
  value?: number
  text?: string
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="font-medium tabular-nums" style={{ color: danger ? 'var(--danger)' : 'var(--text-1)' }}>
        {typeof value === 'number' ? value : text}
      </span>
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
    [t('access.gateway.trace.profile', 'ExecutionProfile'), run.execution_profile_code || '—'],
    [t('access.gateway.trace.runtime', '执行服务'), run.status],
    [t('access.gateway.trace.physical', 'MaxCompute 兜底'), run.physical_denied ? t('access.gateway.trace.physicalDenied', '物理拒绝') : t('access.gateway.trace.physicalPending', '未触发物理拒绝')],
  ] : []

  return (
    <Dialog open={Boolean(run)} onClose={onClose} title={t('access.gateway.trace.title', '执行 Trace')} width={680}>
      {run ? (
        <div className="space-y-4 text-xs">
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
            <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.execution_profile_code || '—'}</td>
            <td className="px-4 py-2.5"><StatusChip status={row.status} /></td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
                  aria-label={`编辑策略 ${row.policy_code}`}
                  onClick={() => onEdit(row)}
                >
                  <Pencil size={11} /> {t('action.edit', '编辑')}
                </button>
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
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PolicyDecisionTable({ rows }: { rows: AccessPolicyDecision[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.decisions.col.decision', '判定')}</Th>
          <Th>{t('access.decisions.col.principal', '成员')}</Th>
          <Th>{t('access.decisions.col.level', '等级')}</Th>
          <Th>{t('access.decisions.col.profile', '执行方式')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.decision_id} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="px-4 py-2.5">
              <StatusChip status={row.decision} />
              <div className="mt-1 font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.reason_code}</div>
            </td>
            <td className="max-w-[260px] px-4 py-2.5">
              <IdentityName value={row.principal_id} displayName={row.principal_display_name} />
            </td>
            <td className="px-4 py-2.5">{row.data_level}</td>
            <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: 'var(--text-2)' }}>{row.execution_profile_code || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ApprovalRecordTable({ rows }: { rows: AccessPolicyDecision[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="sticky top-0 z-10">
        <tr style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
          <Th>{t('access.audit.approvals.col.time', '时间')}</Th>
          <Th>{t('access.audit.approvals.col.principal', '成员')}</Th>
          <Th>{t('access.audit.approvals.col.scope', '申请范围')}</Th>
          <Th>{t('access.audit.approvals.col.reason', '治理原因')}</Th>
          <Th>{t('access.audit.approvals.col.status', '状态')}</Th>
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
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-1)' }}>{row.name}</span>
            <Chip tone="accent">{formatDataLevelLabel(row.data_level)}</Chip>
            <StatusChip status={row.status} />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[color:var(--bg-hover)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
              aria-label={`编辑执行配置 ${row.profile_code}`}
              onClick={() => onEdit(row)}
            >
              <Pencil size={11} /> {t('action.edit', '编辑')}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
              aria-label={`停用执行配置 ${row.profile_code}`}
              disabled={disabling || row.status === 'disabled'}
              onClick={() => onDisable(row)}
            >
              <PowerOff size={11} /> {t('access.action.disable', '停用')}
            </button>
          </div>
          <div className="mt-1 break-all font-mono text-[11px]" style={{ color: 'var(--text-3)' }}>{row.profile_code}</div>
          <div className="mt-3">
            <InfoGrid items={[
              [t('access.profiles.credentialMode', '执行模式'), formatExecutionModeLabel(row.credential_mode)],
              [t('access.profiles.maxRows', '最大行数'), row.max_rows ? String(row.max_rows) : '—'],
              [t('access.profiles.timeout', '超时'), row.timeout_seconds ? `${row.timeout_seconds}s` : '—'],
              [t('access.profiles.audit', '强审计'), row.requires_strong_audit ? '是' : '否'],
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
  const createProfile = useCreateExecutionProfile()
  const updateProfile = useUpdateExecutionProfile()
  const [profileCode, setProfileCode] = useState('')
  const [name, setName] = useState('')
  const [credentialMode, setCredentialMode] = useState('gateway_binding')
  const [dataLevel, setDataLevel] = useState('M1')
  const [operations, setOperations] = useState('query')
  const [maxRows, setMaxRows] = useState('1000')
  const [timeout, setTimeoutValue] = useState('60')
  const [status, setStatus] = useState('active')
  const editing = Boolean(profile)

  useEffect(() => {
    if (!open) return
    setProfileCode(profile?.profile_code ?? '')
    setName(profile?.name ?? '')
    setCredentialMode(profile?.credential_mode ?? 'gateway_binding')
    setDataLevel(profile?.data_level ?? 'M1')
    setOperations((profile?.allowed_operations ?? ['query']).join(','))
    setMaxRows(profile?.max_rows == null ? '1000' : String(profile.max_rows))
    setTimeoutValue(profile?.timeout_seconds == null ? '60' : String(profile.timeout_seconds))
    setStatus(profile?.status ?? 'active')
  }, [open, profile])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const payload: Partial<AccessExecutionProfile> & {
      profile_code: string
      name: string
      credential_mode: string
    } = {
      profile_code: profileCode,
      name,
      credential_mode: credentialMode,
      data_level: dataLevel,
      allowed_operations: splitList(operations),
      max_rows: Number(maxRows) || null,
      timeout_seconds: Number(timeout) || null,
      export_allowed: profile?.export_allowed ?? false,
      requires_strong_audit: profile?.requires_strong_audit ?? dataLevel === 'M3',
      status,
    }
    if (editing && profile) {
      await updateProfile.mutateAsync({
        profileCode: profile.profile_code,
        payload,
      })
      toast.show({ tone: 'success', title: t('access.profiles.updated', '执行配置已更新') })
    } else {
      await createProfile.mutateAsync(payload)
      toast.show({ tone: 'success', title: t('access.profiles.created', '执行配置已创建') })
    }
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title={editing ? '编辑执行方式' : '新建执行方式'} width={560}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="执行方式编码 *" value={profileCode} onChange={setProfileCode} required disabled={editing} />
        <Field label="名称 *" value={name} onChange={setName} required />
        <SelectField
          label="执行模式 *"
          value={credentialMode}
          onChange={setCredentialMode}
          options={['gateway_binding', 'internal_query_execution', 'inline_policy_decision']}
          formatOption={formatExecutionModeLabel}
        />
        <Field label="数据等级" value={dataLevel} onChange={setDataLevel} />
        <Field label="允许动作" value={operations} onChange={setOperations} />
        <Field label="最大行数" value={maxRows} onChange={setMaxRows} />
        <Field label="超时时间（秒）" value={timeout} onChange={setTimeoutValue} />
        <SelectField label="状态" value={status} onChange={setStatus} options={['active', 'disabled']} />
        <DialogActions
          onClose={onClose}
          loading={createProfile.isPending || updateProfile.isPending}
          submitLabel={editing ? t('action.save', '保存') : t('action.create', '创建')}
        />
      </form>
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
  const [policyCode, setPolicyCode] = useState('')
  const [name, setName] = useState('')
  const [subjectRoles, setSubjectRoles] = useState('data_m1_reader')
  const [dataLevels, setDataLevels] = useState('M1')
  const [tableLayers, setTableLayers] = useState('dws,ads')
  const [tablePrefixes, setTablePrefixes] = useState('dws_,ads_')
  const [actions, setActions] = useState('query')
  const [effect, setEffect] = useState('allow')
  const [profileCode, setProfileCode] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState('active')
  const editing = Boolean(policy)

  useEffect(() => {
    if (!open) return
    const scope = policy?.resource_scope ?? {}
    setPolicyCode(policy?.policy_code ?? '')
    setName(policy?.name ?? '')
    setSubjectRoles((policy?.subject_roles ?? ['data_m1_reader']).join(','))
    setDataLevels(scopeValues(scope, 'data_levels', ['M1']).join(','))
    setTableLayers(scopeValues(scope, 'table_layers', ['dws', 'ads']).join(','))
    setTablePrefixes(scopeValues(scope, 'table_prefixes', ['dws_', 'ads_']).join(','))
    setActions((policy?.actions ?? ['query']).join(','))
    setEffect(policy?.effect ?? 'allow')
    setProfileCode(policy?.execution_profile_code ?? '')
    setReason(policy?.reason ?? '')
    setStatus(policy?.status ?? 'active')
  }, [open, policy])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsedLevels = splitList(dataLevels)
    const payload: Partial<AccessDataPolicy> & {
      policy_code: string
      name: string
    } = {
      policy_code: policyCode,
      name,
      status,
      priority: policy?.priority ?? 100,
      subject_roles: splitList(subjectRoles),
      resource_scope: {
        data_levels: parsedLevels,
        table_layers: splitList(tableLayers),
        table_prefixes: splitList(tablePrefixes),
      },
      actions: splitList(actions),
      effect,
      execution_profile_code: profileCode || null,
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
    <Dialog open={open} onClose={onClose} title={editing ? '编辑访问规则' : '新建访问规则'} width={620}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="规则编码 *" value={policyCode} onChange={setPolicyCode} required disabled={editing} />
        <Field label="名称 *" value={name} onChange={setName} required />
        <Field label="适用权限角色" value={subjectRoles} onChange={setSubjectRoles} />
        <Field label="可访问数据等级" value={dataLevels} onChange={setDataLevels} />
        <Field label="可访问表层级" value={tableLayers} onChange={setTableLayers} />
        <Field label="可访问表名前缀" value={tablePrefixes} onChange={setTablePrefixes} />
        <Field label="允许操作" value={actions} onChange={setActions} />
        <SelectField label="访问结果" value={effect} onChange={setEffect} options={['allow', 'deny']} formatOption={formatPolicyEffectLabel} />
        <Field label="通过后执行方式" value={profileCode} onChange={setProfileCode} />
        <Field label="说明" value={reason} onChange={setReason} />
        <SelectField label="状态" value={status} onChange={setStatus} options={['active', 'disabled']} />
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
        `当前账号没有权限配置写权限，需要 ${required}，当前为 ${current}。请先用管理员账号授权后再保存。`,
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
  const scopeOptions = mergeOptions(roleCatalog?.api_key_scopes, scopes)

  useEffect(() => {
    if (scopes.length > 0) return
    const firstScope = roleCatalog?.api_key_scopes?.[0]
    if (firstScope) setScopes([firstScope])
  }, [roleCatalog, scopes.length])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const key = await createKey.mutateAsync({
      principalId,
      payload: {
        scopes,
        allowed_ips: splitList(allowedIps),
        rate_limit_per_minute: Number(rateLimit) || null,
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  formatOption?: (value: string) => string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{label}</label>
      <select
        className="w-full rounded border px-2 py-1.5 text-xs outline-none"
        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-1)' }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => <option key={option} value={option}>{formatOption ? formatOption(option) : option}</option>)}
      </select>
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
    demo_bootstrap: t('access.bindings.source.demoBootstrap', '演示初始化'),
  }[source] ?? source
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

function isCredentialReason(reasonCode: string): boolean {
  return ['credential_binding_missing', 'credential_invalid', 'secret_unavailable'].includes(reasonCode)
}

interface AccessTrendPoint {
  key: string
  label: string
  total: number
  allow: number
  blocked: number
}

function buildGatewayTrend(rows: GatewayQueryRun[]): AccessTrendPoint[] {
  const validKeys = rows
    .map((row) => dateKey(row.created_at))
    .filter((key): key is string => Boolean(key))
    .sort()
  if (validKeys.length === 0) return []

  const latest = parseDateKey(validKeys[validKeys.length - 1])
  const counts = new Map<string, { total: number; allow: number; blocked: number }>()
  for (const row of rows) {
    const key = dateKey(row.created_at)
    if (!key) continue
    const current = counts.get(key) ?? { total: 0, allow: 0, blocked: 0 }
    current.total += 1
    if (row.status === 'SUCCEEDED') current.allow += 1
    else current.blocked += 1
    counts.set(key, current)
  }

  return Array.from({ length: 7 }, (_, index) => {
    const key = formatDateKey(addDays(latest, index - 6))
    const count = counts.get(key) ?? { total: 0, allow: 0, blocked: 0 }
    return {
      key,
      label: formatShortDateLabel(key),
      ...count,
    }
  })
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
    data_m0_reader: '基础数据读取',
    data_m1_reader: '汇总数据读取',
    data_m2_detail_reader: '明细数据读取',
    data_exporter: '数据开发',
    platform_admin: '管理员',
    semantic_admin: '管理员',
    semantic_modeler: '数据开发',
    semantic_reviewer: '数据开发',
    governance_admin: '管理员',
    auditor: '管理员',
    product_manager: '产品经理',
    viewer: '普通用户',
  }
  return labels[roleCode] ?? roleCode
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
    gateway_binding: '网关执行画像',
    internal_query_execution: '平台内置执行',
    inline_policy_decision: '仅做权限判定',
    preview_only: '仅预览',
  }
  return labels[mode] ?? mode
}

export function formatPolicyEffectLabel(effect: string): string {
  if (effect === 'allow') return '允许访问'
  if (effect === 'deny') return '拒绝访问'
  return effect
}
