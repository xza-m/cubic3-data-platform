import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldMeta, FilterGroup as FilterGroupType } from '@/types/filter'
import FilterGroup from './FilterGroup'

vi.mock('lucide-react', () => ({
  Plus: (props: Record<string, unknown>) => <svg data-testid="plus-icon" {...props} />,
  Trash2: (props: Record<string, unknown>) => <svg data-testid="trash-icon" {...props} />,
}))

vi.mock('./FilterCondition', () => ({
  default: ({
    condition,
    onChange,
    onRemove,
  }: {
    condition: { field: string }
    onChange: (updated: { field: string }) => void
    onRemove: () => void
  }) => (
    <div data-testid="filter-condition">
      <span>{condition.field || '空条件'}</span>
      <button type="button" onClick={() => onChange({ field: 'updated_field' })}>
        更新条件
      </button>
      <button type="button" onClick={onRemove}>
        删除条件
      </button>
    </div>
  ),
}))

vi.mock('@/components/business', () => ({
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

const fields: FieldMeta[] = [
  {
    physical_name: 'student_name',
    display_name: '学生姓名',
    field_type: 'STRING',
    field_category: 'DIMENSION',
  },
]

function ControlledGroup({
  initialGroup,
  depth = 0,
  maxDepth = 2,
  showParentLogic = false,
  onGroupChange,
  onRemove,
}: {
  initialGroup: FilterGroupType
  depth?: number
  maxDepth?: number
  showParentLogic?: boolean
  onGroupChange?: (group: FilterGroupType) => void
  onRemove?: () => void
}) {
  const [group, setGroup] = useState(initialGroup)

  return (
    <FilterGroup
      group={group}
      fields={fields}
      depth={depth}
      maxDepth={maxDepth}
      showParentLogic={showParentLogic}
      onRemove={onRemove}
      onChange={(updated) => {
        setGroup(updated)
        onGroupChange?.(updated)
      }}
    />
  )
}

describe('FilterGroup', () => {
  it('支持切换逻辑、添加条件和添加子分组', async () => {
    const user = userEvent.setup()
    const onGroupChange = vi.fn()

    render(
      <ControlledGroup
        initialGroup={{
          logic: 'AND',
          filters: [{ field: '', operator: '', value: null }],
          groups: [],
        }}
        onGroupChange={onGroupChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'OR' }))
    expect(onGroupChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ logic: 'OR' }),
    )

    await user.click(screen.getByRole('button', { name: /添加条件/ }))
    expect(onGroupChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: [
          { field: '', operator: '', value: null },
          { field: '', operator: '', value: null },
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: /添加分组/ }))
    expect(onGroupChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        groups: [
          {
            logic: 'AND',
            filters: [{ field: '', operator: '', value: null }],
            groups: [],
            parentLogic: 'OR',
          },
        ],
      }),
    )
  })

  it('支持更新条件、删除条件并展示空状态', async () => {
    const user = userEvent.setup()

    render(
      <ControlledGroup
        initialGroup={{
          logic: 'AND',
          filters: [{ field: '', operator: '', value: null }],
          groups: [],
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: '更新条件' }))
    expect(screen.getByText('updated_field')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除条件' }))
    expect(screen.getByText('点击"添加条件"或"添加分组"开始配置')).toBeInTheDocument()
  })

  it('子分组支持切换与父组关系和删除分组', async () => {
    const user = userEvent.setup()
    const onGroupChange = vi.fn()
    const onRemove = vi.fn()

    render(
      <ControlledGroup
        depth={1}
        showParentLogic
        onRemove={onRemove}
        onGroupChange={onGroupChange}
        initialGroup={{
          logic: 'AND',
          parentLogic: 'AND',
          filters: [{ field: '', operator: '', value: null }],
          groups: [],
        }}
      />,
    )

    const orButtons = screen.getAllByRole('button', { name: 'OR' })
    await user.click(orButtons[0])
    expect(onGroupChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentLogic: 'OR' }),
    )

    await user.click(screen.getByRole('button', { name: /删除分组/ }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
