import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { describeCube, type CubeDetail } from '@/api/semantic'
import {
  getCubeRowPriority,
  matchesCubeDomain,
  matchesCubeFocus,
  matchesCubeQuery,
  matchesCubeStatus,
  matchesCubeType,
  type CubeDomainFilter,
  type CubeFocusFilter,
  type CubeSortOption,
  type CubeStatusFilter,
  type CubeTypeFilter,
} from '@/components/Semantic/CubeList/cubeListUtils'
import { useCubeInventory } from './useCubeInventory'

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

export interface UseCubeListParams {
  query: string
  page: string
  pageSize: string
  focus: CubeFocusFilter
  status: CubeStatusFilter
  cubeType: CubeTypeFilter
  domain: CubeDomainFilter
  sort: CubeSortOption
  selectedName: string
  setPage: (value: string) => void
  setSelectedName: (value: string) => void
}

/**
 * Cube 管理页：筛选、分页、选中行与详情面板 query（与 CubeList 共用 cube-workbench-summary）。
 */
export function useCubeList(params: UseCubeListParams) {
  const {
    query,
    page,
    pageSize,
    focus,
    status,
    cubeType,
    domain,
    sort,
    selectedName,
    setPage,
    setSelectedName,
  } = params

  const pageNumber = parsePositiveInt(page, 1)
  const pageSizeNumber = parsePositiveInt(pageSize, 10)
  const trimmedQuery = query.trim().toLowerCase()

  const {
    cubes: summaryCubes,
    cubeViewCountMap,
    isLoading,
  } = useCubeInventory()

  const filteredCubes = useMemo(() => {
    return [...summaryCubes]
      .filter((item) => matchesCubeQuery(item, trimmedQuery))
      .filter((item) => matchesCubeFocus(item, focus))
      .filter((item) => matchesCubeStatus(item, status))
      .filter((item) => matchesCubeType(item, cubeType))
      .filter((item) => matchesCubeDomain(item, domain))
      .sort((left, right) => {
        if (sort === 'priority') {
          const priorityDiff = getCubeRowPriority(left) - getCubeRowPriority(right)
          if (priorityDiff !== 0) return priorityDiff
        }
        const leftTime = left.state_summary?.updated_at ? new Date(left.state_summary.updated_at).getTime() : 0
        const rightTime = right.state_summary?.updated_at ? new Date(right.state_summary.updated_at).getTime() : 0
        if (sort === 'updated_desc' || sort === 'priority') {
          if (rightTime !== leftTime) return rightTime - leftTime
        }
        if (sort === 'name_asc') {
          return (left.title || left.name).localeCompare((right.title || right.name), 'zh-CN')
        }
        return rightTime - leftTime
      })
  }, [summaryCubes, trimmedQuery, focus, status, cubeType, domain, sort])

  const contextSummary = useMemo(() => {
    const validationFailed = summaryCubes.filter((item) => {
      const syncStatus = (item.state_summary?.sync_status || item.sync_status || '').toLowerCase()
      return syncStatus === 'error'
    }).length
    const published = summaryCubes.filter((item) => (item.status || '').toLowerCase() === 'active').length
    const draft = summaryCubes.filter((item) => (item.status || '').toLowerCase() === 'draft').length

    return {
      total: summaryCubes.length,
      published,
      draft,
      validationFailed,
    }
  }, [summaryCubes])

  const total = filteredCubes.length
  const pageCount = Math.max(1, Math.ceil(total / pageSizeNumber))

  useEffect(() => {
    if (pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  const currentCubes = useMemo(() => {
    const start = (pageNumber - 1) * pageSizeNumber
    return filteredCubes.slice(start, start + pageSizeNumber).map((item) => ({
      ...item,
      view_count: cubeViewCountMap[item.name] ?? 0,
    }))
  }, [filteredCubes, pageNumber, pageSizeNumber, cubeViewCountMap])

  useEffect(() => {
    const currentItems = currentCubes
    if (!currentItems.length) {
      if (selectedName) setSelectedName('')
      return
    }
    if (selectedName && !currentItems.some((item) => item.name === selectedName)) {
      setSelectedName('')
    }
  }, [currentCubes, selectedName, setSelectedName])

  const selectedCube = useMemo(
    () => currentCubes.find((item) => item.name === selectedName) ?? null,
    [currentCubes, selectedName],
  )

  const cubeDetailQuery = useQuery({
    queryKey: ['semantic', 'cube-detail-pane', selectedCube?.name],
    queryFn: async () => (await describeCube(selectedCube!.name)).data as CubeDetail,
    enabled: !!selectedCube?.name,
  })

  return {
    isLoading,
    trimmedQuery,
    pageNumber,
    pageSizeNumber,
    total,
    pageCount,
    currentCubes,
    selectedCube,
    cubeDetail: cubeDetailQuery.data,
    cubeDetailLoading: cubeDetailQuery.isLoading,
    contextSummary,
  }
}
