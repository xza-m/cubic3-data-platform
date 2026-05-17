import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Edit3 } from 'lucide-react'
import { ActionIconButton } from './ActionIconButton'

describe('ActionIconButton', () => {
  it('只展示图标但保留可访问名称和 hover 提示', () => {
    render(
      <ActionIconButton label="编辑" icon={Edit3} onClick={() => {}} />,
    )

    const button = screen.getByRole('button', { name: '编辑' })
    expect(button).toBeInTheDocument()
    expect(screen.queryByText('编辑')).not.toBeInTheDocument()

    fireEvent.mouseEnter(button.parentElement as HTMLElement)
    expect(screen.getByRole('tooltip')).toHaveTextContent('编辑')
  })
})
