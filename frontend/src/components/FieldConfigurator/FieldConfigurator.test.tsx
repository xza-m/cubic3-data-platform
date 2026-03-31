import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FieldConfigurator from './FieldConfigurator'

const fieldConfiguratorMocks = vi.hoisted(() => ({
  analyzeFields: vi.fn(),
}))

vi.mock('@/utils/fieldRecognition', () => ({
  analyzeFields: fieldConfiguratorMocks.analyzeFields,
}))

vi.mock('@/components/business', async () => {
  const React = await vi.importActual<typeof import('react')>('react')
  return {
    DataTable: ({
      columns,
      data,
    }: {
      columns: Array<Record<string, unknown>>
      data: Array<Record<string, unknown>>
    }) => (
      <table>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index}>{String(column.header ?? column.id ?? column.accessorKey ?? '')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => {
                const renderCell = column.cell as
                  | ((ctx: { row: { original: Record<string, unknown>; getValue: (key: string) => unknown } }) => React.ReactNode)
                  | undefined
                const accessorKey = column.accessorKey as string | undefined
                const content = renderCell
                  ? renderCell({
                      row: {
                        original: row,
                        getValue: (key: string) => row[key],
                      },
                    })
                  : accessorKey
                    ? row[accessorKey]
                    : null

                return <td key={columnIndex}>{content as React.ReactNode}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    FormSelect: ({
      value,
      onChange,
      options,
      placeholder,
    }: {
      value?: string
      onChange?: (value: string) => void
      options: Array<{ value: string; label: string }>
      placeholder?: string
    }) => (
      <select
        aria-label={placeholder || '字段配置选择'}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('FieldConfigurator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fieldConfiguratorMocks.analyzeFields.mockResolvedValue?.([])
  })

  it('优先使用后端识别结果初始化字段配置并展示统计信息', async () => {
    const onConfigChange = vi.fn()

    render(
      <FieldConfigurator
        fields={[
          {
            name: 'mobile',
            type: 'STRING',
            comment: '用户手机号',
            display_name: '手机号',
            business_type: 'dimension',
            sensitivity_level: 'pii',
            mask_rule: 'mobile',
            confidence_score: 0.92,
            matched_rules: ['字段名匹配敏感模式: mobile'],
            auto_recognized: true,
          },
          {
            name: 'ds',
            type: 'DATE',
            business_type: 'partition',
            sensitivity_level: 'public',
            confidence_score: 0.45,
            matched_rules: ['字段名符合分区特征'],
          },
        ]}
        onConfigChange={onConfigChange}
      />,
    )

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledTimes(1)
    })
    expect(fieldConfiguratorMocks.analyzeFields).not.toHaveBeenCalled()
    expect(screen.getByText('总字段数')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('敏感字段')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('手机号')).toBeInTheDocument()
    expect(screen.getByText('用户手机号')).toBeInTheDocument()
    expect(screen.getByText('无')).toBeInTheDocument()
    expect(screen.getAllByText('字段名匹配敏感模式: mobile').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('字段名符合分区特征').length).toBeGreaterThanOrEqual(1)

    const firstCall = onConfigChange.mock.calls[0]?.[0]
    expect(firstCall).toEqual([
      expect.objectContaining({
        physical_name: 'mobile',
        display_name: '手机号',
        business_type: 'dimension',
        sensitivity_level: 'pii',
        mask_rule: 'mobile',
        auto_recognized: true,
      }),
      expect.objectContaining({
        physical_name: 'ds',
        display_name: 'ds',
        business_type: 'partition',
        sensitivity_level: 'public',
      }),
    ])
  })

  it('没有后端识别结果时会走前端兜底识别，并避免相同输入重复初始化', async () => {
    const onConfigChange = vi.fn()
    fieldConfiguratorMocks.analyzeFields.mockReturnValue([
      {
        name: 'order_amount',
        type: 'DECIMAL',
        analysis: {
          business_type: 'metric',
          sensitivity_level: 'confidential',
          mask_rule: 'amount',
          confidence: 0.88,
          reasons: ['字段描述命中金额关键词'],
        },
      },
    ])

    const { rerender } = render(
      <FieldConfigurator
        fields={[
          {
            name: 'order_amount',
            type: 'DECIMAL',
            comment: '订单金额',
          },
        ]}
        sourceType="maxcompute"
        onConfigChange={onConfigChange}
      />,
    )

    await waitFor(() => {
      expect(fieldConfiguratorMocks.analyzeFields).toHaveBeenCalledTimes(1)
    })
    expect(fieldConfiguratorMocks.analyzeFields).toHaveBeenCalledWith([
      {
        name: 'order_amount',
        type: 'DECIMAL',
        comment: '订单金额',
        sample_values: [],
        sourceType: 'maxcompute',
      },
    ])

    rerender(
      <FieldConfigurator
        fields={[
          {
            name: 'order_amount',
            type: 'DECIMAL',
            comment: '订单金额',
          },
        ]}
        sourceType="maxcompute"
        onConfigChange={onConfigChange}
      />,
    )

    expect(fieldConfiguratorMocks.analyzeFields).toHaveBeenCalledTimes(1)
    expect(onConfigChange).toHaveBeenCalledTimes(1)
  })

  it('支持手动修改业务类型、敏感级别和脱敏规则，并在改为公开时清空脱敏规则', async () => {
    const onConfigChange = vi.fn()
    const user = userEvent.setup()

    render(
      <FieldConfigurator
        fields={[
          {
            name: 'student_name',
            type: 'STRING',
            comment: '学生姓名',
            business_type: 'dimension',
            sensitivity_level: 'pii',
            mask_rule: 'name',
            confidence_score: 0.91,
            matched_rules: ['字段名匹配敏感模式: name'],
            auto_recognized: true,
          },
        ]}
        onConfigChange={onConfigChange}
      />,
    )

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledTimes(1)
    })

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'metric')
    await user.selectOptions(selects[1], 'public')

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledTimes(3)
    })

    const latest = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1]?.[0]?.[0]
    expect(latest).toMatchObject({
      business_type: 'metric',
      sensitivity_level: 'public',
      mask_rule: undefined,
      auto_recognized: false,
    })
    expect(screen.getByText('智能识别说明')).toBeInTheDocument()
  })
})
