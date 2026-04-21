import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MessageInput from './MessageInput'

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    loading,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {loading ? '提交中...' : children}
    </button>
  ),
}))

describe('MessageInput', () => {
  it('点击发送时会去掉首尾空格并清空输入框', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()

    render(<MessageInput onSend={onSend} />)

    const textarea = screen.getByPlaceholderText('输入问题后发送。支持 Shift+Enter 换行。')
    await user.type(textarea, '  帮我分析本周答题趋势  ')
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(onSend).toHaveBeenCalledWith('帮我分析本周答题趋势')
    expect(textarea).toHaveValue('')
  })

  it('回车发送、Shift+Enter 不发送，加载态禁止发送', async () => {
    const onSend = vi.fn()
    const { rerender } = render(<MessageInput onSend={onSend} />)

    const textarea = screen.getByPlaceholderText('输入问题后发送。支持 Shift+Enter 换行。')
    fireEvent.change(textarea, { target: { value: '按回车发送' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledWith('按回车发送')

    rerender(<MessageInput onSend={onSend} />)
    const nextTextarea = screen.getByPlaceholderText('输入问题后发送。支持 Shift+Enter 换行。')
    fireEvent.change(nextTextarea, { target: { value: '保留换行' } })
    fireEvent.keyDown(nextTextarea, { key: 'Enter', shiftKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)

    rerender(<MessageInput onSend={onSend} loading />)
    fireEvent.click(screen.getByRole('button', { name: '提交中...' }))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(screen.getByPlaceholderText('输入问题后发送。支持 Shift+Enter 换行。')).toBeDisabled()
  })
})
