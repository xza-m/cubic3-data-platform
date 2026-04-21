import type { CubeDraftPayload, CubeModelingSourceDraftRequest, CubeSummary } from '@/api/semantic'

export interface SelectedTable {
  database: string
  schema?: string
  table: string
  comment?: string
}

export function buildCreateCubeDraftRequest(
  selectedSource?: string,
  selectedTable?: SelectedTable | null,
): CubeModelingSourceDraftRequest {
  if (!selectedSource || !selectedTable) {
    throw new Error('请先选择数据源和物理表')
  }

  return {
    source_kind: 'physical_table',
    source_id: Number(selectedSource),
    database: selectedTable.database,
    schema: selectedTable.schema,
    table: selectedTable.table,
  }
}

export function buildDatasetCubeDraftRequest(
  datasetId?: number | null,
): CubeModelingSourceDraftRequest {
  if (!datasetId) {
    throw new Error('请先选择数据集')
  }

  return {
    source_kind: 'dataset',
    dataset_id: Number(datasetId),
  }
}

export function notifyCreateCubeFailure({
  toast,
  error,
}: {
  toast: (payload: { title: string; description: string; variant: 'destructive' }) => void
  error: unknown
}) {
  toast({ title: '创建 Cube 失败', description: (error as Error).message, variant: 'destructive' })
}

export function buildCubeSummaryFromDraft(payload: CubeDraftPayload): CubeSummary {
  const dimensionKeys = Object.keys(payload.dimensions || {})
  const measureKeys = Object.keys(payload.measures || {})
  const joinCount = Object.keys(payload.joins || {}).length

  return {
    name: payload.name,
    title: payload.title,
    description: payload.description || '',
    table: payload.table,
    domain_ids: payload.domain_id ? [payload.domain_id] : [],
    domains: [],
    domain_count: payload.domain_id ? 1 : 0,
    status: payload.status,
    source_id: payload.source_id,
    source_database: payload.source_database,
    source_schema: payload.source_schema,
    dimensions: dimensionKeys,
    measures: measureKeys,
    dimension_count: dimensionKeys.length,
    measure_count: measureKeys.length,
    join_count: joinCount,
    state_summary: {
      status: payload.status,
      source_id: payload.source_id,
    },
  }
}
