import { useMemo, useState, type ReactNode } from 'react'
import { Check, Clipboard, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { formatStructuredValue, type StructuredDetailsFormat } from './structuredDetailsFormat'

interface StructuredDetailsProps {
  title: ReactNode
  value: unknown
  format?: StructuredDetailsFormat
  summary?: ReactNode
  defaultOpen?: boolean
  emptyText?: string
  className?: string
}

export function StructuredDetails({
  title,
  value,
  format = 'json',
  summary,
  defaultOpen = false,
  emptyText = t('structuredDetails.empty', '暂无详情'),
  className = '',
}: StructuredDetailsProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)
  const content = useMemo(() => formatStructuredValue(value, format), [format, value])
  const hasContent = content.trim().length > 0

  async function handleCopy() {
    if (!hasContent || !navigator.clipboard) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div
      className={`rounded-md border ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="mt-0.5 text-3" aria-hidden>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-1">{title}</span>
            {summary ? <span className="mt-1 block text-[11px] leading-4 text-3">{summary}</span> : null}
          </span>
        </button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasContent}
          onClick={() => void handleCopy()}
          aria-label={copied ? t('structuredDetails.copied', '已复制') : t('structuredDetails.copy', '复制详情')}
        >
          {copied ? <Check size={13} aria-hidden /> : <Clipboard size={13} aria-hidden />}
          {copied ? t('structuredDetails.copiedShort', '已复制') : t('structuredDetails.copyShort', '复制')}
        </Button>
      </div>
      {open ? (
        <pre
          className="max-h-72 overflow-auto border-t px-3 py-2 text-[11px] leading-5"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--bg-surface-2)',
            color: 'var(--text-2)',
          }}
        >
          {hasContent ? content : emptyText}
        </pre>
      ) : null}
    </div>
  )
}
