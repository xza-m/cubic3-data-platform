import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConversationList from './ConversationList'

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    className,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    className,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))

describe('ConversationList', () => {
  it('空态下展示提示并支持新建对话', async () => {
    const user = userEvent.setup()
    const onNew = vi.fn()

    render(
      <ConversationList
        conversations={[]}
        onSelect={vi.fn()}
        onNew={onNew}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('暂无对话')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建对话' }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('支持选择并删除会话', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onDelete = vi.fn()

    render(
      <ConversationList
        conversations={[
          {
            id: 1,
            title: '高频问题排查',
            dataset_id: 101,
            dataset_name: '学生答题明细',
            user_id: 'tester',
            context: {},
            created_at: '2026-03-26T10:00:00Z',
            updated_at: '2026-03-26T10:30:00Z',
            message_count: 4,
          },
        ]}
        currentId={1}
        onSelect={onSelect}
        onNew={vi.fn()}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('高频问题排查')).toBeInTheDocument()
    expect(screen.getByText('学生答题明细')).toBeInTheDocument()
    expect(screen.getByText(/4 条消息/)).toBeInTheDocument()

    await user.click(screen.getByTestId('conversation-row-1'))
    expect(onSelect).toHaveBeenCalledWith(1)

    await user.click(screen.getByLabelText('删除对话'))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})
