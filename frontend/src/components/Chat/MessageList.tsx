import { useEffect, useRef } from 'react'
import { AlertCircle, Bot, Code, Loader2, User } from 'lucide-react'
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
    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
      {messages.map((message) => (
        <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          {message.role === 'assistant' ? (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[0.9rem] bg-slate-900 text-white">
              <Bot className="h-5 w-5" />
            </div>
          ) : null}

          <div className={`max-w-3xl ${message.role === 'user' ? 'order-first' : ''}`}>
            {message.role === 'user' ? (
              <div className="rounded-2xl rounded-tr-sm border border-slate-900 bg-slate-900 px-4 py-3 text-white">
                <p className="text-[0.9375rem] leading-7 whitespace-pre-wrap">{message.content}</p>
                <div className="mt-1 tabular-nums text-[0.75rem] leading-4 text-slate-300">
                  {format(new Date(message.created_at), 'HH:mm')}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {message.content ? (
                  <div className="rounded-2xl rounded-tl-sm border border-[hsl(var(--workbench-outline))] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)]">
                    <p className="text-[0.9375rem] leading-7 text-[hsl(var(--workbench-ink))] whitespace-pre-wrap">{message.content}</p>
                    <div className="mt-1 tabular-nums text-[0.75rem] leading-4 text-[hsl(var(--workbench-muted-foreground))]">
                      {format(new Date(message.created_at), 'HH:mm')}
                    </div>
                  </div>
                ) : null}

                {message.generated_sql ? (
                  <div className="overflow-x-auto rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--workbench-outline))] bg-slate-950 p-4">
                    <div className="mb-2 flex items-center gap-2 text-[0.75rem] leading-4 text-slate-400">
                      <Code className="h-3 w-3" />
                      <span>生成的 SQL</span>
                    </div>
                    <pre className="font-workbench-mono text-[0.875rem] leading-6 text-slate-100">{message.generated_sql}</pre>
                  </div>
                ) : null}

                {message.query_result && message.visualization_config ? (
                  <ChartVisualization
                    data={message.query_result.data}
                    config={{
                      type: message.visualization_config.type,
                      ...message.visualization_config.config,
                    }}
                  />
                ) : null}

                {message.error ? (
                  <div className="rounded-[var(--workbench-radius-sm)] border border-[hsl(var(--semantic-error))]/20 bg-[hsl(var(--semantic-error))]/8 p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[hsl(var(--semantic-error))]" />
                      <div>
                        <div className="mb-1 text-[0.9375rem] font-medium leading-5 text-[hsl(var(--semantic-error))]">处理失败</div>
                        <div className="text-[0.875rem] leading-6 text-[hsl(var(--workbench-ink))]">{message.error}</div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {message.role === 'user' ? (
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[0.9rem] border border-[hsl(var(--workbench-outline))] bg-white text-[hsl(var(--workbench-muted-foreground))]">
              <User className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      ))}

      {loading ? (
        <div className="flex gap-3 justify-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-slate-900 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-[hsl(var(--workbench-outline))] bg-white px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--workbench-accent))]" />
            <span className="text-[0.9375rem] leading-5 text-[hsl(var(--workbench-muted-foreground))]">正在思考...</span>
          </div>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  )
}
