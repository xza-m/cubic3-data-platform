import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldMeta, FilterGroup as FilterGroupType } from '@/types/filter'
import FilterBuilder from './FilterBuilder'

const filterBuilderMocks = vi.hoisted(() => ({
  generateWhereClause: vi.fn(),
  validateFilterGroup: vi.fn(),
}))

vi.mock('./FilterGroup', () => ({
  default: ({
    group,
    onChange,
    maxDepth,
  }: {
    group: FilterGroupType
    onChange: (group: FilterGroupType) => void
    maxDepth: number
  }) => (
    <div>
      <span>当前逻辑:{group.logic}</span>
      <span>最大深度:{maxDepth}</span>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...group,
            logic: 'OR',
            filters: [...group.filters, { field: 'student_name', operator: '=', value: 'Alice' }],
          })
        }
      >
        更新分组
      </button>
    </div>
  ),
}))

vi.mock('../../utils/sqlGenerator', () => ({
  generateWhereClause: filterBuilderMocks.generateWhereClause,
  validateFilterGroup: filterBuilderMocks.validateFilterGroup,
}))

const fields: FieldMeta[] = [
  {
    physical_name: 'student_name',
    display_name: '学生姓名',
    field_type: 'STRING',
    field_category: 'DIMENSION',
  },
]

describe('FilterBuilder', () => {
  it('在没有传入 value 时使用默认分组，并触发 SQL 与校验回调', () => {
    const onSQLChange = vi.fn()
    const onValidationChange = vi.fn()

    filterBuilderMocks.generateWhereClause.mockReturnValue('WHERE 1=1')
    filterBuilderMocks.validateFilterGroup.mockReturnValue({ valid: false, errors: ['字段未选择'] })

    render(
      <FilterBuilder
        fields={fields}
        maxDepth={4}
        onSQLChange={onSQLChange}
        onValidationChange={onValidationChange}
      />,
    )

    expect(screen.getByText('当前逻辑:AND')).toBeInTheDocument()
    expect(screen.getByText('最大深度:4')).toBeInTheDocument()
    expect(filterBuilderMocks.generateWhereClause).toHaveBeenCalledWith(
      {
        logic: 'AND',
        filters: [{ field: '', operator: '', value: null }],
        groups: [],
      },
      fields,
    )
    expect(onSQLChange).toHaveBeenCalledWith('WHERE 1=1')
    expect(onValidationChange).toHaveBeenCalledWith({ valid: false, errors: ['字段未选择'] })
  })

  it('透传已有 value，并在子组件变更后回调上抛', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSQLChange = vi.fn()

    filterBuilderMocks.generateWhereClause.mockReturnValue('WHERE student_name = ?')
    filterBuilderMocks.validateFilterGroup.mockReturnValue({ valid: true, errors: [] })

    render(
      <FilterBuilder
        fields={fields}
        value={{
          logic: 'AND',
          filters: [{ field: 'student_name', operator: '=', value: 'Tom' }],
          groups: [],
        }}
        onChange={onChange}
        onSQLChange={onSQLChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '更新分组' }))
    expect(onChange).toHaveBeenCalledWith({
      logic: 'OR',
      filters: [
        { field: 'student_name', operator: '=', value: 'Tom' },
        { field: 'student_name', operator: '=', value: 'Alice' },
      ],
      groups: [],
    })
    expect(onSQLChange).toHaveBeenCalledWith('WHERE student_name = ?')
  })
})
