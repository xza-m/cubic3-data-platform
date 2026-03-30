import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldMeta, FilterCondition as FilterConditionType } from '@/types/filter'
import FilterCondition from './FilterCondition'

vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <svg data-testid="remove-icon" {...props} />,
  Plus: (props: Record<string, unknown>) => <svg data-testid="add-icon" {...props} />,
}))

vi.mock('@/components/business', () => ({
  FormSelect: ({
    value,
    onChange,
    options,
    placeholder,
    disabled,
    className,
  }: {
    value?: string
    onChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
    disabled?: boolean
    className?: string
  }) => (
    <select
      aria-label={placeholder || '筛选选择器'}
      className={className}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  FormButton: ({
    children,
    onClick,
    className,
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

const fields: FieldMeta[] = [
  {
    physical_name: 'student_name',
    display_name: '学生姓名',
    field_type: 'STRING',
    field_category: 'DIMENSION',
  },
  {
    physical_name: 'total_amount',
    display_name: '订单金额',
    field_type: 'DECIMAL',
    field_category: 'MEASURE',
  },
  {
    physical_name: 'ds',
    display_name: '分区日期',
    field_type: 'DATE',
    field_category: 'PARTITION_KEY',
  },
]

function ControlledCondition({
  initialCondition,
  onConditionChange,
  onRemove,
}: {
  initialCondition: FilterConditionType
  onConditionChange?: (condition: FilterConditionType, partial: Partial<FilterConditionType>) => void
  onRemove?: () => void
}) {
  const [condition, setCondition] = useState<FilterConditionType>(initialCondition)

  return (
    <FilterCondition
      condition={condition}
      fields={fields}
      onChange={(updated) => {
        const next = { ...condition, ...updated }
        setCondition(next)
        onConditionChange?.(next, updated)
      }}
      onRemove={onRemove || vi.fn()}
    />
  )
}

describe('FilterCondition', () => {
  it('切换字段时会重置操作符和值', async () => {
    const user = userEvent.setup()
    const onConditionChange = vi.fn()

    render(
      <ControlledCondition
        initialCondition={{ field: 'student_name', operator: '=', value: 'Alice' }}
        onConditionChange={onConditionChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('选择字段'), 'total_amount')

    expect(onConditionChange).toHaveBeenLastCalledWith(
      { field: 'total_amount', operator: '', value: null },
      { field: 'total_amount', operator: '', value: null },
    )
  })

  it('支持范围、多值和空值操作符的不同输入形态', async () => {
    const user = userEvent.setup()
    const onConditionChange = vi.fn()

    render(
      <ControlledCondition
        initialCondition={{ field: 'total_amount', operator: '', value: null }}
        onConditionChange={onConditionChange}
      />,
    )

    await user.selectOptions(screen.getByLabelText('操作符'), 'BETWEEN')
    const rangeInputs = screen.getAllByRole('spinbutton')
    expect(rangeInputs).toHaveLength(2)

    await user.type(rangeInputs[0], '10')
    await user.type(rangeInputs[1], '20')
    expect(onConditionChange).toHaveBeenLastCalledWith(
      { field: 'total_amount', operator: 'BETWEEN', value: [10, 20] },
      { value: [10, 20] },
    )

    await user.selectOptions(screen.getByLabelText('操作符'), 'IN')
    const multiValueInput = screen.getByPlaceholderText('输入值后回车')
    await user.type(multiValueInput, '42')
    await user.keyboard('{Enter}')
    expect(screen.getByText('42')).toBeInTheDocument()

    await user.click(within(screen.getByText('42').parentElement as HTMLElement).getByRole('button'))
    expect(onConditionChange.mock.calls.some(([, partial]) => Array.isArray(partial.value))).toBe(true)

    await user.selectOptions(screen.getByLabelText('操作符'), 'IS NULL')
    expect(screen.queryByPlaceholderText('输入数值')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('输入值后回车')).not.toBeInTheDocument()
  })

  it('根据字段类型渲染日期输入，并支持删除条件', async () => {
    const user = userEvent.setup()
    const onConditionChange = vi.fn()
    const onRemove = vi.fn()

    render(
      <ControlledCondition
        initialCondition={{ field: 'ds', operator: '', value: null }}
        onConditionChange={onConditionChange}
        onRemove={onRemove}
      />,
    )

    await user.selectOptions(screen.getByLabelText('操作符'), 'BETWEEN')
    const dateInputs = screen.getAllByDisplayValue('')
    expect(dateInputs).toHaveLength(2)

    await user.type(dateInputs[0], '2026-03-01')
    await user.type(dateInputs[1], '2026-03-31')
    expect(onConditionChange).toHaveBeenLastCalledWith(
      { field: 'ds', operator: 'BETWEEN', value: ['2026-03-01', '2026-03-31'] },
      { value: ['2026-03-01', '2026-03-31'] },
    )

    const buttons = screen.getAllByRole('button')
    await user.click(buttons[buttons.length - 1]!)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
