import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InputHTMLAttributes, ReactNode } from 'react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FormSelect, type FormSelectOption } from './FormSelect'

vi.mock('lucide-react', () => ({
  Search: (props: Record<string, unknown>) => <svg data-testid="search-icon" {...props} />,
}))

vi.mock('@/components/ui/input', () => ({
  Input: ({
    className,
    ...props
  }: InputHTMLAttributes<HTMLInputElement>) => <input className={className} {...props} />,
}))

vi.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<{
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
  }>({})

  return {
    Select: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value?: string
      onValueChange?: (value: string) => void
      disabled?: boolean
      children: ReactNode
    }) => (
      <SelectContext.Provider value={{ value, onValueChange, disabled }}>
        <div data-testid="select-root" data-disabled={disabled ? 'true' : 'false'}>
          {children}
        </div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({
      children,
      className,
      id,
    }: {
      children: ReactNode
      className?: string
      id?: string
    }) => (
      <button type="button" data-testid="select-trigger" className={className} id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => {
      const context = React.useContext(SelectContext)
      return <span>{context.value ?? placeholder}</span>
    },
    SelectContent: ({ children }: { children: ReactNode }) => (
      <div data-testid="select-content">{children}</div>
    ),
    SelectItem: ({
      children,
      value,
      disabled,
    }: {
      children: ReactNode
      value: string
      disabled?: boolean
    }) => {
      const context = React.useContext(SelectContext)
      return (
        <button
          type="button"
          disabled={disabled || context.disabled}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
  }
})

describe('FormSelect', () => {
  const options: FormSelectOption[] = [
    { label: '课堂日报', value: 'daily-report', badge: '推荐' },
    { label: '作业分析', value: 'homework-analysis', desc: '按班级查看' },
    { label: '禁用选项', value: 'disabled-option', disabled: true },
  ]

  it('透传 placeholder、className、id 与 disabled 属性', () => {
    render(
      <FormSelect
        value={undefined}
        options={options}
        placeholder="请选择报表"
        className="select-shell"
        id="report-select"
        disabled
      />,
    )

    expect(screen.getByTestId('select-root')).toHaveAttribute('data-disabled', 'true')
    expect(screen.getByTestId('select-trigger')).toHaveAttribute('id', 'report-select')
    expect(screen.getByTestId('select-trigger')).toHaveClass('select-shell')
    expect(screen.getByText('请选择报表')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '禁用选项' })).toBeDisabled()
  })

  it('优先使用 onValueChange，并支持 renderOption 自定义渲染', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <FormSelect
        value="daily-report"
        options={options}
        onValueChange={onValueChange}
        renderOption={(option) => (
          <div>
            <span>{option.label}</span>
            {option.badge ? <strong>{option.badge}</strong> : null}
            {option.desc ? <small>{option.desc}</small> : null}
          </div>
        )}
      />,
    )

    expect(screen.getByText('daily-report')).toBeInTheDocument()
    expect(screen.getByText('推荐')).toBeInTheDocument()
    expect(screen.getByText('按班级查看')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /作业分析/ }))
    expect(onValueChange).toHaveBeenCalledWith('homework-analysis')
  })

  it('在缺少 onValueChange 时回退到 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <FormSelect
        value=""
        options={options}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '课堂日报' }))
    expect(onChange).toHaveBeenCalledWith('daily-report')
  })

  it('支持搜索过滤，并在无匹配项时显示空态', async () => {
    render(
      <FormSelect
        value=""
        options={options}
        searchable
      />,
    )

    const searchInput = screen.getByPlaceholderText('搜索...')

    fireEvent.change(searchInput, { target: { value: 'homework' } })
    expect(screen.getByRole('button', { name: '作业分析' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '课堂日报' })).not.toBeInTheDocument()

    fireEvent.change(searchInput, { target: { value: 'missing' } })
    expect(screen.getByText('没有找到匹配项')).toBeInTheDocument()
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })
})
