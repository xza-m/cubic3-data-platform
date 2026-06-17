import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RefreshButton } from './CommonControls'

describe('RefreshButton', () => {
  it('异步刷新未完成时立即展示刷新中反馈', async () => {
    let resolveRefresh: () => void = () => {}
    const onClick = vi.fn(() => new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }))

    render(<RefreshButton ariaLabel="刷新数据" onClick={onClick} />)

    const button = screen.getByRole('button', { name: '刷新数据' })
    expect(screen.getByText('刷新')).toHaveStyle({ minWidth: '4em' })
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.getByText('刷新中…')).toHaveStyle({ minWidth: '4em' })

    resolveRefresh()

    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-busy')
      expect(button).not.toBeDisabled()
      expect(screen.getByText('刷新')).toHaveStyle({ minWidth: '4em' })
    })
  })
})
