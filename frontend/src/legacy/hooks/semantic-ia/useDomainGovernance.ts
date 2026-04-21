import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listDomainCatalogs, listDomains } from '@/api/semantic'
import {
  buildSemanticGovernanceState,
  getDomainGovernanceLensLabel,
  matchesDomainGovernanceLens,
  type DomainGovernanceLens,
  type SemanticGovernanceState,
} from '@/lib/semantic-ia'

export interface UseDomainGovernanceOptions {
  catalogCode?: string
  search?: string
  page?: number
  pageSize?: number
  lens?: DomainGovernanceLens
}

/**
 * 领域目录 / 建模入口：目录 + 全量领域列表（与 DomainModelingEntry 等共用 queryKey）。
 */
export function useDomainGovernance(options?: UseDomainGovernanceOptions) {
  const trimmedSearch = options?.search?.trim() ?? ''

  const catalogsQuery = useQuery({
    queryKey: ['semantic', 'catalogs'],
    queryFn: async () => (await listDomainCatalogs()).data,
  })

  const effectiveCatalogCode = useMemo(() => {
    if (!options) return undefined
    if (options.catalogCode) return options.catalogCode
    return catalogsQuery.data?.catalogs?.[0]?.code
  }, [catalogsQuery.data?.catalogs, options])

  const queryOptions = useMemo(() => {
    if (!options) return undefined
    return {
      catalog_code: effectiveCatalogCode || undefined,
      q: trimmedSearch || undefined,
      page: options.page,
      page_size: options.pageSize,
    }
  }, [effectiveCatalogCode, options, trimmedSearch])

  const domainsQuery = useQuery({
    queryKey: queryOptions
      ? ['semantic', 'domains', queryOptions]
      : ['semantic', 'domains'],
    queryFn: async () => (await listDomains(queryOptions)).data,
    enabled: options ? !catalogsQuery.isLoading : true,
  })

  const catalogs = catalogsQuery.data?.catalogs ?? []
  const domains = domainsQuery.data?.domains ?? []
  const lens = options?.lens ?? 'all'
  const activeCatalog = useMemo(() => {
    if (!catalogs.length) return null
    if (!options?.catalogCode) return catalogs[0]
    return catalogs.find((catalog) => catalog.code === options.catalogCode) ?? catalogs[0]
  }, [catalogs, options?.catalogCode])

  const governance: SemanticGovernanceState = useMemo(
    () => buildSemanticGovernanceState(catalogs, domains),
    [catalogs, domains],
  )

  const filteredDomains = useMemo(
    () => domains.filter((domain) => matchesDomainGovernanceLens(domain, lens)),
    [domains, lens],
  )

  const totalDomains = domainsQuery.data?.total ?? domains.length
  const pageCount = domainsQuery.data?.page_count ?? 0
  const currentPage = domainsQuery.data?.page ?? options?.page ?? 1
  const pageSize = domainsQuery.data?.page_size ?? options?.pageSize ?? domains.length
  const lensLabel = getDomainGovernanceLensLabel(lens)

  return {
    catalogsQuery,
    domainsQuery,
    catalogs,
    domains,
    activeCatalog,
    governance,
    filteredDomains,
    totalDomains,
    pageCount,
    currentPage,
    pageSize,
    lens,
    lensLabel,
    isLoading: catalogsQuery.isLoading || domainsQuery.isLoading,
    isFetching: catalogsQuery.isFetching || domainsQuery.isFetching,
    refetchAll: () =>
      Promise.all([catalogsQuery.refetch(), domainsQuery.refetch()]) as Promise<
        [unknown, unknown]
      >,
  }
}
