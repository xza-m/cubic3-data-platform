import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyQueries from './MyQueries'

const myQueriesMocks = vi.hoisted(() => ({
  getQueries: vi.fn(),
  getFolders: vi.fn(),
}))

vi.mock('../../api/queries', () => ({
  getQueries: myQueriesMocks.getQueries,
  getFolders: myQueriesMocks.getFolders,
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
  FormInput: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
  }) => <input value={value || ''} onChange={onChange} placeholder={placeholder} />,
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
    <MemoryRouter initialEntries={['/queries/my']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/queries/my" element={<MyQueries />} />
          <Route path="/queries/editor" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('MyQueries page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    myQueriesMocks.getFolders.mockResolvedValue([
      { id: 11, folder_name: '教学分析', created_by: 'tester', created_at: '2026-03-28T09:00:00Z' },
    ])
    myQueriesMocks.getQueries.mockResolvedValue({
      items: [
        {
          id: 1,
          query_code: 'q_progress',
          query_name: '课堂进度分析',
          source_id: 7,
          sql_query: 'SELECT * FROM lesson_progress LIMIT 100',
          folder_name: '教学分析',
          tags: [],
          description: '查看课堂进度',
          is_favorite: true,
          execute_count: 8,
          created_by: 'tester',
          created_at: '2026-03-28T09:00:00Z',
          updated_at: '2026-03-28T10:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
      total_pages: 1,
    })
  })

  it('展示已保存查询，并支持继续编辑', async () => {
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('我的查询')).toBeInTheDocument()
    expect(await screen.findByText('课堂进度分析')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '继续编辑' }))

    await waitFor(() => {
      const location = screen.getByTestId('location-probe').textContent || ''
      const url = new URL(`http://localhost${location}`)
      expect(url.pathname).toBe('/queries/editor')
      expect(url.searchParams.get('queryId')).toBe('1')
      expect(url.searchParams.get('sourceId')).toBe('7')
      expect(url.searchParams.get('name')).toBe('课堂进度分析')
    })
  })
})
