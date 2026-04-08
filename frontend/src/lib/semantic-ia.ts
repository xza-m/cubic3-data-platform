/**
 * 语义中心 IA 统一数据形状：列表/治理/画布/工作台上下文。
 * 与 @/api/semantic 类型组合使用，避免在各页重复推导 flags。
 */
import type {
  CubeDetail,
  CubeSummary,
  DomainCanvasData,
  DomainCatalogSummary,
  DomainSummary,
  ViewSummary,
} from '@/api/semantic'
import { isCubeInDomain, isCubeSourceBound } from '@/components/Semantic/CubeList/cubeListUtils'

export type SemanticObjectKind = 'cube' | 'view' | 'domain' | 'catalog'

export type SemanticLifecycle = 'draft' | 'active' | 'deprecated' | 'archived' | 'unknown'

export interface SemanticObjectFlags {
  validationFailed?: boolean
  unbound?: boolean
  outsideDomain?: boolean
  pendingPublish?: boolean
  drift?: boolean
  deprecated?: boolean
}

export interface SemanticObjectSummary {
  kind: SemanticObjectKind
  code: string
  displayName: string
  status: string
  lifecycle: SemanticLifecycle
  updatedAt?: string | null
  flags: SemanticObjectFlags
  refs?: {
    domainId?: string | null
    domainName?: string | null
    catalogCode?: string | null
  }
  metrics?: {
    dimensionCount?: number
    measureCount?: number
    cubeCount?: number
    joinCount?: number
    linkedViewCount?: number
  }
}

export interface CatalogGovernanceSlice {
  code: string
  name: string
  domainCount: number
  activeCount: number
  draftCount: number
}

export interface SemanticGovernanceState {
  catalogs: CatalogGovernanceSlice[]
  domainObjects: SemanticObjectSummary[]
  totals: {
    catalogCount: number
    domainCount: number
    emptyCatalogCount: number
    draftDomains: number
    activeDomains: number
    domainsWithJoinGaps: number
  }
}

export interface SemanticStructureSummary {
  domainCode: string
  domainName: string
  domainStatus: string
  nodeCount: number
  edgeCount: number
  libraryCubeCount: number
}

export type SemanticModuleKey =
  | 'overview'
  | 'cubes'
  | 'cubeStudio'
  | 'domains'
  | 'modeling'
  | 'canvas'
  | 'devtools'

export interface WorkbenchContextItem {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'warning'
}

export interface WorkbenchContext {
  module: SemanticModuleKey
  title: string
  subtitle?: string
  items: WorkbenchContextItem[]
}

export type DomainGovernanceLens = 'all' | 'empty' | 'draft' | 'join_gap'

export function normalizeLifecycle(status?: string | null): SemanticLifecycle {
  const s = (status || '').toLowerCase()
  if (s === 'draft') return 'draft'
  if (s === 'active') return 'active'
  if (s === 'deprecated') return 'deprecated'
  if (s === 'archived') return 'archived'
  return 'unknown'
}

function driftFlagFromState(lastDrift?: string | null): boolean {
  const d = (lastDrift || '').toLowerCase()
  return Boolean(d && d !== 'ok' && d !== 'none' && d !== 'synced')
}

export function mapCubeSummaryToSemanticObject(
  cube: CubeSummary,
  opts?: { linkedViewCount?: number },
): SemanticObjectSummary {
  const bound = isCubeSourceBound(cube)
  const inDomain = isCubeInDomain(cube)
  const st = (cube.status || '').toLowerCase()
  const sync = (cube.state_summary?.sync_status || cube.sync_status || '').toLowerCase()
  return {
    kind: 'cube',
    code: cube.name,
    displayName: cube.title?.trim() || cube.name,
    status: cube.status || 'unknown',
    lifecycle: normalizeLifecycle(cube.status),
    updatedAt: cube.state_summary?.updated_at ?? null,
    flags: {
      validationFailed: sync === 'error',
      unbound: !bound,
      outsideDomain: !inDomain,
      pendingPublish: st === 'draft',
      drift: driftFlagFromState(cube.state_summary?.last_drift_status ?? null),
      deprecated: st === 'deprecated',
    },
    refs: {
      domainId: cube.domain_id ?? null,
      domainName: cube.domain_name ?? null,
    },
    metrics: {
      dimensionCount: cube.dimension_count,
      measureCount: cube.measure_count,
      linkedViewCount: opts?.linkedViewCount,
    },
  }
}

