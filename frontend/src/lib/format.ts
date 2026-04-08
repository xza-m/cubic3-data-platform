const numberFormatter = new Intl.NumberFormat('zh-CN')

export function fmtNumber(n: number): string {
  return numberFormatter.format(n)
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function fmtDate(dateStr: string | Date | undefined): string {
  if (!dateStr) return '—'
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  if (isNaN(d.getTime())) return '—'
  return dateTimeFormatter.format(d)
}
