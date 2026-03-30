import apiClient from './client'

export interface DashboardOverviewStatBlock {
  datasource_total: number | null
  dataset_total: number | null
  semantic_model_total: number | null
  today_query_count: number | null
  ai_chat_count: number | null
}

export interface DashboardOverviewRecentQuery {
  id: number | null
  name: string
  datasource_name: string | null
  executed_at: string | null
  status: 'success' | 'failed' | 'timeout' | 'queued' | 'running'
}

export interface DashboardOverviewHealthBlock {
  datasource_connectivity: number | null
  semantic_coverage: number | null
  query_success_rate: number | null
}

export interface DashboardOverviewTrendBlock {
  datasource_month_delta: number | null
  dataset_week_delta: number | null
  query_count_week: number | null
}

export interface DashboardOverviewResponse {
  stats: DashboardOverviewStatBlock
  recent_queries: DashboardOverviewRecentQuery[]
  health: DashboardOverviewHealthBlock
  trends: DashboardOverviewTrendBlock
}

export const getDashboardOverview = async (): Promise<DashboardOverviewResponse> => {
  const response = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview')
  return response.data
}
