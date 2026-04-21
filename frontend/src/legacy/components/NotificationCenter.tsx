/**
 * 通知中心面板 - 匹配 uiv2.pen 设计稿 (dmrKq)
 */
import { useState } from 'react'
import { Bell, ArrowRight } from 'lucide-react'

type NotificationType = 'query' | 'task' | 'alert' | 'ai'

interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  time: string
  unread: boolean
  dotColor: string
  tags?: { label: string; color: string }[]
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'query', label: '查询' },
  { key: 'task', label: '任务' },
  { key: 'alert', label: '告警' },
] as const

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'query',
    title: '查询完成',
    description: 'Q3收入分析查询已完成，返回 2,847 条记录',
    time: '2 分钟前',
    unread: true,
    dotColor: 'bg-blue-600',
  },
  {
    id: '2',
    type: 'alert',
    title: '异常检测',
    description: '用户活跃度指标出现异常波动，DAU 下降 23%',
    time: '15 分钟前',
    unread: true,
    dotColor: 'bg-amber-500',
    tags: [
      { label: '高优先级', color: 'text-red-500 bg-red-50' },
      { label: '需处理', color: 'text-amber-600 bg-amber-50' },
    ],
  },
  {
    id: '3',
    type: 'task',
    title: '提取任务成功',
    description: '「销售订单数据集」已完成全量同步，共 15,423 条',
    time: '1 小时前',
    unread: false,
    dotColor: 'bg-emerald-500',
  },
  {
    id: '4',
    type: 'alert',
    title: '数据源连接失败',
    description: 'MySQL 生产库连接超时，已自动重试 3 次',
    time: '30 分钟前',
    unread: false,
    dotColor: 'bg-red-500',
    tags: [
      { label: '连接超时', color: 'text-red-500 bg-red-50' },
      { label: '自动重试', color: 'text-slate-500 bg-slate-100' },
    ],
  },
  {
    id: '5',
    type: 'ai',
    title: 'AI 洞察报告已生成',
    description: '「月度营收趋势分析」报告已生成，点击查看',
    time: '2 小时前',
    unread: false,
    dotColor: 'bg-indigo-500',
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function NotificationCenter({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<string>('all')
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS)

  const filtered =
    activeTab === 'all'
      ? notifications
      : notifications.filter((n) => n.type === activeTab)

  const unreadCount = notifications.filter((n) => n.unread).length

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-4 top-14 z-50 flex h-[600px] w-[400px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_rgba(15,23,42,0.1)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bell className="h-[18px] w-[18px] text-slate-900" />
            <span className="text-[15px] font-semibold text-slate-900">通知中心</span>
            {unreadCount > 0 && (
              <span className="flex items-center justify-center rounded-xl bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={markAllRead}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            全部已读
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-slate-200 px-5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center px-4 py-2.5 text-[13px] ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-600 font-semibold text-blue-600'
                  : 'text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={`flex gap-3 px-5 py-3.5 ${
                item.unread ? 'bg-blue-50/60' : ''
              } ${i > 0 ? 'border-t border-slate-200' : ''}`}
            >
              <div
                className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${item.dotColor}`}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={`text-[13px] text-slate-900 ${
                    item.unread ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {item.title}
                </span>
                <span className="text-xs leading-[1.4] text-slate-500">
                  {item.description}
                </span>
                {item.tags && (
                  <div className="flex items-center gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag.label}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tag.color}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[11px] text-slate-400">{item.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 border-t border-slate-200 px-5 py-3">
          <span className="text-[13px] font-medium text-blue-600">查看全部通知</span>
          <ArrowRight className="h-3.5 w-3.5 text-blue-600" />
        </div>
      </div>
    </>
  )
}
