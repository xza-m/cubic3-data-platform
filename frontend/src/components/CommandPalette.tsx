/**
 * 全局命令面板 - 匹配 uiv2.pen 设计稿 (4xD2i)
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  CornerDownLeft,
  Database,
  TrendingUp,
  Layers,
  Terminal,
  Plus,
  Play,
  Upload,
  Sparkles,
} from 'lucide-react'

interface CommandItem {
  icon: React.ReactNode
  label: string
  shortcut?: string
  action: () => void
  accentColor?: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const recentItems: CommandItem[] = [
    {
      icon: <Database className="h-4 w-4 text-blue-600" />,
      label: '销售数据集',
      action: () => { navigate('/data-center/datasets'); onClose() },
    },
    {
      icon: <TrendingUp className="h-4 w-4 text-slate-500" />,
      label: 'Q3收入查询',
      action: () => { navigate('/queries?legacy=my'); onClose() },
    },
    {
      icon: <Layers className="h-4 w-4 text-slate-500" />,
      label: '订单Cube',
      action: () => { navigate('/semantic/cubes'); onClose() },
    },
    {
      icon: <Terminal className="h-4 w-4 text-slate-500" />,
      label: '用户行为分析',
      action: () => { navigate('/queries?legacy=history'); onClose() },
    },
  ]

  const quickActions: CommandItem[] = [
    {
      icon: <Plus className="h-4 w-4 text-slate-500" />,
      label: '新建查询',
      shortcut: '⌘N',
      action: () => { navigate('/queries'); onClose() },
    },
    {
      icon: <Play className="h-4 w-4 text-slate-500" />,
      label: '运行SQL',
      shortcut: '⌘R',
      action: () => { navigate('/queries'); onClose() },
    },
    {
      icon: <Upload className="h-4 w-4 text-slate-500" />,
      label: '导入数据集',
      shortcut: '⌘I',
      action: () => { navigate('/data-center/datasets/register'); onClose() },
    },
    {
      icon: <Sparkles className="h-4 w-4 text-indigo-500" />,
      label: 'AI问数',
      shortcut: '⌘J',
      accentColor: 'indigo',
      action: () => { navigate('/data-chat'); onClose() },
    },
  ]

  const filteredRecent = query
    ? recentItems.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : recentItems
  const filteredActions = query
    ? quickActions.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : quickActions
  const filteredAll = useMemo(() => [...filteredRecent, ...filteredActions], [filteredRecent, filteredActions])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, filteredAll.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && filteredAll[activeIndex]) {
        e.preventDefault()
        filteredAll[activeIndex].action()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filteredAll, activeIndex, onClose],
  )

  // Global ⌘K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  let runningIndex = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 rounded-2xl bg-slate-900/73" />

      {/* Modal Card */}
      <div
        className="relative w-[560px] overflow-hidden rounded-xl bg-white shadow-[0_24px_64px_rgba(15,23,42,0.19)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索页面、数据集、查询、Cube..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none"
          />
          <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">
            ⌘K
          </span>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* Content Area */}
        <div className="flex max-h-[360px] flex-col gap-4 overflow-y-auto p-2">
          {/* Recent Section */}
          {filteredRecent.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="px-2 py-1.5 text-xs font-medium tracking-wider text-slate-400">
                最近访问
              </div>
              {filteredRecent.map((item) => {
                const idx = runningIndex++
                return (
                  <button
                    key={item.label}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      idx === activeIndex ? 'bg-slate-100' : ''
                    }`}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {item.icon}
                    <span className="flex-1 text-sm text-slate-900">{item.label}</span>
                    {idx === activeIndex && (
                      <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Quick Actions Section */}
          {filteredActions.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="px-2 py-1.5 text-xs font-medium tracking-wider text-slate-400">
                快捷操作
              </div>
              {filteredActions.map((item) => {
                const idx = runningIndex++
                return (
                  <button
                    key={item.label}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      idx === activeIndex ? 'bg-slate-100' : ''
                    }`}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    {item.icon}
                    <span
                      className={`flex-1 text-sm ${
                        item.accentColor === 'indigo'
                          ? 'font-medium text-indigo-500'
                          : 'text-slate-900'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.shortcut && (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          item.accentColor === 'indigo'
                            ? 'bg-indigo-50 text-indigo-500'
                            : 'border border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                      >
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {filteredAll.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-400">
              没有找到匹配的结果
            </div>
          )}
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 px-4 py-2.5">
          <span className="text-xs text-slate-400">↑↓ 导航</span>
          <span className="text-xs text-slate-400">↵ 打开</span>
          <span className="text-xs text-slate-400">esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
