// frontend/src/v2/components/ui/Table.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Table, type TableColumn } from './Table'

interface Row {
  id: number
  name: string
  age: number
}

const columns: TableColumn<Row>[] = [
  { key: 'id', title: 'ID', width: 60, align: 'right' },
  { key: 'name', title: 'Name' },
  { key: 'age', title: 'Age', render: (r) => <span data-testid="age">{r.age}</span> },
]

describe('Table', () => {
  it('renders empty state with default text', () => {
    render(<Table<Row> columns={columns} rows={[]} rowKey={(r) => r.id} />)
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('renders custom emptyText', () => {
    render(<Table<Row> columns={columns} rows={[]} rowKey={(r) => r.id} emptyText="nothing" />)
    expect(screen.getByText('nothing')).toBeInTheDocument()
  })

  it('renders custom empty ReactNode (overrides emptyText)', () => {
    render(
      <Table<Row>
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<span>NODE</span>}
        emptyText="should-be-ignored"
      />,
    )
    expect(screen.getByText('NODE')).toBeInTheDocument()
  })

  it('renders rows + columns + custom render', () => {
    render(
      <Table<Row>
        columns={columns}
        rows={[
          { id: 1, name: 'a', age: 10 },
          { id: 2, name: 'b', age: 20 },
        ]}
        rowKey={(r) => r.id}
      />,
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getAllByTestId('age')).toHaveLength(2)
  })

  it('marks active row', () => {
    const { container } = render(
      <Table<Row>
        columns={columns}
        rows={[{ id: 1, name: 'a', age: 10 }]}
        rowKey={(r) => r.id}
        activeKey={1}
      />,
    )
    expect(container.querySelector('tr.active')).not.toBeNull()
  })

  it('fires onRowClick', async () => {
    const onRowClick = vi.fn()
    render(
      <Table<Row>
        columns={columns}
        rows={[{ id: 1, name: 'a', age: 10 }]}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    )
    await userEvent.click(screen.getByText('a'))
    expect(onRowClick).toHaveBeenCalledWith({ id: 1, name: 'a', age: 10 })
  })

  it('supports keyboard activation when rows are clickable', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <Table<Row>
        columns={columns}
        rows={[{ id: 1, name: 'a', age: 10 }]}
        rowKey={(r) => r.id}
        onRowClick={onRowClick}
      />,
    )

    const row = screen.getByText('a').closest('tr')
    if (!row) throw new Error('clickable row not found')
    row.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onRowClick).toHaveBeenCalledTimes(2)
    expect(onRowClick).toHaveBeenLastCalledWith({ id: 1, name: 'a', age: 10 })
  })

  it('renders falsy default values without throwing', () => {
    const cols: TableColumn<{ k: string; v: string | undefined }>[] = [
      { key: 'k', title: 'K' },
      { key: 'v', title: 'V' },
    ]
    render(
      <Table
        columns={cols}
        rows={[{ k: 'foo', v: undefined }]}
        rowKey={(r) => r.k}
      />,
    )
    expect(screen.getByText('foo')).toBeInTheDocument()
  })
})
