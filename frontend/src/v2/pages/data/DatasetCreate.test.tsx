import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DatasetCreate from './DatasetCreate'

const createDatasetMock = vi.hoisted(() => vi.fn())

vi.mock('@v2/hooks/datasets', () => ({
  useCreateDataset: () => ({ mutateAsync: createDatasetMock, isPending: false }),
  usePreviewDataset: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ columns: ['order_id', 'amount'] }),
    isPending: false,
    isError: false,
  }),
}))

vi.mock('@v2/hooks/datasources', () => ({
  useDatasources: () => ({
    data: {
      items: [
        {
          id: 900001,
          name: 'sim_preprod_comment_reports',
          source_type: 'postgresql',
        },
      ],
    },
  }),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
  }),
}))

describe('DatasetCreate', () => {
  it('登记入口有清晰标题，连接选择使用数据源类型展示名', async () => {
    render(
      <MemoryRouter>
        <DatasetCreate />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '登记数据资产' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /从已接入的库表登记/ }))

    const select = screen.getByRole('combobox')
    expect(select).toHaveTextContent('sim_preprod_comment_reports (PostgreSQL)')
    expect(select).not.toHaveTextContent('(postgresql)')
  })

  it('走到字段确认步可提交并真正触发创建（修复提交按钮不可达 bug）', async () => {
    createDatasetMock.mockClear()
    render(
      <MemoryRouter>
        <DatasetCreate />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: /从已接入的库表登记/ }))
    await userEvent.selectOptions(screen.getByRole('combobox'), '900001')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))

    await userEvent.type(screen.getByPlaceholderText('如 default'), 'default')
    await userEvent.type(screen.getByPlaceholderText('如 dwd_order_df'), 'dwd_order_df')
    await userEvent.click(screen.getByRole('button', { name: /下一步/ }))

    // 修复前：step 2 仍是「下一步」，提交按钮永不出现 → 创建从不触发（假成功）。
    const submit = await screen.findByRole('button', { name: /完成登记/ })
    await userEvent.click(submit)

    expect(createDatasetMock).toHaveBeenCalledTimes(1)
  })
})
