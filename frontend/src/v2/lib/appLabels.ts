import { t } from '@v2/i18n'

export function appCodeLabel(code: string | null | undefined): string {
  const normalized = String(code ?? '').trim()
  if (!normalized) return t('app.unknown', '未知应用')
  const knownLabel = knownAppCodeLabel(normalized)
  if (knownLabel) return knownLabel
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function appCategoryLabel(category: string | null | undefined): string {
  const normalized = String(category ?? '').trim()
  if (!normalized) return t('app.category.other', '其他应用')
  const knownLabel = knownCategoryLabel(normalized)
  if (knownLabel) return knownLabel
  return t('app.category.other', '其他应用')
}

export function appInstanceAppLabel(instance: {
  app_code?: string | null
  app?: { name?: string | null } | null
}): string {
  return instance.app?.name?.trim() || appCodeLabel(instance.app_code)
}

function knownAppCodeLabel(code: string): string | null {
  switch (code) {
    case 'data_agent':
      return t('app.label.data_agent', 'DataAgent 智能问数')
    case 'bi_panel_push':
      return t('app.label.bi_panel_push', 'BI 看板推送')
    case 'anomaly_monitor':
      return t('app.label.anomaly_monitor', '异常数据监控')
    case 'extract_notice':
      return t('app.label.extract_notice', '数据提取通知')
    case 'dataset_card_push':
      return t('app.label.dataset_card_push', '数据集卡片推送')
    case 'result_push':
      return t('app.label.result_push', '查询结果推送')
    case 'weekly_report':
      return t('app.label.weekly_report', '周报推送')
    case 'schema_drift_monitor':
      return t('app.label.schema_drift_monitor', 'Schema Drift 检测')
    case 'table_cache_refresh':
      return t('app.label.table_cache_refresh', '表缓存刷新')
    case 'teaching_assistant':
      return t('app.label.teaching_assistant', '教学助手')
    default:
      return null
  }
}

function knownCategoryLabel(category: string): string | null {
  switch (category) {
    case 'agent':
      return t('app.category.agent', 'Agent')
    case 'bi_integration':
      return t('app.category.bi_integration', 'BI 集成')
    case 'data_alert':
      return t('app.category.data_alert', '数据告警')
    case 'data_notice':
      return t('app.category.data_notice', '数据通知')
    case 'data_report':
      return t('app.category.data_report', '数据报告')
    case 'system_maintenance':
      return t('app.category.system_maintenance', '系统维护')
    default:
      return null
  }
}
