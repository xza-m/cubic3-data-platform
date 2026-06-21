export function accessExecutionProfileLabel(value: string | null | undefined): string {
  const normalized = normalizeKey(value)
  const labels: Record<string, string> = {
    mc_m0_reader: '基础数据读取',
    mc_m1_reader: '汇总数据读取',
    mc_m2_detail_reader: '明细数据读取',
    m3_raw_block: '原始敏感数据限制',
  }
  return labels[normalized] ?? humanizeTechnicalValue(value, '未配置执行方式')
}

export function dataTriggerLabel(value: string | null | undefined): string {
  const normalized = normalizeKey(value)
  const labels: Record<string, string> = {
    manual: '手动触发',
    scheduled: '调度触发',
    api: '接口触发',
    system: '系统触发',
  }
  return labels[normalized] ?? humanizeTechnicalValue(value, '未知触发')
}

export function technicalIdLabel(prefix: string, value: string | number | null | undefined): string {
  if (value == null || value === '') return `${prefix}未记录`
  return `${prefix}${value}`
}

export function humanizeTechnicalValue(value: string | null | undefined, fallback = '未配置'): string {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

