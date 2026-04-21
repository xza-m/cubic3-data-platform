import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VisualBuilder from './VisualBuilder'

const visualBuilderMocks = vi.hoisted(() => ({
  getDataSources: vi.fn(),
  executeQuery: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: visualBuilderMocks.getDataSources,
}))

vi.mock('../../api/queries', () => ({
  executeQuery: visualBuilderMocks.executeQuery,
}))

vi.mock('@/components/business', () => ({
  FormButton: ({
    children,
    onClick,
    disabled,
    type = 'button',
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  FormSelect: ({
    value,
    onValueChange,
    options,
    placeholder,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    options: Array<{ value: string; label: string }>
    placeholder?: string
  }) => (
    <select
      aria-label={placeholder || 'select'}
      value={value || ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  DataTable: ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>
    columns: Array<{ accessorKey?: string | number }>
  }) => (
    <div data-testid="visual-result-table">
      rows:{data.length}; cols:{columns.length}; headers:{columns.map((column) => String(column.accessorKey ?? '')).join('|')}
    </div>
  ),
  useToast: () => ({ toast: visualBuilderMocks.toast }),
}))

function renderPage(path = '/queries/visual') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location-probe">{location.pathname}{location.search}</div>
  }

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/queries/visual" element={<VisualBuilder />} />
          <Route path="/queries/editor" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('VisualBuilder page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    visualBuilderMocks.getDataSources.mockResolvedValue({
      data: {
        items: [
          { id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' },
          { id: 2, name: '运营 ClickHouse', source_type: 'clickhouse' },
        ],
      },
    })
    visualBuilderMocks.executeQuery.mockResolvedValue({
      data: {
        columns: ['order_id', 'revenue'],
        data: [[1, 99]],
        row_count: 1,
        execution_time_ms: 233,
      },
    })
  })

  it('支持选择数据源并执行可视化查询', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('可视化查询构建器')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '教学 PostgreSQL (postgresql)' })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText('选择数据源'), '1')
    await user.selectOptions(screen.getByLabelText('选择数据表'), 'lesson_progress')
    await user.click(screen.getByLabelText('field-lesson_name'))
    await user.click(screen.getByRole('button', { name: '执行查询' }))

    await waitFor(() => {
      expect(visualBuilderMocks.executeQuery).toHaveBeenCalledWith({
        source_id: 1,
        sql_query: expect.stringContaining('FROM lesson_progress'),
        limit: 100,
      }, expect.anything())
    })
    expect(await screen.findByTestId('visual-result-table')).toHaveTextContent('rows:1; cols:2; headers:order_id|revenue')
  })

  it('切换到 SQL 编辑器时保留 SQL 与数据源上下文', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('可视化查询构建器')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '教学 PostgreSQL (postgresql)' })).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByLabelText('选择数据源'), '1')
    await user.selectOptions(screen.getByLabelText('选择数据表'), 'lesson_progress')
    await user.click(screen.getByRole('button', { name: '切换到 SQL 编辑器' }))

    await waitFor(() => {
      const location = screen.getByTestId('location-probe').textContent || ''
      const url = new URL(`http://localhost${location}`)
      expect(url.pathname).toBe('/queries/editor')
      expect(url.searchParams.get('sourceId')).toBe('1')
      expect(url.searchParams.get('sql')).toContain('FROM lesson_progress')
    })
  })

  it('兼容旧深链 source_id 参数，并在切回 SQL 编辑器时保留指定数据源', async () => {
    const user = userEvent.setup()

    renderPage('/queries/visual?source_id=2')

    expect(await screen.findByText('可视化查询构建器')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '运营 ClickHouse (clickhouse)' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '切换到 SQL 编辑器' }))

    await waitFor(() => {
      const location = screen.getByTestId('location-probe').textContent || ''
      const url = new URL(`http://localhost${location}`)
      expect(url.pathname).toBe('/queries/editor')
      expect(url.searchParams.get('sourceId')).toBe('2')
      expect(url.searchParams.get('source_id')).toBe('2')
    })
  })
})
