import type { DomainSummary } from '@/api/semantic'

export type DomainCatalogHealthSource = {
  name: string
  domain_count: number
  draft_count: number
  active_count: number
}

export function domainDirectoryKey(domain?: DomainSummary | null) {
  return domain ? String(domain.id || domain.code) : ''
}

export function formatDomainDirectoryTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

export function domainDirectoryStatusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'draft') return 'secondary' as const
  return 'outline' as const
}

export function getDomainDirectoryGovernanceLabel(domain: DomainSummary) {
  if (domain.cube_count === 0) {
    return { label: '空领域', tone: 'warning' as const }
  }
  if (domain.cube_count > 1 && domain.join_count === 0) {
    return { label: 'Join 缺失', tone: 'warning' as const }
  }
  if (domain.status !== 'active') {
    return { label: '待发布', tone: 'default' as const }
  }
  return { label: '已发布', tone: 'accent' as const }
}

export function getDomainDirectoryHealth(domain?: DomainSummary | null) {
  if (!domain) {
    return {
      tone: 'neutral',
      title: '当前未选择领域',
      description: '显示所选领域的状态、规模和治理信息。',
    }
  }
  if (domain.cube_count === 0) {
    return {
      tone: 'warn',
      title: '当前领域尚未纳入 Cube',
      description: '显示领域边界和纳入状态。',
    }
  }
  if (domain.join_count === 0 && domain.cube_count > 1) {
    return {
      tone: 'warn',
      title: '当前领域缺少 Join',
      description: '显示关联关系和发布状态。',
    }
  }
  if (domain.status !== 'active') {
    return {
      tone: 'neutral',
      title: '当前领域为草稿',
      description: '显示领域规模、关系和发布状态。',
    }
  }
  return {
    tone: 'ok',
    title: '当前领域已发布',
    description: '显示领域规模、关系和说明。',
  }
}

export function getDomainCatalogHealth(
  catalog?: DomainCatalogHealthSource | null,
  domains: DomainSummary[] = [],
) {
  if (!catalog) {
    return {
      tone: 'neutral',
      title: '当前未选择目录',
      description: '显示目录内领域的治理状态。',
    }
  }
  const emptyCount = domains.filter((domain) => domain.cube_count === 0).length
  const joinGapCount = domains.filter((domain) => domain.cube_count > 1 && domain.join_count === 0).length
  if (catalog.domain_count === 0) {
    return {
      tone: 'warn',
      title: '当前目录为空',
      description: '显示目录规模和领域归属。',
    }
  }
  if (catalog.draft_count > 0) {
    return {
      tone: 'warn',
      title: '目录内仍有草稿积压',
      description: `显示当前目录内 ${catalog.draft_count} 个草稿领域和已发布领域。`,
    }
  }
  if (emptyCount > 0 || joinGapCount > 0) {
    return {
      tone: 'neutral',
      title: '目录治理仍需收口',
      description: `显示空领域 ${emptyCount} 个和 Join 缺失 ${joinGapCount} 个。`,
    }
  }
  return {
    tone: 'ok',
    title: '目录结构已经稳定',
    description: '显示目录规模、发布状态和治理摘要。',
  }
}

export function buildDomainListContextBarItems(params: {
  activeCatalogName?: string | null
  totalDomains: number
  draftCount: number
  lensLabel: string
  lensIsAll: boolean
  pageNumber: number
  pageCount: number
}) {
  const safePage = Math.max(params.pageNumber, 1)
  const safeCount = Math.max(params.pageCount, 1)
  return [
    { label: '当前目录', value: params.activeCatalogName || '未选择', tone: 'default' as const },
    { label: '领域数', value: params.totalDomains, tone: 'default' as const },
    {
      label: '草稿数',
      value: params.draftCount,
      tone: params.draftCount ? 'warning' as const : 'default' as const,
    },
    {
      label: '治理透镜',
      value: params.lensLabel,
      tone: params.lensIsAll ? 'default' as const : 'accent' as const,
    },
    { label: '当前页', value: `${safePage} / ${safeCount}`, tone: 'default' as const },
  ]
}
