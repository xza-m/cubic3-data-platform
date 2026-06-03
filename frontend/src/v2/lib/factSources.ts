export type DatasourceConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'pending'
  | 'failed'
  | 'unknown'

export type DataAssetSyncStatus = 'synced' | 'pending' | 'failed' | 'unknown'

export function normalizeDatasourceConnectionStatus(
  status?: string | null,
): DatasourceConnectionStatus {
  const value = (status ?? 'unknown').trim().toLowerCase()
  if (value === 'connected' || value === 'success') return 'connected'
  if (value === 'disconnected') return 'disconnected'
  if (value === 'testing' || value === 'pending') return 'pending'
  if (value === 'error' || value === 'failed') return 'failed'
  return 'unknown'
}

export function isConnectedDatasourceStatus(status?: string | null): boolean {
  return normalizeDatasourceConnectionStatus(status) === 'connected'
}

export function normalizeDataAssetSyncStatus(status?: string | null): DataAssetSyncStatus {
  const value = (status ?? 'unknown').trim().toLowerCase()
  if (value === 'synced' || value === 'success') return 'synced'
  if (value === 'pending' || value === 'running' || value === 'syncing') return 'pending'
  if (value === 'failed' || value === 'error') return 'failed'
  return 'unknown'
}

export function formatDatasetScaleSource(source?: string | null): string {
  return source === 'datasets'
    ? '回退到平台 Dataset'
    : '资产事实层 · data_asset_tables'
}
