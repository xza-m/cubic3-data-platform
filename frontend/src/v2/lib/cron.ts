export type CronParseResult = {
  ok: boolean
  parts: string[]
  fields: string[]
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
    return cronError([], 'Cron 表达式需要 5 段')
  }
  const specs = [
    { label: '分钟', min: 0, max: 59 },
    { label: '小时', min: 0, max: 23 },
    { label: '日期', min: 1, max: 31 },
    { label: '月份', min: 1, max: 12 },
    { label: '星期', min: 0, max: 6 },
  ]
  for (let i = 0; i < parts.length; i += 1) {
    const message = validateCronField(parts[i], specs[i])
    if (message) return cronError(parts, message)
  }
  return { ok: true, parts, fields: parts, error: '' }
}

export function nextRun(expression: string, from: Date = new Date()): Date | null {
  return nextRuns(expression, 1, from)[0] ?? null
}

export function nextRuns(expression: string, count = 3, from: Date = new Date()): Date[] {
  const parsed = parseCron(expression)
  if (!parsed.ok) return []
  const targetCount = Math.max(0, Math.floor(count))
  const results: Date[] = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let i = 0; results.length < targetCount && i < 366 * 24 * 60; i += 1) {
    if (matchesDate(cursor, parsed.parts)) {
      results.push(new Date(cursor))
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return results
}

function cronError(parts: string[], error: string): CronParseResult {
  return { ok: false, parts, fields: parts, error }
}

function validateCronField(part: string, spec: { label: string; min: number; max: number }): string {
  if (!part || !/^[\d*,/-]+$/.test(part)) return `${spec.label}字段包含不支持的字符`
  const tokens = part.split(',')
  if (tokens.some((token) => token === '')) return `${spec.label}字段包含空列表项`
  for (const token of tokens) {
    const [base, step, extra] = token.split('/')
    if (extra !== undefined || base === '') return `${spec.label}字段格式不正确`
    if (step !== undefined) {
      const stepValue = Number(step)
      if (!Number.isInteger(stepValue) || stepValue <= 0) return `${spec.label}步长必须大于 0`
    }
    const message = validateCronBase(base, spec)
    if (message) return message
  }
  return ''
}

function validateCronBase(base: string, spec: { label: string; min: number; max: number }): string {
  if (base === '*') return ''
  if (base.includes('-')) {
    const [startRaw, endRaw, extra] = base.split('-')
    const start = Number(startRaw)
    const end = Number(endRaw)
    if (extra !== undefined || !Number.isInteger(start) || !Number.isInteger(end)) return `${spec.label}范围格式不正确`
    if (start < spec.min || end > spec.max) return `${spec.label}范围超出 ${spec.min}-${spec.max}`
    if (start > end) return `${spec.label}范围起点不能大于终点`
    return ''
  }
  const value = Number(base)
  if (!Number.isInteger(value)) return `${spec.label}字段必须是数字`
  if (value < spec.min || value > spec.max) return `${spec.label}字段超出 ${spec.min}-${spec.max}`
  return ''
}

function matchesDate(date: Date, parts: string[]): boolean {
  const [minute, hour] = parts
  const [, , dayOfMonth, month, dayOfWeek] = parts
  return (
    matchesCronPart(date.getMinutes(), minute) &&
    matchesCronPart(date.getHours(), hour) &&
    matchesCronPart(date.getDate(), dayOfMonth) &&
    matchesCronPart(date.getMonth() + 1, month) &&
    matchesCronPart(date.getDay(), dayOfWeek)
  )
}

function matchesCronPart(value: number, part: string): boolean {
  return part.split(',').some((token) => {
    const [base, stepRaw] = token.split('/')
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step <= 0) return false
    const [start, end] = cronBaseRange(base)
    return value >= start && value <= end && (value - start) % step === 0
  })
}

function cronBaseRange(base: string): [number, number] {
  if (base === '*') return [0, Number.MAX_SAFE_INTEGER]
  if (base.includes('-')) {
    const [start, end] = base.split('-').map(Number)
    return [start, end]
  }
  const value = Number(base)
  return [value, value]
}
