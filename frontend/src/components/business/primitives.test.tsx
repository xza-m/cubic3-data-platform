import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CSSProperties, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FormInput, FormPassword, FormSearch, FormTextarea } from './FormInput'
import { PageModal } from './PageModal'
import { PageDrawer } from './PageDrawer'
import { PageCard } from './PageCard'

vi.mock('@/components/ui/input', () => ({
  Input: ({
    className,
    ...props
  }: InputHTMLAttributes<HTMLInputElement>) => <input className={className} {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: ({
    className,
    ...props
  }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={className} {...props} />,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: ReactNode
  }) => (open ? (
    <div data-testid="dialog-root">
      <button type="button" onClick={() => onOpenChange?.(false)}>
        关闭对话框
      </button>
      {children}
    </div>
  ) : null),
  DialogContent: ({
    children,
    className,
    style,
  }: {
    children: ReactNode
    className?: string
    style?: CSSProperties
  }) => (
    <div data-testid="dialog-content" className={className} style={style}>
      {children}
    </div>
  ),
  DialogHeader: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: ReactNode
  }) => (open ? (
    <div data-testid="sheet-root">
      <button type="button" onClick={() => onOpenChange?.(false)}>
        关闭抽屉
      </button>
      {children}
    </div>
  ) : null),
  SheetContent: ({
    children,
    className,
    style,
    side,
  }: {
    children: ReactNode
    className?: string
    style?: CSSProperties
    side?: string
  }) => (
    <div data-testid="sheet-content" data-side={side} className={className} style={style}>
      {children}
    </div>
  ),
  SheetHeader: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetFooter: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => <section data-testid="card-root" className={className}>{children}</section>,
  CardHeader: ({ children, className }: { children: ReactNode; className?: string }) => <header className={className}>{children}</header>,
  CardTitle: ({ children, className }: { children: ReactNode; className?: string }) => <h3 className={className}>{children}</h3>,
  CardDescription: ({ children, className }: { children: ReactNode; className?: string }) => <p className={className}>{children}</p>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}))

describe('business primitives', () => {
  it('FormInput、FormPassword、FormSearch 和 FormTextarea 支持字符串回调与事件回退', async () => {
    const user = userEvent.setup()
    const stringChange = vi.fn()
    const eventChange = vi.fn((event: { target: { value: string } }) => event.target.value)
    const textareaChange = vi.fn()

    render(
      <div>
        <FormInput
          id="name"
          value=""
          onChange={stringChange}
          placeholder="请输入名称"
          type="number"
          min={1}
          max={10}
        />
        <FormPassword
          id="password"
          value={undefined}
          onChange={eventChange as unknown as (value: string) => void}
        />
        <FormSearch
          id="keyword"
          value=""
          onChange={stringChange}
          placeholder="搜索任务"
          className="search-extra"
        />
        <FormTextarea
          id="remark"
          value=""
          onChange={textareaChange}
          placeholder="填写备注"
          rows={5}
        />
      </div>,
    )

    const input = screen.getByPlaceholderText('请输入名称')
    const password = screen.getByPlaceholderText('请输入密码')
    const search = screen.getByPlaceholderText('搜索任务')
    const textarea = screen.getByPlaceholderText('填写备注')

    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('min', '1')
    expect(input).toHaveAttribute('max', '10')
    expect(search).toHaveClass('pl-9', 'search-extra')
    expect(textarea).toHaveAttribute('rows', '5')

    await user.type(input, '12')
    await user.type(search, '课堂')
    await user.type(textarea, '备注')
    fireEvent.change(password, { target: { value: 'abc' } })

    expect(stringChange).toHaveBeenCalled()
    expect(eventChange).toHaveBeenCalled()
    const lastEvent = eventChange.mock.calls[eventChange.mock.calls.length - 1]?.[0]
    expect(lastEvent).toEqual(
      expect.objectContaining({
        target: expect.any(Object),
      }),
    )
    expect(textareaChange).toHaveBeenCalled()
  })

  it('PageModal 渲染标题、描述、正文、footer，并在关闭时同时触发 onOpenChange 与 onClose', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onClose = vi.fn()

    render(
      <PageModal
        open
        onOpenChange={onOpenChange}
        onClose={onClose}
        title="创建任务"
        description="请确认配置"
        footer={<button type="button">提交</button>}
        width={480}
        className="custom-modal"
        bodyClassName="custom-body"
      >
        <div>表单内容</div>
      </PageModal>,
    )

    expect(screen.getByText('创建任务')).toBeInTheDocument()
    expect(screen.getByText('请确认配置')).toBeInTheDocument()
    expect(screen.getByText('表单内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument()
    expect(screen.getByTestId('dialog-content')).toHaveClass('sm:max-w-[28rem]', 'custom-modal')
    expect(screen.getByTestId('dialog-content')).toHaveStyle({ maxWidth: '480px' })
    expect(screen.getByText('表单内容').parentElement).toHaveClass('py-5', 'custom-body')

    await user.click(screen.getByRole('button', { name: '关闭对话框' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onClose).toHaveBeenCalled()
  })

  it('PageDrawer 渲染标题、描述、footer 和自定义宽度，并在关闭时透传 onOpenChange', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    render(
      <PageDrawer
        open
        onOpenChange={onOpenChange}
        title="任务详情"
        description="查看执行上下文"
        footer={<button type="button">关闭</button>}
        side="left"
        width={520}
      >
        <div>抽屉内容</div>
      </PageDrawer>,
    )

    expect(screen.getByText('任务详情')).toBeInTheDocument()
    expect(screen.getByText('查看执行上下文')).toBeInTheDocument()
    expect(screen.getByText('抽屉内容')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-content')).toHaveAttribute('data-side', 'left')
    expect(screen.getByTestId('sheet-content')).toHaveStyle({ width: '520px' })

    await user.click(screen.getByRole('button', { name: '关闭抽屉' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('PageCard 在存在头部信息时渲染标题、描述、头部动作和 footer', () => {
    render(
      <PageCard
        title="卡片标题"
        description="卡片描述"
        className="card-shell"
        headerAction={<button type="button">更多操作</button>}
        footer={<button type="button">保存</button>}
      >
        <div>卡片正文</div>
      </PageCard>,
    )

    expect(screen.getByTestId('card-root')).toHaveClass('w-full', 'card-shell')
    expect(screen.getByText('卡片标题')).toBeInTheDocument()
    expect(screen.getByText('卡片描述')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作' })).toBeInTheDocument()
    expect(screen.getByText('卡片正文')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })
})
