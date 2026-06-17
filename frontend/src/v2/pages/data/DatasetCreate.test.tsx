import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import DatasetCreate from './DatasetCreate'

vi.mock('@v2/hooks/datasets', () => ({
  useCreateDataset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewDataset: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
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
})
