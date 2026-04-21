/**
 * 应用卡片组件
 * 基于 uiv2.pen 设计稿
 */
import {
  BarChart3,
  Database,
  FileText,
  AlertTriangle,
  Send,
  Bell,
  Bot,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppDefinition } from '../../api/appCenter'

interface AppCardProps {
  app: AppDefinition
  onClick?: () => void
}

const APP_ICONS: Record<string, LucideIcon> = {
  bi_dashboard_push: BarChart3,
  dataset_card_push: Database,
  report_push: FileText,
  anomaly_monitor: AlertTriangle,
  query_result_push: Send,
  extraction_notify: Bell,
  data_agent: Bot,
}

const ICON_STYLES: Record<string, { bg: string; color: string }> = {
  bi_dashboard_push: { bg: 'bg-[#EFF6FF]', color: 'text-[#2563EB]' },
  dataset_card_push: { bg: 'bg-[#EEF2FF]', color: 'text-[#6366F1]' },
  report_push: { bg: 'bg-[#ECFDF5]', color: 'text-[#10B981]' },
  anomaly_monitor: { bg: 'bg-[#FEF3C7]', color: 'text-[#F59E0B]' },
  query_result_push: { bg: 'bg-[#EFF6FF]', color: 'text-[#2563EB]' },
  extraction_notify: { bg: 'bg-[#FEF3C7]', color: 'text-[#F59E0B]' },
  data_agent: { bg: 'bg-[#EEF2FF]', color: 'text-[#6366F1]' },
}

export default function AppCard({ app, onClick }: AppCardProps) {
  const Icon = APP_ICONS[app.code] || Database
  const style = ICON_STYLES[app.code] || { bg: 'bg-[#F1F5F9]', color: 'text-[#64748B]' }

  return (
    <div
      className="group flex h-full cursor-pointer flex-col gap-4 rounded-xl bg-white p-6 text-left shadow-[0_2px_16px_#0F172A08] transition-shadow hover:shadow-[0_4px_20px_#0F172A14]"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      }}
    >
      {/* Icon */}
      <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${style.bg}`}>
        <Icon className={`h-5 w-5 ${style.color}`} />
      </div>

      {/* Name */}
      <span className="text-[15px] font-semibold text-[#0F172A]">{app.name}</span>

      {/* Description */}
      <p className="text-[13px] leading-[1.5] text-[#64748B] line-clamp-2">
        {app.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 text-xs">
        <span className="text-[#10B981]">
          {app.instance_count || 0} 个实例 · {app.enabled ? '已启用' : '未启用'}
        </span>
        <span className="text-[#94A3B8] transition-colors group-hover:text-[#2563EB]">查看详情</span>
      </div>
    </div>
  )
}
