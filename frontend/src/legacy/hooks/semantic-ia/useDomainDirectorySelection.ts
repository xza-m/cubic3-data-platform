import { useEffect, useMemo } from 'react'
import type { DomainSummary } from '@/api/semantic'
import type { DomainCatalogSummary } from '@/api/semantic'
import { domainDirectoryKey } from '@/lib/domain-directory'

export interface UseDomainDirectorySelectionParams {
  catalogs: DomainCatalogSummary[]
  activeCatalogCode: string
  setActiveCatalogCode: (value: string) => void
  filteredDomains: DomainSummary[]
  selectedDomainKey: string
  setSelectedDomainKey: (value: string) => void
  pageNumber: number
  pageCount: number
  setPage: (value: string) => void
}

/**
 * 领域目录页：目录默认、分页回卷、选中行与右侧面板模式同步（URL 状态由页面写入）。
 */
export function useDomainDirectorySelection(params: UseDomainDirectorySelectionParams) {
  const {
    catalogs,
    activeCatalogCode,
    setActiveCatalogCode,
    filteredDomains,
    selectedDomainKey,
    setSelectedDomainKey,
    pageNumber,
    pageCount,
    setPage,
  } = params

  useEffect(() => {
    if (!catalogs.length) return
    if (!activeCatalogCode || !catalogs.some((catalog) => catalog.code === activeCatalogCode)) {
      setActiveCatalogCode(catalogs[0].code)
    }
  }, [activeCatalogCode, catalogs, setActiveCatalogCode])

  const selectedDomain = useMemo(() => {
    if (!filteredDomains.length || !selectedDomainKey) return null
    return filteredDomains.find((domain) => domainDirectoryKey(domain) === selectedDomainKey) ?? null
  }, [filteredDomains, selectedDomainKey])

  useEffect(() => {
    if (pageCount > 0 && pageNumber > pageCount) {
      setPage(String(pageCount))
    }
  }, [pageCount, pageNumber, setPage])

  useEffect(() => {
    if (!filteredDomains.length) {
      if (selectedDomainKey) {
        setSelectedDomainKey('')
      }
      return
    }
    if (selectedDomainKey && !filteredDomains.some((domain) => domainDirectoryKey(domain) === selectedDomainKey)) {
      setSelectedDomainKey('')
    }
  }, [filteredDomains, selectedDomainKey, setSelectedDomainKey])

  return { selectedDomain }
}
