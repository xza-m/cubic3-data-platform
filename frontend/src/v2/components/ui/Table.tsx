// frontend/src/v2/components/ui/Table.tsx
import { type ReactNode } from 'react'
import { cn } from '@v2/lib/cn'
import { t } from '@v2/i18n'

export interface TableColumn<T> {
  key: string
  title: ReactNode
  width?: string | number
  align?: 'left' | 'right' | 'center'
  render?: (row: T, index: number) => ReactNode
}

export interface TableProps<T> {
  columns: TableColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  activeKey?: string | number | null
  onRowClick?: (row: T) => void
  empty?: ReactNode
  /** alias for `empty`，便于纯字符串传入 */
  emptyText?: string
  className?: string
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  activeKey,
  onRowClick,
  empty,
  emptyText,
  className,
}: TableProps<T>) {
  const emptyNode = empty ?? emptyText ?? t('common.noData', '暂无数据')
  return (
    <div className={cn('overflow-auto scroll-thin', className)}>
      <table className="wb-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width, textAlign: c.align ?? 'left' }}
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="!py-10 text-center text-3">
                {emptyNode}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const key = rowKey(row, index)
              const isActive = activeKey != null && key === activeKey
              return (
                <tr
                  key={key}
                  className={isActive ? 'active' : ''}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{ textAlign: c.align ?? 'left' }}
                    >
                      {c.render
                        ? c.render(row, index)
                        : ((row as unknown as Record<string, ReactNode>)[c.key] as ReactNode) ?? ''}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
