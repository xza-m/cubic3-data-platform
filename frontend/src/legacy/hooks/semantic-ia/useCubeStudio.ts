import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { describeCube, listDomains } from '@/api/semantic'
import { mapCubeDetailToSemanticObject, type SemanticObjectSummary } from '@/lib/semantic-ia'

export interface UseCubeStudioOptions {
  /** 路由参数中的 cube 名称；undefined 表示新建模式 */
  cubeName?: string | null
}

/**
 * Cube Studio：详情 + 领域列表（与页面现有 queryKey 对齐）。
 */
export function useCubeStudio({ cubeName }: UseCubeStudioOptions) {
  const domainsQuery = useQuery({
    queryKey: ['semantic', 'domains'],
    queryFn: async () => (await listDomains()).data,
  })

  const detailQuery = useQuery({
    queryKey: ['semantic', 'cube', cubeName],
    queryFn: async () => (await describeCube(cubeName!)).data,
    enabled: Boolean(cubeName),
  })

  const studioObject: SemanticObjectSummary | null = useMemo(() => {
    if (!detailQuery.data) return null
    return mapCubeDetailToSemanticObject(detailQuery.data)
  }, [detailQuery.data])

  const domains = domainsQuery.data?.domains ?? []

  return {
    domainsQuery,
    detailQuery,
    domains,
    detail: detailQuery.data,
    studioObject,
    isNewMode: !cubeName,
    isLoading: domainsQuery.isLoading || (Boolean(cubeName) && detailQuery.isLoading),
  }
}
