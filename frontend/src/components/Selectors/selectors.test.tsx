import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataSourceSelector from './DataSourceSelector'
import DatasetSelector from './DatasetSelector'

const selectorMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  getDatasets: vi.fn(),
}))

vi.mock('@/components/business', () => ({
  FormSelect: ({
    value,
    onChange,
    options,
    placeholder,
    className,
    disabled,
  }: {
    value?: string
    onChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
    className?: string
    disabled?: boolean
  }) => (
    <select
      aria-label={placeholder || '选择器'}
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
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: selectorMocks.getDataSources,
}))

vi.mock('../../api/datasets', () => ({
  getDatasets: selectorMocks.getDatasets,
}))

describe('selectors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectorMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '数仓主库', source_type: 'postgresql', description: '主库' },
          { id: 2, name: '实时链路', source_type: 'mysql', description: '实时库' },
        ],
      },
    })
    selectorMocks.getDatasets.mockResolvedValue({
      data: {
        items: [
          { id: 11, dataset_name: '学生画像', description: '学生维表' },
          { id: 12, dataset_name: '课堂互动事实', description: '课堂事实表' },
        ],
      },
    })
  })

  it('DataSourceSelector 按激活状态和类型过滤，并支持格式化标签与选择回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onDataLoaded = vi.fn()

    render(
      <DataSourceSelector
        value={1}
        onChange={onChange}
        sourceTypes={['postgresql']}
        className="source-select"
        formatLabel={(source) => `${source.name} [${source.source_type}]`}
        onDataLoaded={onDataLoaded}
      />,
    )

    expect(selectorMocks.getDataSources).toHaveBeenCalledWith({ page_size: 1000, is_active: true })

    await waitFor(() => {
      expect(onDataLoaded).toHaveBeenCalledWith([
        { id: 1, name: '数仓主库', source_type: 'postgresql', description: '主库' },
      ])
    })

    const select = screen.getByLabelText('请选择数据源')
    expect(select).toHaveClass('source-select')
    expect(screen.getByRole('option', { name: '数仓主库 [postgresql]' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /实时链路/ })).not.toBeInTheDocument()

    await user.selectOptions(select, '1')
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('DataSourceSelector 在关闭 activeOnly 和加载失败时正确降级', async () => {
    selectorMocks.getDataSources.mockRejectedValueOnce(new Error('network error'))

    render(
      <DataSourceSelector
        activeOnly={false}
        disabled
      />,
    )

    expect(selectorMocks.getDataSources).toHaveBeenCalledWith({ page_size: 1000, is_active: undefined })
    const select = screen.getByLabelText('请选择数据源')
    expect(select).toBeDisabled()

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /数仓主库/ })).not.toBeInTheDocument()
    })
  })

  it('DatasetSelector 支持数据源过滤、自定义标签和选择回调', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onDataLoaded = vi.fn()

    render(
      <DatasetSelector
        value={12}
        sourceId={7}
        onChange={onChange}
        className="dataset-select"
        formatLabel={(dataset) => `${dataset.dataset_name} - ${dataset.description}`}
        onDataLoaded={onDataLoaded}
      />,
    )

    expect(selectorMocks.getDatasets).toHaveBeenCalledWith({ page_size: 1000, source_id: 7 })

    await waitFor(() => {
      expect(onDataLoaded).toHaveBeenCalledWith([
        { id: 11, dataset_name: '学生画像', description: '学生维表' },
        { id: 12, dataset_name: '课堂互动事实', description: '课堂事实表' },
      ])
    })

    const select = screen.getByLabelText('请选择数据集')
    expect(select).toHaveClass('dataset-select')
    expect(screen.getByRole('option', { name: '学生画像 - 学生维表' })).toBeInTheDocument()

    await user.selectOptions(select, '11')
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('DatasetSelector 在加载失败时回退为空列表，并保留 disabled 状态', async () => {
    selectorMocks.getDatasets.mockRejectedValueOnce(new Error('dataset error'))

    render(
      <DatasetSelector
        disabled
        placeholder="选择数据集"
      />,
    )

    const select = screen.getByLabelText('选择数据集')
    expect(select).toBeDisabled()

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /学生画像/ })).not.toBeInTheDocument()
    })
  })
})
