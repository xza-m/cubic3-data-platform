/**
 * AI 数据助手浮窗 - 匹配 uiv2.pen 设计稿 (Pfl2m)
 */
import { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Minus,
  X,
  Database,
  BarChart3,
  FileText,
  MessageSquare,
  ArrowUp,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function AIAssistant({ open, onClose }: Props) {
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content:
        '你好！我是 Cubic³ AI 数据助手。你可以用自然语言向我提问，我会帮你查询数据、生成分析报告。\n\n试试问我：\n- 上个月的销售总额是多少？\n- 用户活跃度趋势如何？',
    },
  ])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // Simulate AI response
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '正在分析你的问题，请稍候...',
      }
      setMessages((prev) => [...prev, aiMsg])
    }, 500)
  }

  if (!open) return null

  // FAB only when minimized
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-500 text-white shadow-[0_8px_20px_rgba(37,99,235,0.25)]"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[700px] w-[420px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_16px_40px_rgba(15,23,42,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-500 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-[18px] w-[18px] text-white" />
          <span className="text-[15px] font-semibold text-white">Cubic³ AI 助手</span>
          <span className="rounded-xl bg-white/[.13] px-2 py-0.5 text-[11px] font-medium text-white/80">
            Beta
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(true)} className="p-1 text-white/70 hover:text-white">
            <Minus className="h-[18px] w-[18px]" />
          </button>
          <button onClick={onClose} className="p-1 text-white/70 hover:text-white">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
          <Database className="h-3.5 w-3.5 text-blue-600" />
          查询数据
        </button>
        <button className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
          <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
          数据洞察
        </button>
        <button className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
          <FileText className="h-3.5 w-3.5 text-emerald-500" />
          生成报告
        </button>
      </div>

      {/* Chat Body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {messages.map((msg) =>
          msg.role === 'assistant' ? (
            <div key={msg.id} className="flex gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50">
                <Sparkles className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="rounded-[4px_12px_12px_12px] bg-slate-100 px-4 py-3 text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex justify-end">
              <div className="rounded-[12px_4px_12px_12px] bg-blue-600 px-4 py-3 text-[13px] leading-relaxed text-white">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-slate-100 px-3.5 py-2">
          <MessageSquare className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="输入你的数据问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            className="flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 outline-none"
          />
        </div>
        <button
          onClick={handleSend}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-500 text-white"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
