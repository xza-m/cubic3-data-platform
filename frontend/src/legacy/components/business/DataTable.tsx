/**
 * DataTable - 统一的数据表格组件
 * 替代 Ant Design Table
 * 基于 shadcn/ui Table + TanStack Table
 */
import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import type { ReactNode } from "react"

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string
  title: string
  dataIndex?: string
  render?: (value: unknown, record: T, index: number) => React.ReactNode
  width?: string | number
  align?: "left" | "center" | "right"
}

const toReactNode = (value: unknown): ReactNode => {
  if (value === null || value === undefined) {
    return null
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  return String(value)
}

export interface DataTableProps<T = Record<string, unknown>> {
  columns: DataTableColumn<T>[] | ColumnDef<T>[]
  data?: T[]
  loading?: boolean
  density?: "default" | "compact"
  pagination?: {
    current: number
    pageSize: number
    total: number
    onChange?: (page: number, pageSize: number) => void
    onPageSizeChange?: (pageSize: number) => void
    pageSizeOptions?: number[]
  }
  // 简化Props - 如果不传pagination，可以使用这些
  pageSize?: number
  showPagination?: boolean
  onRow?: (record: T) => {
    onClick?: () => void
    onDoubleClick?: () => void
    className?: string
    testId?: string
  }
  rowKey?: keyof T | ((record: T, index: number) => string)
  emptyText?: string
}

// 类型守卫：判断是否为 DataTableColumn
function isDataTableColumn<T>(column: DataTableColumn<T> | ColumnDef<T>): column is DataTableColumn<T> {
  return 'key' in column && 'title' in column
}

export function DataTable<T = Record<string, unknown>>({
  columns,
  data = [],
  loading = false,
  density = "default",
  pagination,
  pageSize = 10,
  showPagination = false,
  onRow,
  rowKey,
  emptyText = "暂无数据",
}: DataTableProps<T>) {
  // 本地分页状态（仅在使用简化Props时）
  const [currentPage, setCurrentPage] = useState(1)

  // 标准化columns为DataTableColumn类型
  const normalizedColumns: DataTableColumn<T>[] = useMemo(() => {
    if (columns.length === 0) return []
    
    // 如果是DataTableColumn，直接返回
    if (isDataTableColumn(columns[0])) {
      return columns as DataTableColumn<T>[]
    }
    
    // 如果是ColumnDef (TanStack Table)，转换为DataTableColumn
    return (columns as ColumnDef<T>[]).map((col, index) => {
      const colDef = col as ColumnDef<T> & { accessorKey?: string; size?: number; meta?: { align?: "left" | "center" | "right" } }
      return {
        key: colDef.id || colDef.accessorKey || `column-${index}`,
        title: (colDef.header as string) || '',
        dataIndex: colDef.accessorKey,
        render: colDef.cell ? (value: unknown, record: T) => {
          if (typeof colDef.cell === 'function') {
            return (colDef.cell as unknown as (info: { row: { getValue: () => unknown; original: T } }) => React.ReactNode)(
              { row: { getValue: () => value, original: record } }
            )
          }
          return toReactNode(value)
        } : undefined,
        width: colDef.size,
        align: colDef.meta?.align,
      }
    })
  }, [columns])

  // 计算分页数据
  const paginatedData = useMemo(() => {
    if (pagination || !showPagination) {
      return data
    }
    
    // 使用简化分页
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return data.slice(startIndex, endIndex)
  }, [data, currentPage, pageSize, pagination, showPagination])

  const totalPages = useMemo(() => {
    if (pagination) {
      return Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    }
    if (showPagination) {
      return Math.max(1, Math.ceil(data.length / pageSize))
    }
    return 1
  }, [pagination, showPagination, data.length, pageSize])

  const getCellValue = (record: T, column: DataTableColumn<T>, index: number) => {
    if (column.render) {
      const value = column.dataIndex ? (record as Record<string, unknown>)[column.dataIndex] : record
      return column.render(value, record, index)
    }
    return column.dataIndex ? toReactNode((record as Record<string, unknown>)[column.dataIndex]) : null
  }

  const getRowProps = (record: T) => {
    const rowProps = onRow?.(record)
    return {
      className: cn(
        rowProps?.onClick ? "cursor-pointer hover:bg-muted/50" : "",
        rowProps?.className,
      ),
      onClick: rowProps?.onClick,
      onDoubleClick: rowProps?.onDoubleClick,
      "data-testid": rowProps?.testId,
    }
  }

  const handlePageChange = (newPage: number) => {
    if (pagination?.onChange) {
      pagination.onChange(newPage, pagination.pageSize)
    } else {
      setCurrentPage(newPage)
    }
  }

  const handlePageSizeChange = (nextPageSize: string) => {
    const value = Number(nextPageSize)
    if (!Number.isFinite(value) || value <= 0) {
      return
    }
    if (pagination?.onPageSizeChange) {
      pagination.onPageSizeChange(value)
      return
    }
    if (pagination?.onChange) {
      pagination.onChange(1, value)
      return
    }
    setCurrentPage(1)
  }

  const resolveRowKey = (record: T, index: number) => {
    if (typeof rowKey === "function") {
      return rowKey(record, index)
    }
    if (rowKey) {
      const value = record[rowKey]
      if (typeof value === "string" || typeof value === "number") {
        return String(value)
      }
    }
    return String(index)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  const currentPageNumber = pagination?.current || currentPage
  const shouldShowPagination = pagination || (showPagination && data.length > pageSize)
  const pageSizeOptions = pagination?.pageSizeOptions ?? []
  const compactMode = density === "compact"

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[1rem] border border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.94)] shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
        <Table className="[&_td]:border-0">
          <TableHeader className="bg-[hsl(var(--workbench-surface-2))]">
            <TableRow className="border-b border-[hsl(var(--workbench-outline))] bg-transparent hover:bg-transparent">
              {normalizedColumns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    "font-semibold uppercase tracking-[0.12em] text-[hsl(var(--workbench-muted-foreground))]",
                    compactMode ? "h-8 px-3 text-[0.6875rem]" : "h-10 px-4 text-[0.75rem]",
                  )}
                  style={{ width: column.width, textAlign: column.align }}
                >
                  {column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={normalizedColumns.length} className={cn(
                  "text-center text-[hsl(var(--workbench-muted-foreground))]",
                  compactMode ? "py-8 text-[0.875rem] leading-5" : "py-10 text-[0.9375rem] leading-6",
                )}>
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((record, index) => {
                const rowProps = getRowProps(record)
                return (
                  <TableRow
                    key={resolveRowKey(record, index)}
                    className={cn("border-b border-[hsl(var(--workbench-outline))]/80 bg-transparent hover:bg-[hsl(var(--workbench-surface-2))]", rowProps.className)}
                    onClick={rowProps.onClick}
                    onDoubleClick={rowProps.onDoubleClick}
                    data-testid={rowProps["data-testid"]}
                  >
                    {normalizedColumns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "align-top text-[hsl(var(--workbench-ink))]",
                          compactMode ? "px-3 py-2 text-[0.875rem] leading-5" : "px-4 py-3 text-[0.9375rem] leading-6",
                        )}
                        style={{ textAlign: column.align }}
                      >
                        {getCellValue(record, column, index)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {shouldShowPagination && (
        <div className="flex flex-col gap-3 border-t border-[hsl(var(--workbench-outline))] pt-3 md:flex-row md:items-center md:justify-between">
          <div className="text-[0.875rem] leading-5 text-[hsl(var(--workbench-muted-foreground))] tabular-nums">
            共 {pagination?.total || data.length} 条
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {pageSizeOptions.length ? (
              <div className="flex items-center gap-2 text-[0.875rem] leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                <span>每页</span>
                <Select
                  value={String(pagination?.pageSize || pageSize)}
                  onValueChange={handlePageSizeChange}
                >
                  <SelectTrigger className="h-9 w-[92px] border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.94)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} 条
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPageNumber - 1)}
              disabled={currentPageNumber === 1}
              className="border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.94)]"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <div className="text-[0.875rem] leading-5 text-[hsl(var(--workbench-muted-foreground))] tabular-nums">
              第 {currentPageNumber} / {totalPages} 页
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPageNumber + 1)}
              disabled={currentPageNumber >= totalPages}
              className="border-[hsl(var(--workbench-outline))] bg-[rgba(255,255,255,0.94)]"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
