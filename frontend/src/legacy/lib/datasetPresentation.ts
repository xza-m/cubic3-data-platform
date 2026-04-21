import type { Dataset } from '@/types'

type DatasetPresentationShape = Pick<Dataset, 'dataset_type' | 'physical_table' | 'file_metadata'>

export const getDatasetTypeLabel = (datasetType?: string | null) => {
  if (datasetType === 'virtual') {
    return '虚拟数据集'
  }
  if (datasetType === 'file') {
    return '文件数据集'
  }
  return '物理数据集'
}

export const getDatasetSourceLabel = (sourceType?: string | null) => sourceType || '-'

export const getDatasetSourceObjectLabel = (dataset: DatasetPresentationShape) => {
  if (dataset.physical_table) {
    return dataset.physical_table
  }

  if (dataset.dataset_type === 'virtual') {
    return '视图'
  }

  if (dataset.dataset_type === 'file') {
    return dataset.file_metadata?.file_name || '-'
  }

  return '-'
}
