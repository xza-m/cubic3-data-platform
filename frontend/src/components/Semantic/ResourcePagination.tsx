interface ResourcePaginationProps {
  page: number
  pageCount: number
  onChange: (page: number) => void
}

export function ResourcePagination({ page, pageCount, onChange }: ResourcePaginationProps) {
  if (pageCount <= 1) return null

  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-[hsl(var(--workbench-outline))] bg-white px-3 py-2 text-xs text-[hsl(var(--workbench-muted-foreground))]">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-md px-2 py-1 transition-colors hover:bg-[hsl(var(--workbench-surface-2))] disabled:cursor-not-allowed disabled:opacity-40"
      >
        上一页
      </button>
      <span>
        第 {page} / {pageCount} 页
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        className="rounded-md px-2 py-1 transition-colors hover:bg-[hsl(var(--workbench-surface-2))] disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一页
      </button>
    </div>
  )
}
