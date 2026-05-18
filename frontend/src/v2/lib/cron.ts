export type CronParseResult = {
  ok: boolean
  parts: string[]
  error: string
}

export function cronPresets(): Array<{ label: string; value: string }> {
  return [
    { label: '每天 08:00', value: '0 8 * * *' },
    { label: '工作日 08:00', value: '0 8 * * 1-5' },
    { label: '每小时', value: '0 * * * *' },
  ]
}

export function parseCron(expression: string): CronParseResult {
  const parts = expression.trim().split(/\s+/).filter(Boolean)
  if (parts.length !== 5) {
    return { ok: false, parts: [], error: 'Cron 表达式需要 5 段' }
  }
  const valid = parts.every((part) => /^[\d*,/-]+$/.test(part))
  if (!valid) {
    return { ok: false, parts: [], error: 'Cron 表达式包含不支持的字符' }
  }
  return { ok: true, parts, error: '' }
}

export function nextRuns(expression: string, count = 3, from: Date = new Date()): Date[] {
  const parsed = parseCron(expression)
  if (!parsed.ok) return []
  const [minutePart, hourPart] = parsed.parts
  const minute = parseFirstNumber(minutePart, 0, 59)
  const hour = parseFirstNumber(hourPart, 0, 23)
  if (minute === null || hour === null) return []

  const results: Date[] = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let i = 0; results.length < count && i < 366 * 24 * 60; i += 1) {
    if (cursor.getMinutes() === minute && cursor.getHours() === hour && matchesDayParts(cursor, parsed.parts)) {
      results.push(new Date(cursor))
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return results
}

function parseFirstNumber(part: string, min: number, max: number): number | null {
  if (part === '*') return min
  const match = part.match(/\d+/)
  if (!match) return null
  const value = Number(match[0])
  if (!Number.isInteger(value) || value < min || value > max) return null
  return value
}

function matchesDayParts(date: Date, parts: string[]): boolean {
  const [, , dayOfMonth, month, dayOfWeek] = parts
  return (
    matchesCronPart(date.getDate(), dayOfMonth) &&
    matchesCronPart(date.getMonth() + 1, month) &&
    matchesCronPart(date.getDay(), dayOfWeek)
  )
}

function matchesCronPart(value: number, part: string): boolean {
  if (part === '*') return true
  return part.split(',').some((token) => {
    if (token.includes('-')) {
      const [start, end] = token.split('-').map(Number)
      return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end
    }
    return Number(token) === value
  })
}
