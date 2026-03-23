import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SemanticStatusBanner } from './workbench'

describe('SemanticStatusBanner', () => {
  it('渲染阻塞项、提示和主操作', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <MemoryRouter>
        <SemanticStatusBanner
          summary={{
            status: 'blocked',
            title: '当前存在阻塞项',
            description: '需要先处理字段与发布风险。',
            blockers: ['Join 条件缺失'],
            hints: ['先进入 Inspector 处理关系。'],
            stats: [{ label: '阻塞数', value: 1 }],
          }}
          primaryAction={{ label: '立即处理', onClick }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('semantic-status-banner')).toBeInTheDocument()
    expect(screen.getByText('当前存在阻塞项')).toBeInTheDocument()
    expect(screen.getByText('Join 条件缺失')).toBeInTheDocument()
    expect(screen.getByText('先进入 Inspector 处理关系。')).toBeInTheDocument()

    await user.click(screen.getByTestId('semantic-primary-action'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
