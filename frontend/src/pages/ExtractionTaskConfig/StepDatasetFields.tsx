/**
 * Step 1: 数据集和字段选择 - Migrated to shadcn/ui
 */

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Layers, Loader2 } from 'lucide-react'
import { getDatasets, getDataset } from '../../api/datasets'
import { FieldSelector } from '../../components/FieldSelector'
import type { FieldMeta } from '../../types/filter'
import { FormSelect } from '@/components/business'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface StepDatasetFieldsProps {
  datasetId: number | null
  selectedFields: string[]
  onDatasetChange: (id: number) => void
  onFieldsChange: (fields: string[]) => void
  onFieldsMetaChange?: (fields: FieldMeta[]) => void
}

// 数据类型映射：data_type -> field_type
function mapDataType(dataType: string): string {
  const type = dataType.toUpperCase()
  
  // 字符串类型
  if (type.includes('CHAR') || type.includes('TEXT') || type.includes('STRING')) {
    return 'STRING'
  }
  
  // 整数类型
  if (type === 'INT' || type === 'TINYINT' || type === 'SMALLINT') {
    return 'INTEGER'
  }
  if (type === 'BIGINT' || type.includes('LONG')) {
    return 'BIGINT'
  }
  
  // 精确数值类型
  if (type.includes('NUMERIC') || type.includes('DECIMAL') || type.includes('MONEY')) {
    return 'DECIMAL'
  }
  
  // 浮点数类型
  if (type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('REAL')) {
    return 'FLOAT'
  }
  
  // 日期时间类型
  if (type === 'DATE') return 'DATE'
  if (type === 'TIME') return 'TIME'
  if (type.includes('TIMESTAMP') || type === 'DATETIME') return 'TIMESTAMP'
  
  // 默认字符串
  return 'STRING'
}

// 业务类型映射：business_type -> field_category
function mapBusinessType(businessType: string): 'DIMENSION' | 'MEASURE' | 'PARTITION_KEY' {
  const type = businessType.toLowerCase()
  
  if (type === 'partition' || type === 'partition_key') return 'PARTITION_KEY'
  if (type === 'metric' || type === 'measure') return 'MEASURE'
  return 'DIMENSION'  // dimension 或默认
}

export default function StepDatasetFields({ 
  datasetId, 
  selectedFields, 
  onDatasetChange, 
  onFieldsChange,
  onFieldsMetaChange
}: StepDatasetFieldsProps) {
  
  // 获取数据集列表
  const { data: datasetsData, isLoading: datasetsLoading } = useQuery({
    queryKey: ['datasets-for-config'],
    queryFn: () => getDatasets({ page: 1, page_size: 100 })
  })
  
  const datasets = datasetsData?.data?.items || []
  
  // 获取选中数据集的详情（包括字段）
  const { data: datasetDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['dataset-detail', datasetId],
    queryFn: () => getDataset(datasetId!, true),
    enabled: !!datasetId
  })
  
  const fields: FieldMeta[] = (datasetDetail?.data?.fields || []).map((f: { physical_name: string; display_name?: string; data_type?: string; business_type?: string; sensitivity_level?: string }) => ({
    physical_name: f.physical_name,
    display_name: f.display_name || f.physical_name,
    field_type: mapDataType(f.data_type || 'STRING'),
    field_category: mapBusinessType(f.business_type || 'dimension'),
    is_sensitive: f.sensitivity_level !== 'public',
    is_searchable: true
  }))
  
  // 当数据集改变时，默认选中所有分区字段
  useEffect(() => {
    if (fields.length > 0 && selectedFields.length === 0) {
      const partitionFields = fields
        .filter(f => f.field_category === 'PARTITION_KEY')
        .map(f => f.physical_name)
      
      if (partitionFields.length > 0) {
        onFieldsChange(partitionFields)
      }
    }
  }, [fields, selectedFields.length, onFieldsChange])
  
  // 将字段元数据传递给父组件
  useEffect(() => {
    if (fields.length > 0 && onFieldsMetaChange) {
      onFieldsMetaChange(fields)
    }
  }, [fields, onFieldsMetaChange])
  
  return (
    <div className="space-y-6">
      {/* 数据集选择区 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
            <Database className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">选择数据集</h3>
        </div>
        
        <FormSelect
          value={datasetId ? datasetId.toString() : ''}
          onChange={(val: string) => onDatasetChange(Number(val))}
          placeholder="请选择数据集"
          disabled={datasetsLoading}
          searchable
          options={datasets.map((ds: { id: number; dataset_name: string; dataset_code: string; source_type?: string }) => ({
            value: ds.id.toString(),
            label: ds.dataset_name,
            desc: `${ds.dataset_code} • ${ds.source_type}`
          }))}
          className="w-full"
          renderOption={(option: { label: string; value: string; desc: string }) => (
            <div className="py-1">
              <div className="font-semibold">{option.label}</div>
              <div className="text-xs text-gray-500">{option.desc}</div>
            </div>
          )}
        />
        
        {datasetId && datasetDetail && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="text-sm text-blue-800">
              {datasetDetail.data?.description || '无描述'}
            </div>
          </div>
        )}
      </div>
      
      {/* 字段选择区 */}
      {datasetId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">选择字段</h3>
            </div>
            
            {/* 已选字段统计 */}
            <div className="px-4 py-2 rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-100">
              <span className="text-sm text-gray-600">已选 </span>
              <span className="text-lg font-bold text-blue-600">{selectedFields.length}</span>
              <span className="text-sm text-gray-600"> 个字段</span>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4" style={{ height: 'calc(100vh - 450px)' }}>
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                <div className="mt-4 text-gray-500">加载字段中...</div>
              </div>
            ) : fields.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Alert variant="warning" className="max-w-md">
                  <AlertDescription>
                    <div className="font-medium mb-1">该数据集暂无字段</div>
                    <div className="text-sm">请先在数据集管理中配置字段信息</div>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <FieldSelector
                fields={fields}
                value={selectedFields}
                onChange={onFieldsChange}
                showStatistics={true}
              />
            )}
          </div>
        </div>
      )}
      
      {/* 未选择数据集提示 */}
      {!datasetId && (
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200/50 p-12">
          <div className="text-center text-gray-400">
            <Database className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">请先选择数据集</p>
          </div>
        </div>
      )}
    </div>
  )
}
