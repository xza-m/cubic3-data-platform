import { describe, expect, it, vi } from 'vitest'
import apiClient from './client'
import { getDashboardOverview } from './dashboard'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('dashboard api', () => {
  it('请求 dashboard overview 并返回 data 字段', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        stats: {
          datasource_total: 2,
          dataset_total: 4,
          semantic_model_total: 1,
          today_query_count: 10,
          ai_chat_count: 3,
        },
        recent_queries: [],
        health: {
          datasource_connectivity: 100,
          semantic_coverage: 80,
          query_success_rate: 95,
        },
        trends: {
          datasource_month_delta: 1,
          dataset_week_delta: 2,
          query_count_week: 18,
        },
      },
    })

    const result = await getDashboardOverview()

    expect(apiClient.get).toHaveBeenCalledWith('/dashboard/overview')
    expect(result.stats.datasource_total).toBe(2)
    expect(result.health.semantic_coverage).toBe(80)
  })
})
