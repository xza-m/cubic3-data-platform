import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDomainCanvas } from '@/api/semantic'
import { mapCanvasDataToStructureSummary, type SemanticStructureSummary } from '@/lib/semantic-ia'

/**
 * 领域画布数据（与 DomainCanvas 共用 queryKey）。
 */
export function useDomainCanvas(domainId: string | undefined) {
  const query = useQuery({
    queryKey: ['semantic', 'domain-canvas', domainId],
    queryFn: async () => (await getDomainCanvas(domainId!)).data,
    enabled: Boolean(domainId),
  })

  const structureSummary: SemanticStructureSummary | null = useMemo(() => {
    if (!query.data) return null
    return mapCanvasDataToStructureSummary(query.data)
  }, [query.data])

  return {
    ...query,
    data: query.data,
    structureSummary,
  }
}
