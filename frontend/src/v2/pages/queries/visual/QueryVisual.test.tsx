// frontend/src/v2/pages/queries/visual/QueryVisual.test.tsx
//
// QueryVisual 页面 RTL 交互单测。
// 覆盖：dataset 自动选中 → 勾字段 → 加筛选 → SQL 实时更新 → 在 QueryConsole 打开跳转。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Dataset, DatasetField } from '@v2/api/datasets'

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@v2/hooks/datasets', () => ({
  useDatasets: vi.fn(),
  useDataset: vi.fn(),
}))

vi.mock('@v2/hooks/queries', () => ({
  useExecuteQuery: vi.fn(),
  useSubmitExport: vi.fn(),
}))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

import { useDatasets, useDataset } from '@v2/hooks/datasets'
import { useExecuteQuery, useSubmitExport } from '@v2/hooks/queries'
import QueryVisual, { V2_QUERY_VISUAL_PREFILL_KEY } from './QueryVisual'

const mockUseDatasets = useDatasets as ReturnType<typeof vi.fn>
const mockUseDataset = useDataset as ReturnType<typeof vi.fn>
const mockUseExec = useExecuteQuery as ReturnType<typeof vi.fn>
const mockUseSubmitExport = useSubmitExport as ReturnType<typeof vi.fn>

// ── 固定 fixture ─────────────────────────────────────────────────────────────

function mkField(p: Partial<DatasetField>): DatasetField {
  return {
    physical_name: 'col',
    data_type: 'string',
    display_name: null,
    business_type: 'dimension',
    sensitivity_level: 'public',
    is_sensitive: false,
    mask_rule: null,
    comment: null,
    field_order: 0,
    ...p,
  }
}

const DATASET_WITH_FIELDS: Dataset = {
  id: 101,
  dataset_code: 'ds_orders',
  dataset_name: '订单宽表',
  dataset_type: 'physical',
  source_id: 7,
  source_type: 'postgresql',
  physical_table: 'public.orders',
  sql_query: null,
  file_metadata: null,
  description: null,
  owner: null,
  sync_status: 'synced',
  last_sync_at: null,
  sync_error: null,
  field_count: 3,
  created_at: '2026-04-20T00:00:00Z',
  updated_at: '2026-04-20T00:00:00Z',
  fields: [
    mkField({ physical_name: 'order_id', data_type: 'bigint' }),
    mkField({ physical_name: 'user_id', data_type: 'bigint' }),
    mkField({ physical_name: 'ds', data_type: 'string', business_type: 'partition' }),
  ],
}

