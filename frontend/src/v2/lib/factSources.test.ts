import { describe, expect, it } from 'vitest'
import {
  formatDatasetScaleSource,
  formatQueryHistorySource,
  isConnectedDatasourceStatus,
  normalizeDataAssetSyncStatus,
  normalizeDatasourceConnectionStatus,
} from './factSources'

describe('factSources', () => {
  it('兼容数据源历史 success 状态', () => {
    expect(isConnectedDatasourceStatus('connected')).toBe(true)
    expect(isConnectedDatasourceStatus('success')).toBe(true)
    expect(normalizeDatasourceConnectionStatus('error')).toBe('failed')
  })

  it('归一数据资产同步状态', () => {
    expect(normalizeDataAssetSyncStatus('success')).toBe('synced')
    expect(normalizeDataAssetSyncStatus('running')).toBe('pending')
    expect(normalizeDataAssetSyncStatus(null)).toBe('unknown')
  })

  it('格式化 Dashboard 数据规模来源', () => {
    expect(formatDatasetScaleSource('datasets')).toBe('平台数据集')
    expect(formatDatasetScaleSource('data_asset_tables')).toBe('数据资产事实源')
  })

  it('格式化 Dashboard 查询记录来源', () => {
    expect(formatQueryHistorySource('query_histories')).toBe('交互式查询记录')
  })
})
