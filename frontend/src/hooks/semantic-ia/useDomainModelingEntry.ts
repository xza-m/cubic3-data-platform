import { useMemo } from 'react'
import type { DomainSummary } from '@/api/semantic'
import { useDomainGovernance } from './useDomainGovernance'

function sortDomainsByRecent(domains: DomainSummary[]) {
  return [...domains].sort((a, b) => {
    const at = Date.parse(a.state_summary?.updated_at || a.state_summary?.last_published_at || '') || 0
    const bt = Date.parse(b.state_summary?.updated_at || b.state_summary?.last_published_at || '') || 0
    return bt - at
  })
}

/**
 * 领域建模入口：草稿/已发布短列表与上下文条数据（与 DomainModelingEntry 共用 query）。
 */
export function useDomainModelingEntry() {
  const { catalogs, domains, governance, isLoading } = useDomainGovernance()

  const draftDomains = useMemo(
    () => sortDomainsByRecent(domains.filter((domain) => domain.status === 'draft')).slice(0, 6),
    [domains],
  )
  const publishedDomains = useMemo(
    () => sortDomainsByRecent(domains.filter((domain) => domain.status === 'active')).slice(0, 6),
    [domains],
  )

  const contextBarItems = useMemo(
    () => [
      { label: '目录数', value: catalogs.length, tone: 'default' as const },
      {
        label: '草稿领域',
        value: governance.totals.draftDomains,
        tone: governance.totals.draftDomains ? 'warning' as const : 'default' as const,
      },
      {
        label: '已发布',
        value: governance.totals.activeDomains,
        tone: governance.totals.activeDomains ? 'accent' as const : 'default' as const,
      },
      { label: '当前范围', value: '草稿领域与已发布领域', tone: 'default' as const },
    ],
    [catalogs.length, governance.totals.activeDomains, governance.totals.draftDomains],
  )

  return {
    catalogs,
    domains,
    governance,
    isLoading,
    draftDomains,
    publishedDomains,
    contextBarItems,
  }
}
