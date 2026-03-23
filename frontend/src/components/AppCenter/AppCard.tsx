/**
 * 应用卡片组件
 */
import { BarChart3, Database, FileText, AlertTriangle, Send, Bell } from 'lucide-react'
import { Badge } from '@/components/business'
import type { AppDefinition } from '../../api/appCenter'

interface AppCardProps {
  app: AppDefinition
  onClick: () => void
}

// 应用图标映射
const APP_ICONS = {
  bi_dashboard_push: BarChart3,
  dataset_card_push: Database,
  report_push: FileText,
  anomaly_monitor: AlertTriangle,
  query_result_push: Send,
  extraction_notify: Bell,
}

// 渐变色方案映射（根据应用代码）
const GRADIENT_COLORS = {
  bi_dashboard_push: 'from-blue-500 to-cyan-500',
  dataset_card_push: 'from-purple-500 to-pink-500',
  report_push: 'from-emerald-500 to-teal-500',
  anomaly_monitor: 'from-red-500 to-orange-500',
  query_result_push: 'from-indigo-500 to-blue-500',
  extraction_notify: 'from-amber-500 to-yellow-500',
}

export default function AppCard({ app, onClick }: AppCardProps) {
  const Icon = APP_ICONS[app.code as keyof typeof APP_ICONS] || Database
  const gradient = GRADIENT_COLORS[app.code as keyof typeof GRADIENT_COLORS] || 'from-gray-500 to-gray-600'
  
  return (
    <button
      onClick={onClick}
      className="group relative bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 text-left hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer w-full"
    >
      {/* 应用图标 */}
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="w-7 h-7 text-white" />
      </div>
      
      {/* 应用名称 */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{app.name}</h3>
      
      {/* 应用描述 */}
      <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[2.5rem]">
        {app.description}
      </p>
      
      {/* 底部信息栏 */}
      <div className="flex items-center justify-between">
        {/* 实例数量徽章 */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-2">
            {app.instance_count || 0}
          </Badge>
          <span className="text-xs text-gray-400">个实例</span>
        </div>
        
        {/* 状态指示器 */}
        {app.enabled ? (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs text-gray-500">已启用</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
            <span className="text-xs text-gray-400">未启用</span>
          </div>
        )}
      </div>
    </button>
  )
}
