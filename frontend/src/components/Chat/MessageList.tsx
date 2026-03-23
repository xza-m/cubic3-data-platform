/**
 * 消息列表组件 - Migrated to shadcn/ui
 */
import { useEffect, useRef } from 'react'
import { User, Bot, Code, AlertCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import ChartVisualization from './ChartVisualization'
import type { Message } from '../../api/conversations'

interface MessageListProps {
  messages: Message[]
  loading?: boolean
}

export default function MessageList({ messages, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {message.role === 'assistant' && (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-white" />
            </div>
          )}

          <div className={`max-w-3xl ${message.role === 'user' ? 'order-first' : ''}`}>
            {/* 用户消息 */}
            {message.role === 'user' && (
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <div className="text-xs opacity-80 mt-1">
                  {format(new Date(message.created_at), 'HH:mm')}
                </div>
              </div>
            )}

            {/* AI 消息 */}
            {message.role === 'assistant' && (
              <div className="space-y-3">
                {/* 文本回复 */}
                {message.content && (
                  <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.content}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      {format(new Date(message.created_at), 'HH:mm')}
                    </div>
                  </div>
                )}

                {/* SQL 代码块 */}
                {message.generated_sql && (
                  <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                      <Code className="w-3 h-3" />
                      <span>生成的 SQL</span>
                    </div>
                    <pre className="text-sm text-gray-100 font-mono">
                      {message.generated_sql}
                    </pre>
                  </div>
                )}

                {/* 查询结果可视化 */}
                {message.query_result && message.visualization_config && (
                  <ChartVisualization
                    data={message.query_result.data}
                    config={{
                      type: message.visualization_config.type,
                      ...message.visualization_config.config,
                    }}
                  />
                )}

                {/* 错误信息 */}
                {message.error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-red-800 mb-1">处理失败</div>
                        <div className="text-sm text-red-600">{message.error}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {message.role === 'user' && (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
      ))}

      {loading && (
        <div className="flex gap-3 justify-start">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-200 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span className="text-sm text-gray-500">正在思考...</span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
