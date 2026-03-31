import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QueryHistory from './History'

const historyMocks = vi.hoisted(() => ({
  getHistories: vi.fn(),
  getDataSources: vi.fn(),
}))

vi.mock('../../api/queries', () => ({
  getHistories: historyMocks.getHistories,
}))

vi.mock('../../api/datasources', () => ({
  getDataSources: historyMocks.getDataSources,
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
  FormRangeDatePicker: () => <div>日期范围</div>,
  PageModal: ({
    open,
    title,
    children,
  }: {
    open: boolean
    title?: string
    children: React.ReactNode
  }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
  Skeleton: () => <div data-testid="skeleton">loading</div>,
}))

function renderPage() {
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
    <MemoryRouter initialEntries={['/queries/history']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/queries/history" element={<QueryHistory />} />
          <Route path="/queries/editor" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('QueryHistory page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyMocks.getDataSources.mockResolvedValue({
      data: {
        items: [{ id: 1, name: '教学 PostgreSQL', source_type: 'postgresql' }],
      },
    })
    historyMocks.getHistories.mockResolvedValue({
      items: [
        {
          id: 8,
          source_id: 1,
          sql_query: 'SELECT count(*) FROM lesson_progress',
          status: 'success',
          execution_time_ms: 1200,
          executed_by: 'tester',
          executed_at: '2026-03-28T12:00:00Z',
          datasource_name: '教学 PostgreSQL',
          row_count: 1,
          result_size: 2048,
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      total_pages: 1,
    })
  })

  it('展示历史记录，并支持重新执行与查看详情', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('查询历史')).toBeInTheDocument()
    expect(await screen.findByText('教学 PostgreSQL')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findByRole('dialog', { name: '查询详情' })).toBeInTheDocument()
    expect(screen.getAllByText(/SELECT count\(\*\) FROM lesson_progress/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '重新执行' }))

    await waitFor(() => {
      const location = screen.getByTestId('location-probe').textContent || ''
      const url = new URL(`http://localhost${location}`)
      expect(url.pathname).toBe('/queries/editor')
      expect(url.searchParams.get('source_id')).toBe('1')
      expect(url.searchParams.get('sql')).toBe('SELECT count(*) FROM lesson_progress')
    })
  })
})
