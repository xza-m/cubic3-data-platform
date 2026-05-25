// frontend/src/v2/components/ListPagination.tsx
//
// 轻量列表分页条：用于卡片列表、表格列表等常规资产浏览页。

import { Button } from '@v2/components/ui'
import { t } from '@v2/i18n'
import { fmtNum } from '@v2/lib/format'

interface ListPaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
  alwaysShow?: boolean
}

export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  className = '',
  alwaysShow = false,
}: ListPaginationProps) {
  if (!alwaysShow && total <= pageSize) return null

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(total, safePage * pageSize)

  return (
    <div
      className={`mt-3 flex items-center justify-between rounded-md border px-3 py-2 text-xs ${className}`}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-3)' }}
    >
      <span>
        {t('listPagination.range', '{start}-{end} / {total} 条', {
          start: fmtNum(start),
          end: fmtNum(end),
          total: fmtNum(total),
        })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          {t('pagination.prev', '上一页')}
        </Button>
        <span className="min-w-16 text-center tabular-nums">
          {t('listPagination.page', '{page} / {pageCount}', {
            page: safePage,
            pageCount,
          })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        >
          {t('pagination.next', '下一页')}
        </Button>
      </div>
    </div>
  )
}
