// frontend/src/v2/pages/queries/QueryExports.test.tsx
//
// QueryExports 列表页交互单测。
// 覆盖：空状态 / 列表渲染 / 状态 tabs 过滤 / 下载链接 / 取消按钮。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { QueryExport } from '@v2/api/queries'

vi.mock('@v2/hooks/queries', () => ({
  useExports: vi.fn(),
  useCancelExport: vi.fn(),
}))

import { useExports, useCancelExport } from '@v2/hooks/queries'
import QueryExports from './QueryExports'

const mockUseExports = useExports as ReturnType<typeof vi.fn>
const mockUseCancel = useCancelExport as ReturnType<typeof vi.fn>

function mkExport(p: Partial<QueryExport>): QueryExport {
  return {
    id: 1,
    export_id: 1,
    user_id: 'u1',
    source_id: 10,
    sql_query: 'SELECT 1',
    status: 'pending',
    row_count: null,
    file_size_bytes: null,
    file_url: null,
    file_storage: null,
    error_message: null,
    error_code: null,
    job_id: null,
    created_at: '2026-04-23T00:00:00Z',
    started_at: null,
    finished_at: null,
    cancelled_at: null,
    expires_at: null,
    ...p,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<QueryExports />, { wrapper: Wrapper })
}

describe('QueryExports page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCancel.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    })
  })

  it('列表为空时展示空状态提示', () => {
    mockUseExports.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('暂无导出任务')).toBeInTheDocument()
  })

  it('渲染 success + pending 两行，显示下载 / 取消按钮', () => {
    const items = [
      mkExport({
        id: 1,
        status: 'success',
        row_count: 100,
        file_size_bytes: 1024,
        file_storage: 'oss',
        file_url: 'https://oss.example.com/exp1.csv',
      }),
      mkExport({ id: 2, status: 'pending' }),
    ]
    mockUseExports.mockReturnValue({
      data: { items, total: 2, page: 1, page_size: 20, total_pages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()

    expect(screen.getByTestId('v2-query-exports-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('v2-query-exports-row-2')).toBeInTheDocument()

    const download = screen.getByTestId('v2-query-exports-download-1') as HTMLAnchorElement
    expect(download.href).toContain('oss.example.com')

    expect(screen.getByTestId('v2-query-exports-cancel-2')).toBeInTheDocument()
  })

  it('切换状态 tab 会触发带 status 参数的 useExports', async () => {
    mockUseExports.mockReturnValue({
      data: { items: [], total: 0, page: 1, page_size: 20, total_pages: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })
    renderPage()

    fireEvent.click(screen.getByTestId('v2-query-exports-tab-success'))

    await waitFor(() => {
      expect(mockUseExports).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
      )
    })
  })

  it('点取消按钮调用 useCancelExport', async () => {
    const cancelMut = vi.fn().mockResolvedValue(undefined)
    mockUseCancel.mockReturnValue({ mutateAsync: cancelMut, isPending: false })
    mockUseExports.mockReturnValue({
      data: {
        items: [mkExport({ id: 7, status: 'running' })],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    fireEvent.click(screen.getByTestId('v2-query-exports-cancel-7'))

    await waitFor(() => {
      expect(cancelMut).toHaveBeenCalledWith(7)
    })
  })
})
