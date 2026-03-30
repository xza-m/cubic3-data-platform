import type { CubeDetail, CubeSummary, MaterializeStatus, ViewSummary } from '@/api/semantic'
import { getSemanticStatusLabel } from '@/lib/semantic-status'

export type CubeFocusFilter = 'all' | 'attention' | 'unbound' | 'undomained' | 'recent'
export type CubeStatusFilter = 'all' | 'draft' | 'active' | 'deprecated'
export type CubeTypeFilter = 'all' | 'fact' | 'dimension'
export type CubeDomainFilter = 'all' | 'in_domain' | 'out_domain' | 'assigned' | 'unassigned'
export type CubeSortOption = 'priority' | 'updated_desc' | 'name_asc'

export function inferCubeCategory(item: CubeSummary) {
  if (item.type === 'dimension') return '维度模型'
  if (item.type === 'fact') return '事实模型'
  return item.measure_count > 2 ? '事实模型' : '维度模型'
}

export function formatSummaryTime(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

export function isCubeSourceBound(item: CubeSummary) {
  return Boolean(
    item.state_summary?.source_binding_summary?.source_id
    || item.state_summary?.source_binding_summary?.database
    || item.source_id
    || item.source_database,
  )
}

export function isCubeInDomain(item: CubeSummary) {
  return Boolean(item.in_domain || item.domain_id || item.domain_name)
}

export function isCubeRecentlyUpdated(item: CubeSummary) {
  const updatedAt = item.state_summary?.updated_at
  if (!updatedAt) return false
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return false
  const diffMs = Date.now() - date.getTime()
  return diffMs <= 1000 * 60 * 60 * 24 * 14
}

export function getCubeSourceLabel(item: CubeSummary) {
  const binding = item.state_summary?.source_binding_summary
  if (binding?.display) return binding.display
  if (item.source_database && item.source_schema) return `${item.source_database}.${item.source_schema}`
  if (item.source_database) return item.source_database
  return '未绑定数据源'
}

export function getCubeOwnerLabel(item: CubeSummary) {
  const owner = (item as CubeSummary & { owner?: string | null }).owner
  return owner?.trim() || '未指定'
}

export function getCubeVersionLabel(item: CubeSummary) {
  const hash = item.state_summary?.definition_hash?.trim()
  if (hash) return `#${hash.slice(0, 8)}`
  return (item.status || '').toLowerCase() === 'draft' ? '草稿' : '已发布'
}

export function getCubeViewCountLabel(item: CubeSummary & { view_count?: number | null }) {
  const count = item.view_count
  if (typeof count === 'number' && Number.isFinite(count)) {
    return `${count} 个`
  }
  return '0 个'
}

export function getCubePublishLabel(item: CubeSummary) {
  const status = item.state_summary?.publish_status
  if (!status) {
    return item.status === 'active' ? '已发布' : '待发布'
  }
  switch (status.toLowerCase()) {
    case 'published':
    case 'active':
    case 'ok':
      return '已发布'
    case 'draft':
    case 'pending':
      return '待发布'
    case 'error':
    case 'failed':
      return '发布失败'
    default:
      return status
  }
}

export function getCubeSyncLabel(item: CubeSummary) {
  const syncStatus = item.state_summary?.sync_status || item.sync_status
  switch ((syncStatus || '').toLowerCase()) {
    case 'ok':
      return '已同步'
    case 'warn':
      return '待检查'
    case 'error':
      return '同步异常'
    default:
      return '未检查'
  }
}

export function getCubeAttentionReasons(item: CubeSummary) {
  const reasons: string[] = []

  if (!isCubeSourceBound(item)) {
    reasons.push('未绑定数据源')
  }
  if (!isCubeInDomain(item)) {
    reasons.push('未纳入领域')
  }
  if ((item.status || '').toLowerCase() === 'draft') {
    reasons.push('待发布')
  }
  const syncStatus = (item.state_summary?.sync_status || item.sync_status || '').toLowerCase()
  if (syncStatus === 'warn') {
    reasons.push('待检查')
  }
  if (syncStatus === 'error') {
    reasons.push('同步异常')
  }

  return reasons
}

export function getCubeRowPriority(item: CubeSummary) {
  const syncStatus = (item.state_summary?.sync_status || item.sync_status || '').toLowerCase()
  if (syncStatus === 'error') return 0
  if (!isCubeSourceBound(item)) return 1
  if (!isCubeInDomain(item)) return 2
  if ((item.status || '').toLowerCase() === 'draft') return 3
  if (syncStatus === 'warn') return 4
  if (isCubeRecentlyUpdated(item)) return 5
  return 9
}

export function getCubeRailTone(item: CubeSummary) {
  const syncStatus = (item.state_summary?.sync_status || item.sync_status || '').toLowerCase()
  if (syncStatus === 'error') return 'bg-[hsl(var(--semantic-error))]'
  if (!isCubeSourceBound(item) || !isCubeInDomain(item)) return 'bg-[hsl(var(--semantic-warn))]'
  if ((item.status || '').toLowerCase() === 'draft' || syncStatus === 'warn') {
    return 'bg-[hsl(var(--workbench-accent))]'
  }
  return 'bg-[hsl(var(--workbench-outline))]'
}

export function matchesCubeFocus(item: CubeSummary, focus: CubeFocusFilter) {
  switch (focus) {
    case 'attention':
      return getCubeAttentionReasons(item).length > 0
    case 'unbound':
      return !isCubeSourceBound(item)
    case 'undomained':
      return !isCubeInDomain(item)
    case 'recent':
      return isCubeRecentlyUpdated(item)
    default:
      return true
  }
}

export function matchesCubeStatus(item: CubeSummary, status: CubeStatusFilter) {
  if (status === 'all') return true
  return (item.status || '').toLowerCase() === status
}

export function matchesCubeType(item: CubeSummary, type: CubeTypeFilter) {
  if (type === 'all') return true
  const inferredType = item.type || (inferCubeCategory(item) === '事实模型' ? 'fact' : 'dimension')
  return inferredType === type
}

export function matchesCubeDomain(item: CubeSummary, domain: CubeDomainFilter) {
  if (domain === 'all') return true
  return domain === 'in_domain' || domain === 'assigned'
    ? isCubeInDomain(item)
    : !isCubeInDomain(item)
}

export function matchesCubeQuery(item: CubeSummary, query: string) {
  if (!query) return true
  const value = query.toLowerCase()
  return [
    item.name,
    item.title,
    item.description,
    item.domain_name,
    getCubeSourceLabel(item),
  ]
    .filter(Boolean)
    .some((entry) => String(entry).toLowerCase().includes(value))
}

export function matchesViewQuery(item: ViewSummary, query: string) {
  if (!query) return true
  const value = query.toLowerCase()
  return [item.name, item.title, item.description]
    .filter(Boolean)
    .some((entry) => String(entry).toLowerCase().includes(value))
}

export function getViewPublishLabel(item: ViewSummary, status?: MaterializeStatus) {
  if (status?.materialized) return '已发布'
  return item.public ? '公开待发布' : '私有待发布'
}

export function buildCubePreviewActions(item: CubeSummary | CubeDetail | null) {
  if (!item) return []
  return [
    {
      label: '编辑定义',
      href: `/semantic/cubes/${item.name}/edit`,
    },
  ]
}

export function getCubePrimaryStatus(item: CubeSummary | CubeDetail) {
  return getSemanticStatusLabel(item.status || 'draft')
}
