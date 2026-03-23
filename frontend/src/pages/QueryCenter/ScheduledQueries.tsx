/**
 * 定时查询页面（原数据提取任务） - Migrated to shadcn/ui
 */
import { useNavigate } from 'react-router-dom'
import { Clock, Plus, ArrowLeft } from 'lucide-react'
import { FormButton } from '@/components/business'
import ExtractionTasks from '../ExtractionTasks'

export default function ScheduledQueries() {
  const navigate = useNavigate()
  
  return (
    <div className="h-full flex flex-col">
      {/* 页面标题 */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/queries')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">定时查询</h1>
              <p className="text-sm text-gray-500 mt-1">配置定时执行的数据查询任务</p>
            </div>
          </div>
          
          <FormButton
            onClick={() => navigate('/extraction/config')}
            className="bg-gradient-to-r from-blue-500 to-purple-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            新建定时查询
          </FormButton>
        </div>
        
        <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">提示：定时查询 vs 即时查询</p>
            <ul className="list-disc list-inside space-y-1 text-blue-600">
              <li><strong>定时查询</strong>：配置后自动按计划执行，结果以文件形式推送到飞书或OSS</li>
              <li><strong>即时查询</strong>：在 SQL 编辑器中即时执行，结果在网页上直接查看</li>
            </ul>
          </div>
        </div>
      </div>
      
      {/* 复用现有的数据提取任务列表 */}
      <div className="flex-1 overflow-hidden">
        <ExtractionTasks />
      </div>
    </div>
  )
}
