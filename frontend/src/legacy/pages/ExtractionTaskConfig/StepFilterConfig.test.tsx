import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StepFilterConfig from './StepFilterConfig'

vi.mock('../../components/FilterBuilder', () => ({
  FilterBuilder: ({
    onChange,
    onSQLChange,
    onValidationChange,
  }: {
    onChange?: (value: any) => void
    onSQLChange?: (sql: string) => void
    onValidationChange?: (value: { valid: boolean; errors: string[] }) => void
  }) => (
    <div data-testid="filter-builder">
      <button
        type="button"
        onClick={() => {
          onChange?.({
            logic: 'OR',
            filters: [{ field: 'user_id', operator: '=', value: '1001' }],
            groups: [],
          })
          onSQLChange?.('WHERE user_id = 1001')
          onValidationChange?.({ valid: true, errors: [] })
        }}
      >
        生成有效条件
      </button>
      <button
        type="button"
        onClick={() => {
          onSQLChange?.('WHERE answer_count >')
          onValidationChange?.({ valid: false, errors: ['答题次数缺少阈值'] })
        }}
      >
        生成错误条件
      </button>
    </div>
  ),
}))

const sampleFields = [
  {
    physical_name: 'user_id',
    display_name: '学生',
    field_type: 'BIGINT',
    field_category: 'DIMENSION' as const,
  },
]

describe('StepFilterConfig', () => {
  it('无字段时展示返回上一步提示和默认 SQL', () => {
    render(
      <StepFilterConfig
        fields={[]}
        filterConditions={{ logic: 'AND', filters: [], groups: [] }}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.getByText('无可用字段')).toBeInTheDocument()
    expect(screen.getByText('请返回上一步选择数据集和字段')).toBeInTheDocument()
    expect(screen.getByText('WHERE 1=1 -- 暂无过滤条件')).toBeInTheDocument()
    expect(screen.getByText('过滤条件配置正确，可以继续下一步')).toBeInTheDocument()
  })

  it('生成有效条件时更新 SQL 预览和成功校验', async () => {
    const user = userEvent.setup()
    const onFilterChange = vi.fn()

    render(
      <StepFilterConfig
        fields={sampleFields}
        filterConditions={{ logic: 'AND', filters: [], groups: [] }}
        onFilterChange={onFilterChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '生成有效条件' }))
    expect(onFilterChange).toHaveBeenCalledWith({
      logic: 'OR',
      filters: [{ field: 'user_id', operator: '=', value: '1001' }],
      groups: [],
    })
    expect(screen.getByText('WHERE user_id = 1001')).toBeInTheDocument()
    expect(screen.getByText('过滤条件配置正确，可以继续下一步')).toBeInTheDocument()
  })

  it('生成错误条件时展示错误列表', async () => {
    const user = userEvent.setup()

    render(
      <StepFilterConfig
        fields={sampleFields}
        filterConditions={{ logic: 'AND', filters: [], groups: [] }}
        onFilterChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '生成错误条件' }))
    expect(screen.getByText('发现以下问题：')).toBeInTheDocument()
    expect(screen.getByText('答题次数缺少阈值')).toBeInTheDocument()
    expect(screen.getByText('WHERE answer_count >')).toBeInTheDocument()
  })
})
