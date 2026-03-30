export type JoinType = 'left' | 'inner' | 'right' | 'full'

export type JoinCardinality = '1:1' | 'N:1' | '1:N'

export type JoinAggregationStrategy =
  | 'none'
  | 'aggregate_before_join'
  | 'latest_snapshot'
  | 'distinct_on_target'

export type JoinEdgeStatus = 'missing' | 'conflict' | 'normal'

export interface JoinEdgeData extends Record<string, unknown> {
  relationship?: JoinCardinality
  join_type?: JoinType
  aggregation_strategy?: JoinAggregationStrategy
  source_field?: string
  target_field?: string
  description?: string
  status?: JoinEdgeStatus
}
