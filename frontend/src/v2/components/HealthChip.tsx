// frontend/src/v2/components/HealthChip.tsx
//
// P22: 应用 / 实例健康状态 chip。
// 后端 health 字段（可选）：'healthy' | 'degraded' | 'unhealthy' | 'down' | 'unknown'
// 字段未返回时，统一按 'unknown' 渲染中性灰底。
//
// 复用 ui/Chip 的样式约定（CSS 变量），保持与 AppStatusChip / InstanceStatusChip 一致的外观。

import { t } from '@v2/i18n'
import type { HealthStatus } from '@v2/api/apps'

interface HealthChipProps {
  health: HealthStatus | null | undefined
}

interface ChipMeta {
  bg: string
  color: string
  label: string
}

function metaOf(health: HealthStatus | null | undefined): ChipMeta {
  switch (health) {
    case 'healthy':
      return {
        bg: 'var(--success-soft)',
        color: 'var(--success)',
        label: t('health.healthy', '健康'),
      }
    case 'degraded':
      return {
        bg: 'var(--warning-soft)',
        color: 'var(--warning)',
        label: t('health.degraded', '降级'),
      }
    case 'unhealthy':
    case 'down':
      return {
        bg: 'var(--danger-soft)',
        color: 'var(--danger)',
        label: t('health.unhealthy', '异常'),
      }
    default:
      return {
        bg: 'var(--bg-surface-2)',
        color: 'var(--text-3)',
        label: t('health.unknown', '健康未知'),
      }
  }
}

export function HealthChip({ health }: HealthChipProps) {
  const meta = metaOf(health)
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-px text-xs font-medium"
      style={{ background: meta.bg, color: meta.color }}
      data-health={health ?? 'unknown'}
      aria-label={t('health.aria_label', '健康状态：{label}', { label: meta.label })}
    >
      {meta.label}
    </span>
  )
}
