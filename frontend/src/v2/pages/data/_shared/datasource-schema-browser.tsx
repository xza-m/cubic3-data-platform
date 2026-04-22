// frontend/src/v2/pages/data/_shared/datasource-schema-browser.tsx
//
// B-back-5: 数据源 Schema 浏览组件（库 → 表 → 字段三层）。
// 用于 DatasourceDetail "结构" Tab。
// 数据源：useDatasourceSchema / useDatasourceSchemaTables / useDatasourceSchemaTableColumns。

import { useEffect, useState } from 'react'
import { Database, Table as TableIcon, Columns as ColumnsIcon, RefreshCcw } from 'lucide-react'
import {
  useDatasourceSchema,
  useDatasourceSchemaTables,
  useDatasourceSchemaTableColumns,
} from '@v2/hooks/datasources'
import { fmtNum, fmtDateTime } from '@v2/lib/format'
import { t } from '@v2/i18n'

interface Props {
  datasourceId: number
}

export function DatasourceSchemaBrowser({ datasourceId }: Props) {
  const [activeDb, setActiveDb] = useState<string | null>(null)
  const [activeTable, setActiveTable] = useState<string | null>(null)

  const dbs = useDatasourceSchema(datasourceId)
  const tables = useDatasourceSchemaTables(datasourceId, activeDb)
  const columns = useDatasourceSchemaTableColumns(datasourceId, activeDb, activeTable)

  useEffect(() => {
    if (!activeDb && dbs.data?.databases?.length) {
      setActiveDb(dbs.data.databases[0])
    }
  }, [dbs.data, activeDb])

  useEffect(() => {
    setActiveTable(null)
  }, [activeDb])

  return (
    <div
      className="flex h-full min-h-0 divide-x"
      style={{ borderColor: 'var(--border)' }}
    >
      <DbColumn
        loading={dbs.isLoading}
        error={dbs.isError ? (dbs.error instanceof Error ? dbs.error.message : t('schemaBrowser.error.load', '加载失败')) : null}
        items={dbs.data?.databases ?? []}
        active={activeDb}
        onSelect={setActiveDb}
        onRefresh={() => dbs.refetch()}
        fetchedAt={dbs.data?.fetched_at}
      />
      <TableColumn
        loading={tables.isLoading}
        error={tables.isError ? (tables.error instanceof Error ? tables.error.message : t('schemaBrowser.error.load', '加载失败')) : null}
        database={activeDb}
        items={tables.data?.tables ?? []}
        active={activeTable}
        onSelect={setActiveTable}
        onRefresh={() => tables.refetch()}
        fetchedAt={tables.data?.fetched_at}
      />
      <ColumnPanel
        loading={columns.isLoading}
        error={columns.isError ? (columns.error instanceof Error ? columns.error.message : t('schemaBrowser.error.load', '加载失败')) : null}
        database={activeDb}
        table={activeTable}
        rowCount={columns.data?.row_count_estimate}
        items={columns.data?.columns ?? []}
        onRefresh={() => columns.refetch()}
        fetchedAt={columns.data?.fetched_at}
      />
    </div>
  )
}

// ── 列：数据库 ────────────────────────────────────────────────────────────────

function DbColumn(props: {
  loading: boolean
  error: string | null
  items: string[]
  active: string | null
  onSelect: (db: string) => void
  onRefresh: () => void
  fetchedAt?: string
}) {
  return (
    <ColumnShell
      title={t('schemaBrowser.col.databases', '数据库')}
      icon={<Database size={12} />}
      onRefresh={props.onRefresh}
      fetchedAt={props.fetchedAt}
      width="w-44"
    >
      <ColumnBody
        loading={props.loading}
        error={props.error}
        empty={!props.items.length && t('schemaBrowser.empty.db', '无数据库')}
      >
        {props.items.map((db) => (
          <RowItem
            key={db}
            label={db}
            active={props.active === db}
            onClick={() => props.onSelect(db)}
          />
        ))}
      </ColumnBody>
    </ColumnShell>
  )
}

function TableColumn(props: {
  loading: boolean
  error: string | null
  database: string | null
  items: { table_name: string; comment: string; row_count: number | null }[]
  active: string | null
  onSelect: (table: string) => void
  onRefresh: () => void
  fetchedAt?: string
}) {
  return (
    <ColumnShell
      title={
        props.database
          ? t('schemaBrowser.col.tablesIn', '表（{db}）', { db: props.database })
          : t('schemaBrowser.col.tables', '表')
      }
      icon={<TableIcon size={12} />}
      onRefresh={props.onRefresh}
      fetchedAt={props.fetchedAt}
      width="w-64"
    >
      <ColumnBody
        loading={props.loading}
        error={props.error}
        empty={
          !props.database
            ? t('schemaBrowser.empty.pickDb', '请先选择数据库')
            : !props.items.length && t('schemaBrowser.empty.table', '无表')
        }
      >
        {props.items.map((it) => (
          <RowItem
            key={it.table_name}
            label={it.table_name}
            secondary={
              it.comment ||
              (it.row_count != null
                ? t('schemaBrowser.rows', '{n} 行', { n: fmtNum(it.row_count) })
                : undefined)
            }
            active={props.active === it.table_name}
            onClick={() => props.onSelect(it.table_name)}
          />
        ))}
      </ColumnBody>
    </ColumnShell>
  )
}

