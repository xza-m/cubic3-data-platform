import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AsyncTaskNotice } from './AsyncTaskNotice'

describe('AsyncTaskNotice', () => {
  it.each([
    ['loading', 'status', 'polite'],
    ['empty', 'status', 'polite'],
    ['ready', 'status', 'polite'],
  ] as const)('tone=%s 时使用 %s 与 aria-live=%s', (tone, role, ariaLive) => {
    render(
      <AsyncTaskNotice
        tone={tone}
        title="任务提示"
        description="请稍候"
      />,
    )

    expect(screen.getByRole(role)).toHaveAttribute('aria-live', ariaLive)
  })

  it('error 状态使用 alert 语义', () => {
    render(
      <AsyncTaskNotice
        tone="error"
        title="任务失败"
        description="后端暂时不可用"
      />,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
