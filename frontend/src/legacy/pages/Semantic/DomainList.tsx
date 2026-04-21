import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useDomainGovernance } from '@/hooks/semantic-ia'

function DomainListSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-[42rem] rounded-2xl" />
    </div>
  )
}

export default function DomainList() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { catalogs, domains, isLoading } = useDomainGovernance({
    page: 1,
    pageSize: 999,
    lens: 'all',
  })

  if (isLoading) {
    return <DomainListSkeleton />
  }

  const selected = searchParams.get('selected')
  const matchedDomain = catalogs
    .flatMap((catalog) => catalog.domains || [])
    .find((domain) => (domain.id || domain.code) === selected)
  const target = matchedDomain || domains[0] || catalogs[0]?.domains?.[0]

  return (
    <Navigate
      to={{
        pathname: target ? `/semantic/domains/${target.id || target.code}` : '/semantic/modeling',
        search: target ? '?panel=catalog' : location.search,
      }}
      replace
    />
  )
}
