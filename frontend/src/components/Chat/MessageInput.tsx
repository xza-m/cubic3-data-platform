import { useState, type KeyboardEvent } from 'react'
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-end gap-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={'输入问题后发送。支持 Shift+Enter 换行。'}
        disabled={disabled || loading}
        className="min-h-[88px] max-h-[220px] flex-1 resize-none rounded-[var(--workbench-radius)] border-[hsl(var(--workbench-outline))] bg-white px-4 py-3 text-[0.9375rem] leading-7"
        rows={2}
      />
      <FormButton
        onClick={handleSend}
        loading={loading}
        disabled={disabled || !value.trim()}
        className="h-11 rounded-[var(--workbench-radius-sm)] px-4"
      >
        <Send className="mr-2 h-4 w-4" />
        发送
      </FormButton>
    </div>
  )
}
