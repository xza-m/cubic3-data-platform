/**
 * 消息输入框组件 - Migrated to shadcn/ui
 */
import { useState, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { FormButton } from '@/components/business'

interface MessageInputProps {
  onSend: (content: string) => void
  loading?: boolean
  disabled?: boolean
}

export default function MessageInput({ onSend, loading, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const trimmed = value.trim()
    if (trimmed && !loading) {
      onSend(trimmed)
      setValue('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex gap-3 items-end">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入您的问题...（Shift+Enter 换行，Enter 发送）&#10;例如：最近7天的总销售额是多少？"
        disabled={disabled || loading}
        className="flex-1 min-h-[80px] max-h-[200px] resize-none rounded-xl px-4 py-3"
        rows={2}
      />
      <FormButton
        size="lg"
        onClick={handleSend}
        loading={loading}
        disabled={disabled || !value.trim()}
        className="h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500"
      >
        <Send className="w-4 h-4 mr-2" />
        发送
      </FormButton>
    </div>
  )
}
