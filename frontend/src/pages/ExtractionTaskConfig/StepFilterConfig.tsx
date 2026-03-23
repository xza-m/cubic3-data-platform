/**
 * Step 2: 过滤条件配置 - Migrated to shadcn/ui
 */

import { useState } from 'react'
import { Filter, Code, Info, AlertCircle } from 'lucide-react'
import { FilterBuilder } from '../../components/FilterBuilder'
import type { FilterGroup, FieldMeta } from '../../types/filter'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface StepFilterConfigProps {
  fields: FieldMeta[]
  filterConditions: FilterGroup
  onFilterChange: (filter: FilterGroup) => void
}

export default function StepFilterConfig({ 
  fields, 
  filterConditions, 
  onFilterChange 
}: StepFilterConfigProps) {
  
  const [sqlPreview, setSqlPreview] = useState('')
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] }>({ valid: true, errors: [] })
  
  return (
    <div className="grid grid-cols-3 gap-6" style={{ height: 'calc(100vh - 350px)' }}>
      {/* 左侧：过滤器构建器 */}
      <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Filter className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">配置过滤条件</h3>
        </div>
        
        <div className="flex-1 overflow-auto bg-gray-50 rounded-xl border border-gray-100 p-4">
          {fields.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Alert className="max-w-md border-yellow-200 bg-yellow-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">无可用字段</div>
                  <div className="text-sm">请返回上一步选择数据集和字段</div>
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <FilterBuilder
              fields={fields}
              value={filterConditions}
              onChange={onFilterChange}
              onSQLChange={setSqlPreview}
              onValidationChange={setValidation}
              maxDepth={3}
            />
          )}
        </div>
      </div>
      
      {/* 右侧：SQL 预览 & 校验信息 */}
      <div className="space-y-6">
        {/* SQL 预览 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Code className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">SQL 预览</h3>
          </div>
          
          <div className="bg-gray-900 rounded-xl p-4 overflow-auto max-h-80">
            <pre className="text-xs text-gray-100 font-mono whitespace-pre-wrap">
              {sqlPreview || 'WHERE 1=1 -- 暂无过滤条件'}
            </pre>
          </div>
        </div>
        
        {/* 校验信息 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
              validation.valid 
                ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                : 'bg-gradient-to-br from-red-500 to-rose-500'
            }`}>
              <Info className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">校验结果</h3>
          </div>
          
          {validation.valid ? (
            <Alert className="border-green-200 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                过滤条件配置正确，可以继续下一步
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium mb-2">发现以下问题：</div>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700">
                <p className="font-medium mb-1">提示：</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>可配置多层嵌套的 AND/OR 逻辑</li>
                  <li>支持字段间比较和值比较</li>
                  <li>最大嵌套深度为 3 层</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
