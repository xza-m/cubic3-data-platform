// frontend/src/v2/pages/config/_shared/event-labels.ts
//
// 后端事件 code 面向机器，前端列表和详情默认展示业务可读中文。

export const EVENT_TYPE_LABELS: Record<string, string> = {
  'app.execution.started': '应用开始执行',
  'app.execution.completed': '应用执行完成',
  'app.execution.failed': '应用执行失败',
  'app.execution.cancelled': '应用执行取消',
  'app.execution.timeout': '应用执行超时',
  'app.execution.success': '应用执行成功',
  'query.execution.started': '查询开始执行',
  'query.execution.completed': '查询执行完成',
  'query.execution.failed': '查询执行失败',
  'query.scheduled.triggered': '调度查询已触发',
  'query.scheduled.completed': '调度查询完成',
  'query.scheduled.failed': '调度查询失败',
}

export function eventTypeLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return EVENT_TYPE_LABELS[value] ?? value
}
