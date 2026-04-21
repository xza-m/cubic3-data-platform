// frontend/src/v2/components/ResourceListPage.tsx
//
// 通用列表页模板（Peek-aware）。
//
// 范式：Progressive Disclosure
//   L0 列表：高密度行扫描
//   L2 Peek：单击行 → 主区右侧 slide-over 详情，期间 ContextPanel 临时隐藏
//   L3 Tab：⤢ / ⌘↵ 升级为路由 + Tab 全屏（需提供 detailPath）
//
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import {
  Card,
  CardBody,
  CardHead,
  Input,
  Kbd,
  SkeletonRows,
  Table,
  type TableColumn,
} from '@v2/components/ui'
import { useAppShell } from '@v2/layout/AppShell'
import { PeekPanel } from '@v2/components/PeekPanel'

interface ModuleContext {
  title?: ReactNode
  subtitle?: ReactNode
  body?: ReactNode
}

interface PeekContent {
  title: ReactNode
  subtitle?: ReactNode
  badges?: ReactNode
  body: ReactNode
  footer?: ReactNode
}

export interface ResourceListPageProps<T> {
  /** 完整模式：面包屑、列、行集合 — 渲染内置 Table + Peek 流程。 */
  breadcrumbs?: string[]
  title?: ReactNode
  subtitle?: ReactNode
  source?: string
  rows?: T[]
  loading?: boolean
  /** 错误标志，shell 模式下展示 banner。 */
  error?: boolean
  /** 总数：shell 模式下右上角徽标。 */
  total?: number
  columns?: TableColumn<T>[]
  compactColumns?: TableColumn<T>[]
  rowKey?: (r: T) => string | number
  search?: {
    placeholder?: string
    fields: Array<keyof T | ((r: T) => string)>
  }
  topBarActions?: ReactNode
  /** Shell 模式下的右侧操作区（与 topBarActions 任选其一）。 */
  actions?: ReactNode
  peek?: (row: T) => PeekContent
  inspector?: (row: T) => { title: ReactNode; subtitle?: ReactNode; body: ReactNode }
  detailPath?: (row: T) => string
  tabLabel?: (row: T) => ReactNode
  peekSize?: 'narrow' | 'medium' | 'wide'
  moduleContext?: ModuleContext
  defaultActiveKey?: string | number
  empty?: ReactNode
  /** 简洁版兜底文案，等价于 empty='string'。 */
  emptyText?: string
  /**
   * Shell 模式：当传入 children 时，跳过内置 Table+Peek，
   * 仅渲染顶栏 + Card 容器，包裹自定义内容。
   */
  children?: ReactNode
}

export function ResourceListPage<T>(props: ResourceListPageProps<T>) {
  const {
    breadcrumbs,
    title,
    subtitle,
    source,
    rows,
    loading,
    error,
    total,
    columns,
    compactColumns,
    rowKey,
    search,
    topBarActions,
    actions,
    peek,
    inspector,
    detailPath,
    peekSize = 'medium',
    moduleContext,
    defaultActiveKey,
    empty,
    emptyText,
    children,
  } = props

  // ── Shell 模式：调用方提供 children，使用最小的 Card 包装 ──
  if (children !== undefined) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <Card className="flex flex-1 flex-col overflow-hidden">
          {(title || actions || subtitle || total !== undefined) && (
            <CardHead
              title={
                <span className="flex items-center gap-2">
                  <span>{title}</span>
                  {total !== undefined ? (
                    <span className="text-[11px] text-3">· {total}</span>
                  ) : null}
                </span>
              }
              subtitle={subtitle}
              actions={actions}
            />
          )}
          <CardBody className="flex flex-1 flex-col overflow-auto">
            {loading ? (
              <SkeletonRows rows={6} />
            ) : error ? (
              <div className="px-4 py-6 text-xs" style={{ color: 'var(--danger)' }}>
                加载失败
              </div>
            ) : (rows && rows.length === 0) ? (
              <div className="px-4 py-6 text-xs" style={{ color: 'var(--text-3)' }}>
                {empty ?? emptyText ?? '暂无数据'}
              </div>
            ) : (
              children
            )}
          </CardBody>
        </Card>
      </div>
    )
  }

  // ── 完整模式：rows + columns + 内置 Table + Peek ──
  if (!rows || !columns || !rowKey) {
    return null
  }
  return (
    <FullResourceListPage
      breadcrumbs={breadcrumbs ?? []}
      title={title}
      subtitle={subtitle}
      source={source}
      rows={rows}
      loading={loading}
      columns={columns}
      compactColumns={compactColumns}
      rowKey={rowKey}
      search={search}
      topBarActions={topBarActions}
      peek={peek}
      inspector={inspector}
      detailPath={detailPath}
      peekSize={peekSize}
      moduleContext={moduleContext}
      defaultActiveKey={defaultActiveKey}
      empty={empty ?? emptyText}
    />
  )
}

