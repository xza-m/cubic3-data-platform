import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RetryState } from './LoadState'

describe('RetryState', () => {
  it('展示错误信息并复用刷新按钮的异步反馈', async () => {
    let resolveRetry: () => void = () => {}
    const onRetry = vi.fn(() => new Promise<void>((resolve) => {
      resolveRetry = resolve
    }))

    render(
      <RetryState
        message="加载失败"
        onRetry={onRetry}
        retryAriaLabel="重试加载数据"
      />,
    )

    expect(screen.getByText('加载失败')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: '重试加载数据' })
    fireEvent.click(button)

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.getByText('重试中…')).toBeInTheDocument()

    resolveRetry()

    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-busy')
      expect(button).not.toBeDisabled()
    })
  })
})
