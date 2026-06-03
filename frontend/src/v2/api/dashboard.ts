import { apiClient } from './client'

export interface DashboardStats {
  datasource_total: number | null
  dataset_total: number | null
  semantic_model_total: number | null
  today_query_count: number | null
  ai_chat_count?: number | null
}

export interface DashboardTrends {
  datasource_month_delta: number | null
  dataset_week_delta: number | null
  query_count_week: number | null
}

export interface DashboardHealth {
  datasource_connectivity: number | null
  semantic_coverage: number | null
  query_success_rate: number | null
}

export interface RecentQuery {
  id: string | number
  name: string
  datasource_name: string | null
  status: 'success' | 'failed' | 'timeout' | 'queued' | 'running' | string
  executed_at: string | null
}

export interface DashboardOverviewSources {
  datasource_total: 'data_sources'
  connected_datasource_count: 'data_sources'
  dataset_total: 'data_asset_tables' | 'datasets'
  today_query_count: 'query_histories'
  recent_queries: 'query_histories'
}

export interface DashboardOverviewResponse {
  stats: DashboardStats
  trends: DashboardTrends
  health: DashboardHealth
  recent_queries: RecentQuery[]
  sources?: Partial<DashboardOverviewSources>
}

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  const res = await apiClient.get<{ data: DashboardOverviewResponse }>('/dashboard/overview')
  return res.data.data
}
