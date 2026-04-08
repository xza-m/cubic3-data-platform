import { describe, expect, it } from 'vitest'
import {
  getDatasetSourceLabel,
  getDatasetSourceObjectLabel,
  getDatasetTypeLabel,
} from './datasetPresentation'

describe('datasetPresentation', () => {
  it('返回统一的数据集类型文案', () => {
    expect(getDatasetTypeLabel('physical')).toBe('物理数据集')
    expect(getDatasetTypeLabel('virtual')).toBe('虚拟数据集')
    expect(getDatasetTypeLabel('file')).toBe('文件数据集')
    expect(getDatasetTypeLabel(undefined)).toBe('物理数据集')
  })

  it('返回统一的来源文案', () => {
    expect(getDatasetSourceLabel('postgresql')).toBe('postgresql')
    expect(getDatasetSourceLabel('maxcompute')).toBe('maxcompute')
    expect(getDatasetSourceLabel('')).toBe('-')
    expect(getDatasetSourceLabel(undefined)).toBe('-')
  })

  it('返回统一的来源对象文案', () => {
    expect(getDatasetSourceObjectLabel({
      dataset_type: 'physical',
      physical_table: 'dw.orders',
    })).toBe('dw.orders')

    expect(getDatasetSourceObjectLabel({
      dataset_type: 'virtual',
    })).toBe('视图')

    expect(getDatasetSourceObjectLabel({
      dataset_type: 'file',
      file_metadata: { file_name: 'scores.xlsx' },
    })).toBe('scores.xlsx')

    expect(getDatasetSourceObjectLabel({
      dataset_type: 'file',
      file_metadata: {},
    })).toBe('-')
  })
})
