type DateInput = Date | string | number | null | undefined

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function fmtNum(value: number | string | null | undefined, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return new Intl.NumberFormat('zh-CN').format(numeric)
}

export function fmtPercent(value: number | string | null | undefined, digits = 1, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return `${(numeric * 100).toFixed(digits)}%`
}

export function fmtDate(value: DateInput, fallback = '-'): string {
  const date = toDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function fmtDateTime(value: DateInput, fallback = '-'): string {
  const date = toDate(value)
  if (!date) return fallback
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function fmtRelative(value: DateInput, nowOrFallback: Date | string = new Date(), fallback = '-'): string {
  const now = nowOrFallback instanceof Date ? nowOrFallback : new Date()
  const emptyFallback = typeof nowOrFallback === 'string' ? nowOrFallback : fallback
  const date = toDate(value)
  if (!date) return emptyFallback
  const diffMs = date.getTime() - now.getTime()
  const absMs = Math.abs(diffMs)
  const second = 1000
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (absMs < minute) return `${Math.max(1, Math.round(absMs / second))} 秒${diffMs < 0 ? '前' : '后'}`
  if (absMs < hour) return `${Math.round(absMs / minute)} 分钟${diffMs < 0 ? '前' : '后'}`
  if (absMs < day) return `${Math.round(absMs / hour)} 小时${diffMs < 0 ? '前' : '后'}`
  if (absMs < 30 * day) return `${Math.round(absMs / day)} 天${diffMs < 0 ? '前' : '后'}`
  return fmtDateTime(date)
}
