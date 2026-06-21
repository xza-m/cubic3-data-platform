import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { t } from '@v2/i18n'

interface TechnicalValueProps {
  value: string | number | null | undefined
  label?: string
  className?: string
}

export function TechnicalValue({ value, label, className = '' }: TechnicalValueProps) {
  const [copied, setCopied] = useState(false)
  const text = value == null || value === '' ? '—' : String(value)

  async function handleCopy(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (text === '—' || !navigator.clipboard) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <span className={`inline-flex max-w-full items-center gap-1 text-[11px] text-3 ${className}`} title={text}>
      {label ? <span className="shrink-0">{label}</span> : null}
      <code className="truncate font-mono">{text}</code>
      {text !== '—' ? (
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-3 hover:bg-[color:var(--bg-hover)] hover:text-1"
          onClick={(event) => void handleCopy(event)}
          aria-label={copied ? t('technicalValue.copied', '已复制') : t('technicalValue.copy', '复制技术标识')}
        >
          {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
        </button>
      ) : null}
    </span>
  )
}

