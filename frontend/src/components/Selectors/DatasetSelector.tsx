/**
 * 数据集选择器
 * 可在任何需要选择数据集的场景中使用
 */
import { useState, useEffect } from 'react'
import { FormSelect, type FormSelectOption } from '@/components/business'
import { getDatasets } from '../../api/datasets'
import type { Dataset } from '@/types'

export interface DatasetSelectorProps {
  value?: number
  onChange?: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /**
   * 过滤指定数据源的数据集
   */
  sourceId?: number
  
  /**
   * 自定义显示格式
   * @default (ds) => `${ds.dataset_name} (ID: ${ds.id})`
   */
  formatLabel?: (dataset: Dataset) => string
  
  /**
   * 数据加载完成回调
   */
  onDataLoaded?: (datasets: Dataset[]) => void
}

/**
 * 数据集选择器组件
 * 
 * @example
 * // 基础使用
 * <DatasetSelector 
 *   value={datasetId}
 *   onChange={setDatasetId}
 *   placeholder="请选择数据集"
 * />
 * 
 * @example
 * // 只显示指定数据源的数据集
 * <DatasetSelector
 *   sourceId={1}
 *   value={datasetId}
 *   onChange={setDatasetId}
 * />
 * 
 * @example
 * // 自定义显示格式
 * <DatasetSelector
 *   formatLabel={(ds) => `${ds.dataset_name} - ${ds.description || '无描述'}`}
 *   value={datasetId}
 *   onChange={setDatasetId}
 * />
 */
export default function DatasetSelector({
  value,
  onChange,
  placeholder = "请选择数据集",
  className,
  disabled,
  sourceId,
  formatLabel,
  onDataLoaded,
}: DatasetSelectorProps) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDatasets()
  }, [sourceId])

  const loadDatasets = async () => {
    try {
      setLoading(true)
      const response = await getDatasets({ 
        page_size: 1000,
        source_id: sourceId 
      })
      
      const items = response.data?.items || []
      
      setDatasets(items)
      onDataLoaded?.(items)
    } catch (error) {
      console.error('加载数据集失败:', error)
      setDatasets([])
    } finally {
      setLoading(false)
    }
  }

  const getLabel = (ds: Dataset): string => {
    if (formatLabel) {
      return formatLabel(ds)
    }
    return `${ds.dataset_name} (ID: ${ds.id})`
  }

  const options: FormSelectOption[] = datasets.map(ds => ({
    label: getLabel(ds),
    value: String(ds.id),
  }))

  return (
    <FormSelect
      value={value ? String(value) : undefined}
      onChange={(val) => onChange?.(Number(val))}
      options={options}
      placeholder={placeholder}
      className={className}
      disabled={disabled || loading}
    />
  )
}
