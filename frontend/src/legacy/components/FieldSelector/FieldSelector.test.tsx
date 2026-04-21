import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InputHTMLAttributes, ReactNode } from 'react'
import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FieldMeta } from '@/types/filter'
import FieldSelector from './FieldSelector'

vi.mock('lucide-react', () => ({
  Search: (props: Record<string, unknown>) => <svg data-testid="search-icon" {...props} />,
  Key: (props: Record<string, unknown>) => <svg data-testid="partition-icon" {...props} />,
  Database: (props: Record<string, unknown>) => <svg data-testid="dimension-icon" {...props} />,
  BarChart3: (props: Record<string, unknown>) => <svg data-testid="measure-icon" {...props} />,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    className,
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
    className?: string
  }) => (
    <input
      type="checkbox"
      className={className}
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  AccordionTrigger: ({ children }: { children: ReactNode }) => (
    <div data-testid="accordion-trigger">{children}</div>
  ),
  AccordionContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const fields: FieldMeta[] = [
  {
    physical_name: 'ds',
    display_name: '分区日期',
    field_type: 'DATE',
    field_category: 'PARTITION_KEY',
  },
  {
    physical_name: 'student_name',
    display_name: '学生姓名',
    field_type: 'STRING',
    field_category: 'DIMENSION',
    is_sensitive: true,
  },
  {
    physical_name: 'total_amount',
    display_name: '订单金额',
    field_type: 'DECIMAL',
    field_category: 'MEASURE',
  },
]

function ControlledFieldSelector({
  initialValue = [],
  showStatistics = true,
  onSelectionChange,
}: {
  initialValue?: string[]
  showStatistics?: boolean
  onSelectionChange?: (selected: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>(initialValue)

  return (
    <FieldSelector
      fields={fields}
      value={selected}
      showStatistics={showStatistics}
      onChange={(next) => {
        setSelected(next)
        onSelectionChange?.(next)
      }}
    />
  )
}

describe('FieldSelector', () => {
  it('展示分类统计，并支持点击字段切换选中状态', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()

    render(
      <ControlledFieldSelector
        initialValue={['ds']}
        onSelectionChange={onSelectionChange}
      />,
    )

    expect(screen.getByText('已选字段')).toBeInTheDocument()
    expect(screen.getAllByText('分区键').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('维度字段')).toBeInTheDocument()
    expect(screen.getByText('度量字段')).toBeInTheDocument()
    expect(screen.getByText('敏感')).toBeInTheDocument()
    expect(screen.getByTestId('partition-icon')).toBeInTheDocument()
    expect(screen.getByTestId('dimension-icon')).toBeInTheDocument()
    expect(screen.getByTestId('measure-icon')).toBeInTheDocument()

    await user.click(screen.getByText('订单金额'))
    expect(onSelectionChange).toHaveBeenLastCalledWith(['ds', 'total_amount'])

    await user.click(screen.getByText('订单金额'))
    expect(onSelectionChange).toHaveBeenLastCalledWith(['ds'])
  })

  it('支持按字段名和物理名搜索，并在无匹配时展示空态', async () => {
    const user = userEvent.setup()

    render(<ControlledFieldSelector />)

    const searchInput = screen.getByPlaceholderText('搜索字段名称...')
    expect(screen.getByText('分区日期')).toBeInTheDocument()
    expect(screen.getByText('学生姓名')).toBeInTheDocument()

    await user.type(searchInput, 'student')
    expect(screen.getByText('学生姓名')).toBeInTheDocument()
    expect(screen.queryByText('分区日期')).not.toBeInTheDocument()
    expect(screen.queryByText('订单金额')).not.toBeInTheDocument()

    await user.clear(searchInput)
    await user.type(searchInput, 'missing')
    expect(screen.getAllByText('未找到匹配的字段')).toHaveLength(3)
    expect(screen.getByTestId('search-icon')).toBeInTheDocument()
  })

  it('支持分类全选和取消全选，并同步统计结果', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()

    render(
      <ControlledFieldSelector
        initialValue={['ds']}
        onSelectionChange={onSelectionChange}
      />,
    )

    const dimensionTrigger = screen
      .getByText('维度字段')
      .closest('[data-testid="accordion-trigger"]') as HTMLElement | null
    expect(dimensionTrigger).not.toBeNull()

    const selectAllCheckbox = within(dimensionTrigger!).getByRole('checkbox')
    await user.click(selectAllCheckbox)
    expect(onSelectionChange).toHaveBeenLastCalledWith(['ds', 'student_name'])
    expect(selectAllCheckbox).toBeChecked()

    await user.click(selectAllCheckbox)
    expect(onSelectionChange).toHaveBeenLastCalledWith(['ds'])
    expect(selectAllCheckbox).not.toBeChecked()
  })

  it('在关闭统计信息时不渲染统计卡片', () => {
    render(<ControlledFieldSelector showStatistics={false} />)

    expect(screen.queryByText('已选字段')).not.toBeInTheDocument()
    expect(screen.queryByText('分区键')).toBeInTheDocument()
  })
})