interface FullProps<T> {
  breadcrumbs: string[]
  title?: ReactNode
  subtitle?: ReactNode
  source?: string
  rows: T[]
  loading?: boolean
  columns: TableColumn<T>[]
  compactColumns?: TableColumn<T>[]
  rowKey: (r: T) => string | number
  search?: {
    placeholder?: string
    fields: Array<keyof T | ((r: T) => string)>
  }
  topBarActions?: ReactNode
  peek?: (row: T) => PeekContent
  inspector?: (row: T) => { title: ReactNode; subtitle?: ReactNode; body: ReactNode }
  detailPath?: (row: T) => string
  tabLabel?: (row: T) => ReactNode
  peekSize?: 'narrow' | 'medium' | 'wide'
  moduleContext?: ModuleContext
  defaultActiveKey?: string | number
  empty?: ReactNode
}

function FullResourceListPage<T>({
  breadcrumbs,
  title,
  subtitle,
  source,
  rows,
  loading,
  columns,
  compactColumns,
  rowKey,
  search,
  topBarActions,
  peek,
  inspector,
  detailPath,
  peekSize = 'medium',
  moduleContext,
  defaultActiveKey,
  empty,
}: FullProps<T>) {
  const navigate = useNavigate()
  const { setBreadcrumbs, setTopBarActions, setContextPanel } = useAppShell()
  const [keyword, setKeyword] = useState('')
  const [peekKey, setPeekKey] = useState<string | number | null>(defaultActiveKey ?? null)

  useEffect(() => {
    setBreadcrumbs(breadcrumbs)
  }, [setBreadcrumbs, breadcrumbs])

  useEffect(() => {
    setTopBarActions(topBarActions)
    return () => setTopBarActions(null)
  }, [setTopBarActions, topBarActions])

  useEffect(() => {
    if (!moduleContext) {
      setContextPanel(null)
      return
    }
    setContextPanel({
      title: moduleContext.title,
      subtitle: moduleContext.subtitle,
      body: moduleContext.body,
    })
    return () => setContextPanel(null)
  }, [setContextPanel, moduleContext])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q || !search) return rows
    return rows.filter((r) =>
      search.fields.some((f) => {
        const value = typeof f === 'function' ? f(r) : String(r[f] ?? '')
        return value.toLowerCase().includes(q)
      }),
    )
  }, [rows, keyword, search])

  const peekRow = useMemo(
    () => (peekKey == null ? null : filtered.find((r) => rowKey(r) === peekKey) ?? null),
    [peekKey, filtered, rowKey],
  )

  const peekContent: PeekContent | null = useMemo(() => {
    if (!peekRow) return null
    if (peek) return peek(peekRow)
    if (inspector) {
      const legacy = inspector(peekRow)
      return { title: legacy.title, subtitle: legacy.subtitle, body: legacy.body }
    }
    return null
  }, [peekRow, peek, inspector])

  const peekOpen = peekContent != null

  const openInTab = useCallback(
    (row: T) => {
      if (!detailPath) return
      navigate(detailPath(row))
    },
    [detailPath, navigate],
  )

  const hasPeekProvider = !!(peek || inspector)
  useEffect(() => {
    if (!hasPeekProvider) return
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target
      if (
        tgt instanceof HTMLElement &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.tagName === 'SELECT' ||
          tgt.isContentEditable)
      )
        return
      if (filtered.length === 0) return
      if (peekKey == null) {
        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault()
          setPeekKey(rowKey(filtered[0]))
        }
        return
      }
      const idx = filtered.findIndex((r) => rowKey(r) === peekKey)
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = filtered[Math.min(filtered.length - 1, idx + 1)]
        if (next) setPeekKey(rowKey(next))
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = filtered[Math.max(0, idx - 1)]
        if (prev) setPeekKey(rowKey(prev))
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (peekRow) openInTab(peekRow)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasPeekProvider, filtered, peekKey, peekRow, rowKey, openInTab])

  const activeColumns = useMemo(() => {
    if (!peekOpen) return columns
    if (compactColumns && compactColumns.length > 0) return compactColumns
    return columns.slice(0, 2)
  }, [peekOpen, columns, compactColumns])

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-4">
      <Card className="relative flex flex-1 flex-col overflow-hidden">
        <CardHead
          title={
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-1">{title}</div>
              {subtitle ? <div className="text-[11px] text-3 mt-0.5">{subtitle}</div> : null}
            </div>
          }
          extra={
            <div className="flex items-center gap-2">
              {source ? (
                <span className="text-[11px] text-3">
                  <code>{source}</code>
                </span>
              ) : null}
              {hasPeekProvider ? (
                <span className="hidden items-center gap-1 text-[11px] text-3 md:inline-flex">
                  {peekOpen ? (
                    <>
                      <Kbd>↑</Kbd>
                      <Kbd>↓</Kbd>
                      <span>切换</span>
                      {detailPath ? (
                        <>
                          <Kbd>⌘↵</Kbd>
                          <span>升级</span>
                        </>
                      ) : null}
                      <Kbd>Esc</Kbd>
                      <span>关闭</span>
                    </>
                  ) : (
                    <span>单击行预览</span>
                  )}
                </span>
              ) : null}
              {search ? (
                <div className="relative">
                  <Search
                    size={12}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-3"
                  />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={search.placeholder ?? '搜索…'}
                    className="!w-[220px] !pl-7"
                  />
                </div>
              ) : null}
            </div>
          }
        />
        <CardBody className="!p-0 relative flex-1 overflow-hidden">
          {loading ? (
            <SkeletonRows rows={6} columns={activeColumns.length} />
          ) : (
            <Table
              columns={activeColumns}
              rows={filtered}
              rowKey={rowKey}
              activeKey={peekKey ?? undefined}
              onRowClick={(r) => {
                const k = rowKey(r)
                setPeekKey(k === peekKey ? null : k)
              }}
              empty={empty ?? <span>暂无数据</span>}
            />
          )}
          {hasPeekProvider ? (
            <PeekPanel
              open={peekOpen}
              onClose={() => setPeekKey(null)}
              onOpenFull={detailPath && peekRow ? () => openInTab(peekRow) : undefined}
              title={peekContent?.title ?? ''}
              subtitle={peekContent?.subtitle}
              badges={peekContent?.badges}
              footer={
                peekContent?.footer ?? (
                  <div className="flex items-center justify-between text-[11px] text-3">
                    <span>
                      <Kbd>↑</Kbd>/<Kbd>↓</Kbd> 切换 · <Kbd>Esc</Kbd> 关闭
                    </span>
                    {detailPath ? (
                      <span>
                        <Kbd>⌘↵</Kbd> 升级 Tab
                      </span>
                    ) : null}
                  </div>
                )
              }
              size={peekSize}
            >
              {peekContent?.body}
            </PeekPanel>
          ) : null}
        </CardBody>
      </Card>
    </div>
  )
}

export default ResourceListPage
