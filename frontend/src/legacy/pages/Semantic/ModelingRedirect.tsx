import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useDomainModelingEntry } from '@/hooks/semantic-ia'
import DomainModelingEntry from './DomainModelingEntry'

function ModelingRedirectSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-16 rounded-2xl" />
      <Skeleton className="h-[28rem] rounded-2xl" />
    </div>
  )
}

export default function ModelingRedirect() {
  const location = useLocation()
  const { draftDomains, publishedDomains, isLoading } = useDomainModelingEntry()

  if (isLoading) {
    return <ModelingRedirectSkeleton />
  }

  const target = draftDomains[0] ?? publishedDomains[0]

  if (!target) {
    return <DomainModelingEntry />
  }

  return (
    <Navigate
      to={{
        pathname: `/semantic/domains/${target.id || target.code}`,
        search: location.search,
      }}
      replace
    />
  )
}
