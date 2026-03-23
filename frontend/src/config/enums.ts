/**
 * 前端统一枚举值管理
 * 集中管理前端枚举值，避免硬编码分散在各个页面
 */

// ============================================================================
// 执行状态枚举
// ============================================================================

export const EXECUTION_STATUSES = [
  { value: 'pending', label: '等待中', color: 'blue' },
  { value: 'running', label: '运行中', color: 'yellow' },
  { value: 'success', label: '成功', color: 'green' },
  { value: 'failed', label: '失败', color: 'red' }
] as const

export type ExecutionStatus = typeof EXECUTION_STATUSES[number]['value']

// ============================================================================
// 触发类型枚举
// ============================================================================

export const TRIGGER_TYPES = [
  { value: 'scheduled', label: '定时触发' },
  { value: 'manual', label: '手动触发' },
  { value: 'event', label: '事件触发' }
] as const

export type TriggerType = typeof TRIGGER_TYPES[number]['value']

// ============================================================================
// 任务类型枚举
// ============================================================================

export const TASK_TYPES = [
  { value: 'manual', label: '手动执行' },
  { value: 'scheduled', label: '定时执行' },
  { value: 'event', label: '事件触发' }
] as const

export type TaskType = typeof TASK_TYPES[number]['value']

// ============================================================================
// 同步状态枚举
// ============================================================================

export const SYNC_STATUSES = [
  { value: 'synced', label: '已同步', color: 'green' },
  { value: 'syncing', label: '同步中', color: 'blue' },
  { value: 'failed', label: '失败', color: 'red' }
] as const

export type SyncStatus = typeof SYNC_STATUSES[number]['value']

// ============================================================================
// 调度类型枚举
// ============================================================================

export const SCHEDULE_TYPES = [
  { value: 'cron', label: 'Cron 表达式' },
  { value: 'event', label: '事件触发' },
  { value: 'manual', label: '手动执行' }
] as const

export type ScheduleType = typeof SCHEDULE_TYPES[number]['value']

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取执行状态标签
 */
export const getStatusLabel = (status: string): string => {
  return EXECUTION_STATUSES.find(s => s.value === status)?.label || status
}

/**
 * 获取执行状态颜色
 */
export const getStatusColor = (status: string): string => {
  return EXECUTION_STATUSES.find(s => s.value === status)?.color || 'gray'
}

/**
 * 获取触发类型标签
 */
export const getTriggerTypeLabel = (type: string): string => {
  return TRIGGER_TYPES.find(t => t.value === type)?.label || type
}

/**
 * 获取同步状态标签
 */
export const getSyncStatusLabel = (status: string): string => {
  return SYNC_STATUSES.find(s => s.value === status)?.label || status
}

/**
 * 获取同步状态颜色
 */
export const getSyncStatusColor = (status: string): string => {
  return SYNC_STATUSES.find(s => s.value === status)?.color || 'gray'
}
