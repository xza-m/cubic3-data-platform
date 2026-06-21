// frontend/src/v2/pages/config/_shared/event-labels.ts
//
// 后端事件 code 面向机器，前端列表和详情默认展示业务可读中文。

export const EVENT_TYPE_LABELS: Record<string, string> = {
  'app.instance.created': '应用实例创建',
  'app.instance.enabled': '应用实例启用',
  'app.instance.disabled': '应用实例停用',
  'app.instance.deleted': '应用实例删除',
  'app.execution.started': '应用开始执行',
  'app.execution.completed': '应用执行完成',
  'app.execution.failed': '应用执行失败',
  'extraction.completed': '数据提取完成',
  'extraction.failed': '数据提取失败',
}

export const SUBSCRIPTION_EVENT_OPTIONS = [
  'app.execution.completed',
  'app.execution.failed',
  'app.execution.started',
  'extraction.completed',
  'extraction.failed',
  'app.instance.created',
  'app.instance.enabled',
  'app.instance.disabled',
  'app.instance.deleted',
].map((value) => ({
  value,
  label: EVENT_TYPE_LABELS[value] ?? '未知事件',
}))

export function eventTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return EVENT_TYPE_LABELS[value] ?? '未知事件'
}
