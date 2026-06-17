import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DevTools from './DevTools'

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({ setBreadcrumbs: vi.fn() }),
}))

const queryDslMutateAsync = vi.fn()

vi.mock('@v2/hooks/semantic', () => ({
  useCubeList: () => ({ data: { cubes: [{ name: 'orders', title: '订单' }] } }),
  useCompileDsl: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryDsl: () => ({ mutateAsync: queryDslMutateAsync, isPending: false }),
}))

const diagnoseRunDetail = {
  id: 7,
  user_id: 1,
  input_kind: 'sql',
  input_text: 'SELECT 1',
  parse_ok: true,
  validate_ok: true,
  sql_text: 'SELECT 1',
  error: null,
  duration_ms: 3,
  definition_hash: 'abcdef1234567890',
  created_at: '2026-06-10T00:00:00',
}

vi.mock('@v2/hooks/diagnose', () => ({
  useRunDiagnose: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDiagnoseRuns: () => ({
    data: { items: [diagnoseRunDetail], total: 1, page: 1, page_size: 20 },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDiagnoseRun: (id?: number) => ({
    data: id ? diagnoseRunDetail : null,
    isLoading: false,
    isError: false,
  }),
}))

// Monaco lazy 加载在 jsdom 下替换为轻量 textarea
vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea data-testid="monaco" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}))

function renderDevTools(initialEntry = '/semantic/workbench') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DevTools />
    </MemoryRouter>,
  )
}

describe('DevTools', () => {
  it('诊断输入使用卡片内联代码输入框，避免 Monaco 虚拟层造成横向错位', () => {
    const { container } = renderDevTools()

    const input = screen.getByLabelText('诊断输入内容')
    expect(input.tagName).toBe('TEXTAREA')
    expect(input).toHaveClass('font-mono')
    expect(container.querySelector('.monaco-editor')).toBeNull()
    expect(input.closest('.card-body')).not.toHaveClass('!p-0')
  })

  it('包含四个 Tab：诊断 / SQL 预览 / 查询执行 / 诊断历史', () => {
    renderDevTools()
    expect(screen.getByText('诊断控制台')).toBeInTheDocument()
    expect(screen.getByText('SQL 预览')).toBeInTheDocument()
    expect(screen.getByText('查询执行')).toBeInTheDocument()
    expect(screen.getByText('诊断历史')).toBeInTheDocument()
  })

  it('支持 ?tab=query&object= 深链预选查询 Tab 与 Cube', () => {
    renderDevTools('/semantic/workbench?tab=query&object=orders')
    expect(screen.getByText('执行查询')).toBeInTheDocument()
    const select = screen.getByLabelText('选择 Cube') as HTMLSelectElement
    expect(select.value).toBe('orders')
  })

  it('查询执行成功后展示标准证据包（SQL/对象/样本/耗时/定义版本）', async () => {
    queryDslMutateAsync.mockResolvedValueOnce({
      columns: ['total_count'],
      data: [[42]],
      row_count: 1,
      execution_time_ms: 12,
      sql: 'SELECT COUNT(*) FROM orders',
      primary_cube: 'orders',
      joined_cubes: [],
      definition_hash: 'deadbeefcafe1234',
    })
    renderDevTools('/semantic/workbench?tab=query&object=orders')

    fireEvent.click(screen.getByText('执行查询'))

    await waitFor(() => {
      expect(screen.getByText('查询证据包')).toBeInTheDocument()
    })
    expect(screen.getByText('SELECT COUNT(*) FROM orders')).toBeInTheDocument()
    expect(screen.getByText('12 ms')).toBeInTheDocument()
    expect(screen.getByText('deadbeefcafe')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('诊断历史详情提供一键回放，回填诊断面板', async () => {
    renderDevTools('/semantic/workbench?tab=history')

    fireEvent.click(screen.getByText('#7'))
    const replayBtn = await screen.findByText('回填到诊断面板')
    fireEvent.click(replayBtn)

    await waitFor(() => {
      const input = screen.getByLabelText('诊断输入内容') as HTMLTextAreaElement
      expect(input.value).toBe('SELECT 1')
    })
    expect(screen.getByText('回放自 #7')).toBeInTheDocument()
  })
})