function ColumnPanel(props: {
  loading: boolean
  error: string | null
  database: string | null
  table: string | null
  rowCount: number | null | undefined
  items: { name: string; type: string; nullable: boolean; comment: string }[]
  onRefresh: () => void
  fetchedAt?: string
}) {
  return (
    <ColumnShell
      title={
        props.table
          ? t('schemaBrowser.col.columnsIn', '字段（{table}）', { table: props.table })
          : t('schemaBrowser.col.columns', '字段')
      }
      icon={<ColumnsIcon size={12} />}
      onRefresh={props.onRefresh}
      fetchedAt={props.fetchedAt}
      width="flex-1"
      meta={
        props.rowCount != null
          ? t('schemaBrowser.rowEstimate', '估算行数 {n}', { n: fmtNum(props.rowCount) })
          : undefined
      }
    >
      <ColumnBody
        loading={props.loading}
        error={props.error}
        empty={
          !props.table
            ? t('schemaBrowser.empty.pickTable', '请先选择表')
            : !props.items.length && t('schemaBrowser.empty.column', '无字段')
        }
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: 'var(--text-3)' }}>
              <th className="px-3 py-1.5 text-left font-medium">{t('schemaBrowser.col.name', '字段名')}</th>
              <th className="px-3 py-1.5 text-left font-medium">{t('schemaBrowser.col.type', '类型')}</th>
              <th className="px-3 py-1.5 text-left font-medium">{t('schemaBrowser.col.nullable', '可空')}</th>
              <th className="px-3 py-1.5 text-left font-medium">{t('schemaBrowser.col.comment', '注释')}</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((c) => (
              <tr
                key={c.name}
                className="border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-1)' }}>
                  {c.name}
                </td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>
                  {c.type}
                </td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-3)' }}>
                  {c.nullable ? 'YES' : 'NO'}
                </td>
                <td className="px-3 py-1.5" style={{ color: 'var(--text-3)' }}>
                  {c.comment || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ColumnBody>
    </ColumnShell>
  )
}

// ── 内部布局原语 ──────────────────────────────────────────────────────────────

function ColumnShell({
  title,
  icon,
  width,
  meta,
  onRefresh,
  fetchedAt,
  children,
}: {
  title: React.ReactNode
  icon: React.ReactNode
  width: string
  meta?: React.ReactNode
  onRefresh: () => void
  fetchedAt?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex min-h-0 ${width} flex-col`}>
      <div
        className="flex items-center gap-1.5 border-b px-3 py-2 text-[11px] font-medium"
        style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
      >
        {icon}
        <span>{title}</span>
        {meta ? (
          <span className="ml-auto text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
            {meta}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className={`${meta ? 'ml-2' : 'ml-auto'} inline-flex items-center rounded p-1`}
          style={{ color: 'var(--text-3)' }}
          title={
            fetchedAt
              ? t('schemaBrowser.updatedAt', '更新于 {time}', { time: fmtDateTime(fetchedAt) })
              : t('schemaBrowser.refresh', '刷新')
          }
        >
          <RefreshCcw size={11} />
        </button>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function ColumnBody({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean
  error: string | null
  empty?: React.ReactNode | false
  children: React.ReactNode
}) {
  if (loading) {
    return (
      <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
        {t('schemaBrowser.loading', '加载中…')}
      </div>
    )
  }
  if (error) {
    return (
      <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--danger)' }}>
        {error}
      </div>
    )
  }
  if (empty) {
    return (
      <div className="px-3 py-3 text-[11px]" style={{ color: 'var(--text-3)' }}>
        {empty}
      </div>
    )
  }
  return <>{children}</>
}

function RowItem({
  label,
  secondary,
  active,
  onClick,
}: {
  label: React.ReactNode
  secondary?: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-1.5 border-b px-3 py-1.5 text-left text-xs"
      style={{
        borderColor: 'var(--border)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label}</div>
        {secondary ? (
          <div className="truncate text-[10px]" style={{ color: 'var(--text-3)' }}>
            {secondary}
          </div>
        ) : null}
      </div>
    </button>
  )
}