// ── render helper ────────────────────────────────────────────────────────────

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  return render(<QueryVisual />, { wrapper: Wrapper })
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('QueryVisual page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateSpy.mockReset()
    sessionStorage.clear()

    mockUseDatasets.mockReturnValue({
      data: { items: [DATASET_WITH_FIELDS], total: 1, page: 1, page_size: 200 },
      isLoading: false,
    })
    mockUseDataset.mockReturnValue({
      data: DATASET_WITH_FIELDS,
      isFetching: false,
    })
    mockUseExec.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        columns: ['order_id'],
        data: [{ order_id: 1 }],
        row_count: 1,
        execution_time_ms: 12,
      }),
      isPending: false,
    })
    mockUseSubmitExport.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: 42, status: 'pending' }),
      isPending: false,
    })
  })

  it('页面标题渲染 + 自动选中第一个 dataset', async () => {
    renderPage()
    expect(screen.getByText('可视化构建')).toBeInTheDocument()

    const select = await screen.findByTestId('v2-query-visual-dataset-select')
    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe(String(DATASET_WITH_FIELDS.id))
    })
  })

  it('未勾字段时 SQL 使用 SELECT *', async () => {
    renderPage()
    const preview = await screen.findByTestId('v2-sql-preview')
    await waitFor(() => {
      expect(preview.textContent).toContain('SELECT *')
      expect(preview.textContent).toContain('FROM public.orders')
    })
  })

  it('勾选字段后 SQL 更新为具名列', async () => {
    renderPage()

    const orderIdCheckbox = await screen.findByTestId('v2-field-tree-item-order_id')
    fireEvent.click(orderIdCheckbox.querySelector('input[type=checkbox]')!)

    const preview = screen.getByTestId('v2-sql-preview')
    await waitFor(() => {
      expect(preview.textContent).toContain('SELECT order_id')
      expect(preview.textContent).not.toContain('SELECT *')
    })
  })

  it('添加筛选 + 输入值 → SQL 含 WHERE', async () => {
    renderPage()

    const addBtn = await screen.findByTestId('v2-filter-panel-add')
    fireEvent.click(addBtn)

    const panel = screen.getByTestId('v2-filter-panel')
    const row = panel.querySelector('[data-testid^="v2-filter-row-"]') as HTMLElement
    expect(row).toBeTruthy()
    const rowId = row.getAttribute('data-testid')!.replace('v2-filter-row-', '')

    const fieldSel = screen.getByTestId(`v2-filter-row-${rowId}-field`)
    fireEvent.change(fieldSel, { target: { value: 'order_id' } })

    const valueInput = screen.getByTestId(`v2-filter-row-${rowId}-value`)
    fireEvent.change(valueInput, { target: { value: '42' } })

    const preview = screen.getByTestId('v2-sql-preview')
    await waitFor(() => {
      expect(preview.textContent).toContain('WHERE order_id = 42')
    })
  })

  it('"在查询控制台打开" 写入 sessionStorage 并跳转 /queries', async () => {
    renderPage()

    const openBtn = await screen.findByTestId('v2-sql-preview-open-console')
    fireEvent.click(openBtn)

    const raw = sessionStorage.getItem(V2_QUERY_VISUAL_PREFILL_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { sql: string; source_id: number | null; origin: string }
    expect(parsed.sql).toContain('FROM public.orders')
    expect(parsed.source_id).toBe(7)
    expect(parsed.origin).toBe('visual')
    expect(navigateSpy).toHaveBeenCalledWith('/queries')
  })

  it('dataset 切换会清空已选字段与筛选', async () => {
    const other: Dataset = {
      ...DATASET_WITH_FIELDS,
      id: 202,
      dataset_name: '用户宽表',
      physical_table: 'public.users',
      fields: [mkField({ physical_name: 'user_id' })],
    }
    mockUseDatasets.mockReturnValue({
      data: { items: [DATASET_WITH_FIELDS, other], total: 2, page: 1, page_size: 200 },
      isLoading: false,
    })
    // mock useDataset 按 id 返回对应 dataset
    mockUseDataset.mockImplementation((id: number) => {
      if (id === 202) return { data: other, isFetching: false }
      return { data: DATASET_WITH_FIELDS, isFetching: false }
    })

    renderPage()

    // 勾一个字段
    const orderIdItem = await screen.findByTestId('v2-field-tree-item-order_id')
    fireEvent.click(orderIdItem.querySelector('input[type=checkbox]')!)
    expect(screen.getByTestId('v2-sql-preview').textContent).toContain('SELECT order_id')

    // 换 dataset
    const select = screen.getByTestId('v2-query-visual-dataset-select')
    fireEvent.change(select, { target: { value: '202' } })

    await waitFor(() => {
      const preview = screen.getByTestId('v2-sql-preview')
      expect(preview.textContent).toContain('FROM public.users')
      expect(preview.textContent).toContain('SELECT *')
    })
  })

  it('点"执行"时调用 useExecuteQuery 并展示结果', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      columns: ['order_id'],
      data: [{ order_id: 99 }, { order_id: 100 }],
      row_count: 2,
      execution_time_ms: 8,
    })
    mockUseExec.mockReturnValue({ mutateAsync, isPending: false })

    renderPage()
    const runBtn = await screen.findByTestId('v2-query-visual-run')

    await act(async () => {
      fireEvent.click(runBtn)
    })

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1)
    })
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 7,
        sql_query: expect.stringContaining('FROM public.orders'),
      }),
    )

    // 结果表格渲染
    await waitFor(() => {
      const resultTable = screen.getByTestId('v2-query-visual-result-table')
      expect(resultTable.textContent).toContain('order_id')
      expect(resultTable.textContent).toContain('99')
      expect(resultTable.textContent).toContain('100')
    })
  })
})
