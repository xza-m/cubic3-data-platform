// frontend/src/v2/pages/semantic/ontology/Governance.tsx
//
// 治理页：Policy 列表 + Glossary 列表。
// 接口：GET /api/v1/ontology/policies
//       POST /api/v1/ontology/policies
//       GET /api/v1/ontology/glossary
//       POST /api/v1/ontology/glossary

import { useState } from 'react'
import { Plus } from 'lucide-react'
// 等待 X-Crosscut：@v2/components/ui
import { Button, Chip, Tabs, Tab } from '@v2/components/ui'
// 等待 X-Crosscut：@v2/components/EntityFormDialog
import { EntityFormDialog } from '@v2/components/EntityFormDialog'
// 等待 X-Crosscut：@v2/i18n
import { t } from '@v2/i18n'
import { usePolicyList, useCreatePolicy, useGlossaryList, useCreateGlossary } from '@v2/hooks/ontology'
import { useSemanticMapperConsistencyReport, useSemanticMapperStaleCheck } from '@v2/hooks/semantic'
import type { PolicyMetadata, GlossaryEntry } from '@v2/api/ontology'

export default function OntologyGovernance() {
  const [tab, setTab] = useState<'policy' | 'glossary'>('policy')
  const [showCreatePolicy, setShowCreatePolicy] = useState(false)
  const [showCreateGlossary, setShowCreateGlossary] = useState(false)

  const policyQuery = usePolicyList()
  const glossaryQuery = useGlossaryList()
  const createPolicy = useCreatePolicy()
  const createGlossary = useCreateGlossary()
  const staleCheck = useSemanticMapperStaleCheck()
  const consistencyReport = useSemanticMapperConsistencyReport()

  const policies = policyQuery.data?.items ?? []
  const glossary = glossaryQuery.data?.items ?? []
  const staleItems = ((staleCheck.data?.stale_items ?? staleCheck.data?.items ?? []) as Array<Record<string, unknown>>)
  const consistencyItems = ((consistencyReport.data?.consistency_items ?? consistencyReport.data?.items ?? []) as Array<Record<string, unknown>>)

  const handleCreatePolicy = async (data: Record<string, string>) => {
    await createPolicy.mutateAsync({
      name: data.name,
      target_type: data.target_type || 'object',
      target_name: data.target_name,
      visibility: data.visibility || undefined,
      allowed_roles: data.allowed_roles
        ? data.allowed_roles.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      description: data.description || undefined,
    })
    setShowCreatePolicy(false)
  }

  const handleCreateGlossary = async (data: Record<string, string>) => {
    await createGlossary.mutateAsync({
      canonical_name: data.canonical_name,
      title: data.title || undefined,
      entry_type: data.entry_type || undefined,
      description: data.description || undefined,
      aliases: data.aliases
        ? data.aliases.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    })
    setShowCreateGlossary(false)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 子标签 */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b px-5 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <Tabs
          value={tab}
          onChange={(v) => setTab(v as 'policy' | 'glossary')}
          size="sm"
          bordered={false}
          aria-label={t('governance.tabNavigation', '治理视图导航')}
        >
          <Tab value="policy">{t('governance.tab.policy', '数据策略')}</Tab>
          <Tab value="glossary">{t('governance.tab.glossary', '业务术语')}</Tab>
        </Tabs>
        {tab === 'policy' ? (
          <Button size="sm" variant="primary" onClick={() => setShowCreatePolicy(true)}>
            <Plus size={12} /> {t('governance.policy.create', '新建策略')}
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setShowCreateGlossary(true)}>
            <Plus size={12} /> {t('governance.glossary.create', '新建术语')}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto scroll-thin p-5">
        <SemanticRiskSummary
          staleCount={staleItems.length}
          consistencyCount={consistencyItems.length}
          loading={staleCheck.isLoading || consistencyReport.isLoading}
        />
        {tab === 'policy' ? (
          <PolicyTable
            items={policies}
            loading={policyQuery.isLoading}
            error={policyQuery.isError}
          />
        ) : (
          <GlossaryTable
            items={glossary}
            loading={glossaryQuery.isLoading}
            error={glossaryQuery.isError}
          />
        )}
      </div>

      {/* 新建策略 */}
      <EntityFormDialog
        open={showCreatePolicy}
        onClose={() => setShowCreatePolicy(false)}
        title={t('governance.policy.createTitle', '新建数据策略')}
        loading={createPolicy.isPending}
        onSubmit={handleCreatePolicy}
        fields={[
          { key: 'name', label: t('col.name', '标识符（英文）'), required: true },
          {
            key: 'target_type',
            label: t('governance.policy.targetType', '目标类型'),
            type: 'select',
            required: true,
            options: [
              { value: 'object', label: t('ontology.target.object', '业务对象') },
              { value: 'metric', label: t('ontology.target.metric', '指标') },
              { value: 'property', label: t('ontology.target.property', '字段') },
            ],
          },
          { key: 'target_name', label: t('governance.policy.targetName', '目标名称'), required: true },
          { key: 'visibility', label: t('governance.policy.visibility', '可见性') },
          { key: 'allowed_roles', label: t('governance.policy.allowedRoles', '允许角色（逗号分隔）') },
          { key: 'description', label: t('objectCreate.description', '描述'), type: 'textarea' },
        ]}
      />

      {/* 新建术语 */}
      <EntityFormDialog
        open={showCreateGlossary}
        onClose={() => setShowCreateGlossary(false)}
        title={t('governance.glossary.createTitle', '新建业务术语')}
        loading={createGlossary.isPending}
        onSubmit={handleCreateGlossary}
        fields={[
          { key: 'canonical_name', label: t('governance.glossary.canonicalName', '标识（英文）'), required: true },
          { key: 'title', label: t('objectCreate.title', '显示名称') },
          { key: 'entry_type', label: t('governance.glossary.entryType', '术语类型') },
          { key: 'description', label: t('governance.glossary.definition', '定义'), type: 'textarea' },
          { key: 'aliases', label: t('governance.glossary.aliases', '别名（逗号分隔）') },
        ]}
      />
    </div>
  )
}

function SemanticRiskSummary({
  staleCount,
  consistencyCount,
  loading,
}: {
  staleCount: number
  consistencyCount: number
  loading: boolean
}) {
  const total = staleCount + consistencyCount
  return (
    <section className="mb-4 rounded border bg-[var(--bg-surface)] px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="m-0 text-[14px] font-semibold text-1">{t('governance.risk.title', '语义一致性风险')}</h2>
          <p className="m-0 mt-1 text-[12px] text-3">{t('governance.risk.subtitle', '聚合 Mapper stale-check 与 consistency-report，作为发布前风险入口。')}</p>
        </div>
        <Chip tone={total > 0 ? 'warning' : 'success'}>
          {loading
            ? t('governance.risk.checking', '检查中')
            : total > 0
              ? t('governance.risk.attentionCount', '{count} 项需关注', { count: total })
              : t('governance.risk.noBlocker', '无阻断风险')}
        </Chip>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <RiskStat label={t('governance.risk.staleProjection', 'Stale 投影')} value={staleCount} />
        <RiskStat label={t('governance.risk.consistencyIssue', '一致性问题')} value={consistencyCount} />
      </div>
    </section>
  )
}

function RiskStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-[var(--bg-surface-2)] px-3 py-2">
      <div className="text-[11px] text-3">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-1">{value}</div>
    </div>
  )
}