export function mapCubeDetailToSemanticObject(detail: CubeDetail): SemanticObjectSummary {
  const summary: CubeSummary = {
    name: detail.name,
    title: detail.title,
    description: detail.description,
    table: detail.table,
    in_domain: Boolean(detail.domain_id || detail.domain_name),
    domain_id: detail.domain_id,
    domain_name: detail.domain_name,
    domain_ids: detail.domain_ids,
    domains: detail.domains,
    domain_count: detail.domain_count,
    status: detail.status,
    source_id: detail.source_id,
    source_database: detail.source_database,
    source_schema: detail.source_schema,
    dimensions: Object.keys(detail.dimensions || {}),
    measures: Object.keys(detail.measures || {}),
    dimension_count: Object.keys(detail.dimensions || {}).length,
    measure_count: Object.keys(detail.measures || {}).length,
    join_count: Object.keys(detail.joins || {}).length,
    state_summary: detail.state_summary,
  }
  const diagFailed = Array.isArray(detail.diagnostics)
    && detail.diagnostics.some((d) => (d.level || '').toLowerCase() === 'error')
  const base = mapCubeSummaryToSemanticObject(summary)
  return {
    ...base,
    flags: {
      ...base.flags,
      validationFailed: Boolean(base.flags.validationFailed || diagFailed),
    },
  }
}

export function mapViewSummaryToSemanticObject(view: ViewSummary): SemanticObjectSummary {
  return {
    kind: 'view',
    code: view.name,
    displayName: view.title?.trim() || view.name,
    status: view.public ? 'public' : 'private',
    lifecycle: 'active',
    updatedAt: null,
    flags: {},
    metrics: {
      cubeCount: view.cube_count,
    },
  }
}

export function mapDomainSummaryToSemanticObject(domain: DomainSummary): SemanticObjectSummary {
  const st = (domain.status || '').toLowerCase()
  return {
    kind: 'domain',
    code: String(domain.id || domain.code),
    displayName: domain.name,
    status: domain.status || 'unknown',
    lifecycle: normalizeLifecycle(domain.status),
    updatedAt: domain.state_summary?.updated_at ?? null,
    flags: {
      pendingPublish: st === 'draft',
    },
    refs: {
      domainId: domain.id ?? null,
      domainName: domain.name,
      catalogCode: domain.catalog_code ?? null,
    },
    metrics: {
      cubeCount: domain.cube_count,
      joinCount: domain.join_count,
    },
  }
}

export function mapCatalogSummaryToSemanticObject(catalog: DomainCatalogSummary): SemanticObjectSummary {
  return {
    kind: 'catalog',
    code: catalog.code,
    displayName: catalog.name,
    status: catalog.status || 'unknown',
    lifecycle: normalizeLifecycle(catalog.status),
    updatedAt: null,
    flags: {},
    metrics: {
      cubeCount: catalog.domain_count,
    },
  }
}

export function buildCubeViewCountMap(views: ViewSummary[]): Record<string, number> {
  const next: Record<string, number> = {}
  views.forEach((view) => {
    const cubeNames = view.cubes ?? []
    cubeNames.forEach((cubeName) => {
      next[cubeName] = (next[cubeName] ?? 0) + 1
    })
  })
  return next
}

export function buildSemanticGovernanceState(
  catalogs: DomainCatalogSummary[],
  domains: DomainSummary[],
): SemanticGovernanceState {
  const catalogSlices: CatalogGovernanceSlice[] = catalogs.map((c) => ({
    code: c.code,
    name: c.name,
    domainCount: c.domain_count,
    activeCount: c.active_count,
    draftCount: c.draft_count,
  }))
  const domainObjects = domains.map(mapDomainSummaryToSemanticObject)
  const emptyCatalogCount = catalogs.filter((c) => (c.domain_count ?? 0) === 0).length
  const draftDomains = domains.filter((d) => (d.status || '').toLowerCase() === 'draft').length
  const activeDomains = domains.filter((d) => (d.status || '').toLowerCase() === 'active').length
  const domainsWithJoinGaps = domains.filter(
    (d) => (d.cube_count ?? 0) >= 2 && (d.join_count ?? 0) === 0,
  ).length

  return {
    catalogs: catalogSlices,
    domainObjects,
    totals: {
      catalogCount: catalogs.length,
      domainCount: domains.length,
      emptyCatalogCount,
      draftDomains,
      activeDomains,
      domainsWithJoinGaps,
    },
  }
}

export function mapCanvasDataToStructureSummary(data: DomainCanvasData): SemanticStructureSummary {
  return {
    domainCode: data.domain.code,
    domainName: data.domain.name,
    domainStatus: data.domain.status,
    nodeCount: data.nodes.length,
    edgeCount: data.edges.length,
    libraryCubeCount: data.library_cubes.length,
  }
}

export function matchesDomainGovernanceLens(domain: DomainSummary, lens: DomainGovernanceLens) {
  if (lens === 'all') return true
  if (lens === 'empty') return (domain.cube_count ?? 0) === 0
  if (lens === 'draft') return (domain.status || '').toLowerCase() !== 'active'
  return (domain.cube_count ?? 0) > 1 && (domain.join_count ?? 0) === 0
}

export function getDomainGovernanceLensLabel(lens: DomainGovernanceLens) {
  switch (lens) {
    case 'empty':
      return '空领域'
    case 'draft':
      return '草稿积压'
    case 'join_gap':
      return 'Join 缺失'
    case 'all':
    default:
      return '全部'
  }
}
