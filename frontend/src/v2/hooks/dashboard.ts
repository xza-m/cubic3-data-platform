import { useQuery } from '@tanstack/react-query'
import { getDashboardOverview } from '@v2/api/dashboard'
import { qk } from './query-client'

export function useDashboardOverview() {
  return useQuery({
    queryKey: qk('dashboard', 'overview'),
    queryFn: getDashboardOverview,
  })
}