function PolicyTable({
  items,
  loading,
  error,
}: {
  items: PolicyMetadata[]
  loading: boolean
  error: boolean
}) {
  if (loading) return <div className="py-8 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
  if (error) return <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
  if (!items.length) return <div className="py-8 text-center text-sm text-3">{t('governance.policy.empty', '尚无数据策略')}</div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <Th>{t('col.name', '名称')}</Th>
          <Th>{t('governance.policy.targetType', '目标类型')}</Th>
          <Th>{t('governance.policy.targetName', '目标名称')}</Th>
          <Th>{t('governance.policy.visibility', '可见性')}</Th>
          <Th>{t('col.status', '状态')}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.name} className="transition hover:bg-hover">
            <Td>
              <div className="font-medium text-1">{p.name}</div>
            </Td>
            <Td><Chip tone="neutral">{p.target_type}</Chip></Td>
            <Td>
              <span className="font-mono text-xs">{p.target_name}</span>
            </Td>
            <Td>{p.visibility ?? '—'}</Td>
            <Td>
              {p.status === 'active' ? (
                <Chip tone="success">{t('status.active', '已发布')}</Chip>
              ) : (
                <Chip tone="neutral">{t('status.draft', '草稿')}</Chip>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GlossaryTable({
  items,
  loading,
  error,
}: {
  items: GlossaryEntry[]
  loading: boolean
  error: boolean
}) {
  if (loading) return <div className="py-8 text-center text-sm text-3">{t('common.loading', '加载中…')}</div>
  if (error) return <div className="py-8 text-center text-sm text-danger">{t('error.loadFailed', '加载失败')}</div>
  if (!items.length) return <div className="py-8 text-center text-sm text-3">{t('governance.glossary.empty', '尚无业务术语')}</div>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <Th>{t('governance.glossary.term', '术语')}</Th>
          <Th>{t('governance.glossary.definition', '定义')}</Th>
          <Th>{t('governance.glossary.entryType', '术语类型')}</Th>
          <Th>{t('governance.glossary.aliases', '别名')}</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((g) => (
          <tr key={g.canonical_name} className="transition hover:bg-hover">
            <Td>
              <div className="font-semibold text-1">{g.title || g.canonical_name}</div>
              <div className="font-mono text-xs text-3">{g.canonical_name}</div>
            </Td>
            <Td>
              <div className="max-w-xs text-2 line-clamp-2">{g.description ?? '—'}</div>
            </Td>
            <Td>{g.entry_type ?? '—'}</Td>
            <Td>
              {g.aliases?.length
                ? g.aliases.map((s) => (
                    <Chip key={s} tone="neutral" className="mr-1">
                      {s}
                    </Chip>
                  ))
                : '—'}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-medium text-3">{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-2">{children}</td>
}
