import { t } from '@v2/i18n'

const TYPE_LABELS: Record<string, string> = {
  maxcompute: 'MaxCompute',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  clickhouse: 'ClickHouse',
}

export function normalizeDatasourceType(type: string | null | undefined): string {
  return String(type ?? '').trim().toLowerCase()
}

export function datasourceTypeLabel(type: string | null | undefined): string {
  const normalized = normalizeDatasourceType(type)
  if (normalized && TYPE_LABELS[normalized]) return TYPE_LABELS[normalized]
  return type || t('datasourceTypes.unknown', '未知类型')
}
