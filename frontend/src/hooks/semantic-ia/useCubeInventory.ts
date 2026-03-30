import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listCubes, listViews } from '@/api/semantic'
import {
  buildCubeViewCountMap,
  mapCubeSummaryToSemanticObject,
  type SemanticObjectSummary,
} from '@/lib/semantic-ia'

/**
 * Cube 管理页数据源：与 CubeList 共用 queryKey，避免重复请求。
 */
export function useCubeInventory() {
  const query = useQuery({
    queryKey: ['semantic', 'cube-workbench-summary'],
    queryFn: async () => {
      const [cubesRes, viewsRes] = await Promise.all([listCubes(), listViews()])
      return {
        cubes: cubesRes.data.cubes ?? [],
        views: viewsRes.data.views ?? [],
      }
    },
  })

  const cubes = query.data?.cubes ?? []
  const views = query.data?.views ?? []

  const cubeViewCountMap = useMemo(() => buildCubeViewCountMap(views), [views])

  const inventory: SemanticObjectSummary[] = useMemo(
    () =>
      cubes.map((c) =>
        mapCubeSummaryToSemanticObject(c, { linkedViewCount: cubeViewCountMap[c.name] ?? 0 }),
      ),
    [cubes, cubeViewCountMap],
  )

  return {
    ...query,
    cubes,
    views,
    cubeViewCountMap,
    inventory,
  }
}
