import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import StepDatasetFields from './StepDatasetFields'

const datasetApiMocks = vi.hoisted(() => ({
  getDatasets: vi.fn(),
  getDataset: vi.fn(),
}))

vi.mock('../../api/datasets', () => ({
  getDatasets: datasetApiMocks.getDatasets,
  getDataset: datasetApiMocks.getDataset,
}))

vi.mock('../../components/FieldSelector', () => ({
  FieldSelector: ({
    fields,
    value,
    onChange,
  }: {
    fields: Array<{ physical_name: string; display_name: string }>
    value?: string[]
    onChange?: (value: string[]) => void
  }) => (
    <div>
      <div data-testid="field-selector-count">{fields.length}</div>
      <div data-testid="field-selector-selected">{(value || []).join(',')}</div>
      <button type="button" onClick={() => onChange?.(['user_id', 'answer_count'])}>
        选择字段
      </button>
    </div>
  ),
}))

vi.mock('@/components/business', () => ({
  FormSelect: ({
    value,
    onChange,
    options,
  }: {
    value?: string
    onChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
  }) => (
    <select
      aria-label="dataset-select"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">请选择数据集</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

function renderStep(props: Partial<React.ComponentProps<typeof StepDatasetFields>> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const onDatasetChange = vi.fn()
  const onFieldsChange = vi.fn()
  const onFieldsMetaChange = vi.fn()

  render(
    <QueryClientProvider client={client}>
      <StepDatasetFields
        datasetId={null}
        selectedFields={[]}
        onDatasetChange={onDatasetChange}
        onFieldsChange={onFieldsChange}
        onFieldsMetaChange={onFieldsMetaChange}
        {...props}
      />
    </QueryClientProvider>,
  )

  return { onDatasetChange, onFieldsChange, onFieldsMetaChange }
}

describe('StepDatasetFields', () => {
  it('未选择数据集时展示引导并允许切换数据集', async () => {
    const user = userEvent.setup()
    datasetApiMocks.getDatasets.mockResolvedValueOnce({
      data: {
        items: [
          { id: 11, dataset_name: '学生答题明细', dataset_code: 'answer_detail', source_type: 'maxcompute' },
        ],
      },
    })

    const { onDatasetChange } = renderStep()

    expect(await screen.findByText('请先选择数据集')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('dataset-select')).toHaveTextContent('学生答题明细')
    })
    await user.selectOptions(screen.getByLabelText('dataset-select'), '11')
    expect(onDatasetChange).toHaveBeenCalledWith(11)
  })

  it('加载字段后映射字段元数据并默认选中分区字段', async () => {
    datasetApiMocks.getDatasets.mockResolvedValueOnce({
      data: {
        items: [
          { id: 11, dataset_name: '学生答题明细', dataset_code: 'answer_detail', source_type: 'maxcompute' },
        ],
      },
    })
    datasetApiMocks.getDataset.mockResolvedValueOnce({
      data: {
        description: '按答题记录生成的事实数据集',
        fields: [
          { physical_name: 'ds', display_name: '分区日期', data_type: 'DATE', business_type: 'partition', sensitivity_level: 'public' },
          { physical_name: 'user_id', display_name: '学生', data_type: 'BIGINT', business_type: 'dimension', sensitivity_level: 'private' },
          { physical_name: 'answer_count', display_name: '答题次数', data_type: 'DECIMAL(10,2)', business_type: 'measure', sensitivity_level: 'public' },
        ],
      },
    })

    const { onFieldsChange, onFieldsMetaChange } = renderStep({ datasetId: 11 })

    expect(await screen.findByText('按答题记录生成的事实数据集')).toBeInTheDocument()
    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledWith(['ds'])
    })
    await waitFor(() => {
      expect(onFieldsMetaChange).toHaveBeenCalledWith([
        {
          physical_name: 'ds',
          display_name: '分区日期',
          field_type: 'DATE',
          field_category: 'PARTITION_KEY',
          is_sensitive: false,
          is_searchable: true,
        },
        {
          physical_name: 'user_id',
          display_name: '学生',
          field_type: 'BIGINT',
          field_category: 'DIMENSION',
          is_sensitive: true,
          is_searchable: true,
        },
        {
          physical_name: 'answer_count',
          display_name: '答题次数',
          field_type: 'DECIMAL',
          field_category: 'MEASURE',
          is_sensitive: false,
          is_searchable: true,
        },
      ])
    })
    expect(screen.getByTestId('field-selector-count')).toHaveTextContent('3')
  })

  it('数据集无字段时展示告警', async () => {
    datasetApiMocks.getDatasets.mockResolvedValueOnce({
      data: { items: [] },
    })
    datasetApiMocks.getDataset.mockResolvedValueOnce({
      data: {
        description: '空数据集',
        fields: [],
      },
    })

    renderStep({ datasetId: 12 })

    expect(await screen.findByText('该数据集暂无字段')).toBeInTheDocument()
    expect(screen.getByText('请先在数据集管理中配置字段信息')).toBeInTheDocument()
  })
})
