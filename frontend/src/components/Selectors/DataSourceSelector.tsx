/**
 * 数据源选择器
 * 可在任何需要选择数据源的场景中使用
 */
import { useState, useEffect } from 'react'
import { FormSelect, type FormSelectOption } from '@/components/business'
import { getDataSources } from '../../api/datasources'
import type { DataSource } from '@/types'

export interface DataSourceSelectorProps {
  value?: number
  onChange?: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  /**
   * 是否只显示激活状态的数据源
   * @default true
   */
  activeOnly?: boolean
  
  /**
   * 过滤数据源类型
   * 例如：['postgresql', 'mysql']
   */
  sourceTypes?: string[]
  
  /**
   * 自定义显示格式
   * @default (ds) => `${ds.name} (${ds.source_type})`
   */
  formatLabel?: (dataSource: DataSource) => string
  
  /**
   * 数据加载完成回调
   */
  onDataLoaded?: (dataSources: DataSource[]) => void
}

/**
 * 数据源选择器组件
 * 
 * @example
 * // 基础使用
 * <DataSourceSelector 
 *   value={dataSourceId}
 *   onChange={setDataSourceId}
 *   placeholder="请选择数据源"
 * />
 * 
 * @example
 * // 只显示 PostgreSQL 数据源
 * <DataSourceSelector
 *   sourceTypes={['postgresql']}
 *   value={dataSourceId}
 *   onChange={setDataSourceId}
 * />
 * 
 * @example
 * // 自定义显示格式
 * <DataSourceSelector
 *   formatLabel={(ds) => `${ds.name} [${ds.source_type}] - ${ds.description}`}
 *   value={dataSourceId}
 *   onChange={setDataSourceId}
 * />
 */
export default function DataSourceSelector({
  value,
  onChange,
  placeholder = "请选择数据源",
  className,
  disabled,
  activeOnly = true,
  sourceTypes,
  formatLabel,
  onDataLoaded,
}: DataSourceSelectorProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDataSources()
  }, [activeOnly, sourceTypes])

  const loadDataSources = async () => {
    try {
      setLoading(true)
      const response = await getDataSources({ 
        page_size: 1000, 
        is_active: activeOnly ? true : undefined 
      })
      
      let items = response.data?.items || []
      
      // 按数据源类型过滤
      if (sourceTypes && sourceTypes.length > 0) {
        items = items.filter(ds => sourceTypes.includes(ds.source_type))
      }
      
      setDataSources(items)
      onDataLoaded?.(items)
    } catch (error) {
      console.error('加载数据源失败:', error)
      setDataSources([])
    } finally {
      setLoading(false)
    }
  }

  const getLabel = (ds: DataSource): string => {
    if (formatLabel) {
      return formatLabel(ds)
    }
    return `${ds.name} (${ds.source_type})`
  }

  const options: FormSelectOption[] = dataSources.map(ds => ({
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
