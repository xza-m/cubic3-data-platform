// frontend/src/v2/pages/queries/visual/SqlPreview.tsx
//
// SQL 预览：只读展示 buildSql 的结果 + issues。
// 采用 <pre><code> + 轻量 CSS，不引 Monaco（避免主页面再 lazy 一份）。
// "在 QueryConsole 打开" 会把 SQL + source_id 写入 sessionStorage，然后上层路由跳转。

import { useMemo, useState } from 'react'
import { Copy, ExternalLink, AlertTriangle, Check } from 'lucide-react'
import { t } from '@v2/i18n'

interface SqlPreviewProps {
  sql: string
  issues?: string[]
  onOpenInConsole?: () => void
  disabled?: boolean
}

// 极轻量 SQL 关键字高亮，避免引额外依赖
const KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'BETWEEN',
  'IS',
  'NULL',
  'LIMIT',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'AS',
  'DISTINCT',
  'ASC',
  'DESC',
  'TRUE',
  'FALSE',
]
const KEYWORD_RE = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g')

function highlight(sql: string): Array<{ text: string; kind: 'kw' | 'str' | 'cmt' | 'plain' }> {
  // 简单分词：匹配 keyword / '...' 字符串 / -- 注释 / 其它
  const parts: Array<{ text: string; kind: 'kw' | 'str' | 'cmt' | 'plain' }> = []
  const re = /('(?:[^']|'')*')|(--[^\n]*)|(\b(?:SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|LIMIT|ORDER|BY|GROUP|HAVING|AS|DISTINCT|ASC|DESC|TRUE|FALSE)\b)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    if (m.index > last) parts.push({ text: sql.slice(last, m.index), kind: 'plain' })
    if (m[1]) parts.push({ text: m[1], kind: 'str' })
    else if (m[2]) parts.push({ text: m[2], kind: 'cmt' })
    else if (m[3]) parts.push({ text: m[3], kind: 'kw' })
    last = m.index + m[0].length
  }
  if (last < sql.length) parts.push({ text: sql.slice(last), kind: 'plain' })
  return parts
}

export function SqlPreview({ sql, issues = [], onOpenInConsole, disabled = false }: SqlPreviewProps) {
  const [copied, setCopied] = useState(false)

  const tokens = useMemo(() => highlight(sql), [sql])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 环境不支持 clipboard（例如 jsdom 没有 permission） → 静默降级
      setCopied(false)
    }
  }

  void KEYWORD_RE // 仅保留 keyword 常量作为文档参考

  return (
    <div
      className="flex h-full flex-col rounded border"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      data-testid="v2-sql-preview"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('queryVisual.sqlPreview.title', 'SQL 预览')}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            data-testid="v2-sql-preview-copy"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied
              ? t('queryVisual.sqlPreview.copied', '已复制')
              : t('queryVisual.sqlPreview.copy', '复制')}
          </button>
          {onOpenInConsole && (
            <button
              type="button"
              onClick={onOpenInConsole}
              disabled={disabled}
              className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              data-testid="v2-sql-preview-open-console"
            >
              <ExternalLink className="h-3 w-3" />
              {t('queryVisual.sqlPreview.openInConsole', '在查询控制台打开')}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-3 py-2">
        <pre
          className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed"
          style={{ color: 'var(--text-1)' }}
        >
          <code>
            {tokens.map((tok, i) => {
              if (tok.kind === 'kw')
                return (
                  <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {tok.text}
                  </span>
                )
              if (tok.kind === 'str')
                return (
                  <span key={i} style={{ color: 'var(--success)' }}>
                    {tok.text}
                  </span>
                )
              if (tok.kind === 'cmt')
                return (
                  <span key={i} style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
                    {tok.text}
                  </span>
                )
              return <span key={i}>{tok.text}</span>
            })}
          </code>
        </pre>
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div
          className="border-t px-3 py-2 text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--warning)' }}
          data-testid="v2-sql-preview-issues"
        >
          <div className="mb-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('queryVisual.sqlPreview.issues.title', '待完善：')}
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {issues.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
