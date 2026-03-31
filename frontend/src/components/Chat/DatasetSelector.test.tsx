import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatasetSelector from './DatasetSelector'

const datasetSelectorMocks = vi.hoisted(() => ({
  getDatasets: vi.fn(),
}))

vi.mock('../../api/datasets', () => ({
  getDatasets: datasetSelectorMocks.getDatasets,
}))

vi.mock('@/components/business', () => ({
  FormSelect: ({
    value,
    onValueChange,
    options,
    disabled,
    placeholder,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    disabled?: boolean
    placeholder?: string
  }) => (
    <select
      aria-label={placeholder || 'dataset-select'}
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">请选择</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

function renderSelector(value?: number, onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <DatasetSelector value={value} onChange={onChange} />
    </QueryClientProvider>,
  )

  return { onChange }
}

describe('DatasetSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('加载数据集并按预期格式展示选项', async () => {
    datasetSelectorMocks.getDatasets.mockResolvedValueOnce({
      data: {
        items: [
          { id: 7, dataset_name: '学生答题明细', physical_table: 'dw.answer_detail', field_count: 16 },
        ],
      },
    })

    renderSelector(7)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据集' })).toHaveTextContent('学生答题明细 - dw.answer_detail • 16 字段')
    })
  })

  it('选择数据集时返回数字 id', async () => {
    const user = userEvent.setup()
    datasetSelectorMocks.getDatasets.mockResolvedValueOnce({
      data: {
        items: [
          { id: 7, dataset_name: '学生答题明细', physical_table: 'dw.answer_detail', field_count: 16 },
          { id: 9, dataset_name: '课堂行为汇总', physical_table: 'dw.lesson_summary', field_count: 8 },
        ],
      },
    })

    const { onChange } = renderSelector()

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '选择数据集' }).querySelectorAll('option').length).toBeGreaterThan(2)
    })
    await user.selectOptions(screen.getByRole('combobox', { name: '选择数据集' }), '9')
    expect(onChange).toHaveBeenCalledWith(9)
  })
})
