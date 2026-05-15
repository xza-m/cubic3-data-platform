// frontend/src/v2/components/LoadState.tsx
//
// 页面局部加载失败态。只抽取“错误信息 + 可重试”这个稳定模式；
// 空态、详情摘要、上下文面板仍留在各自业务组件中，避免过度泛化。

import type { ReactNode } from 'react'
import { RefreshButton } from '@v2/components/CommonControls'
import { cn } from '@v2/lib/cn'
import { t } from '@v2/i18n'

export function RetryState({
  message,
  onRetry,
  retryLabel = t('action.retry', '重试'),
  retryLoadingLabel = t('action.retrying', '重试中…'),
  retryAriaLabel,
  className,
}: {
  message: ReactNode
  onRetry: () => unknown
  retryLabel?: string
  retryLoadingLabel?: string
  retryAriaLabel?: string
  className?: string
}) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-2', className)}>
      <p className="text-xs" style={{ color: 'var(--danger)' }}>
        {message}
      </p>
      <RefreshButton
        onClick={onRetry}
        label={retryLabel}
        loadingLabel={retryLoadingLabel}
        ariaLabel={retryAriaLabel ?? retryLabel}
      />
    </div>
  )
}
