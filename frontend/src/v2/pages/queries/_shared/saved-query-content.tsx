// frontend/src/v2/pages/queries/_shared/saved-query-content.tsx
//
// 已保存查询详情内容组件 —— Peek panel 与 L3 Detail 共用。

import { useState, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { fmtDateTime, fmtRelative } from '@v2/lib/format'
import type { SavedQuery, SavedQueryDetail, CreateSavedQueryPayload, UpdateSavedQueryPayload } from '@v2/api/queries'

// ──────────────────────────────────────────────────────────────────────────
// Tab label
// ──────────────────────────────────────────────────────────────────────────

export function savedQueryTabLabel(row: SavedQuery): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <Star size={11} className="text-yellow-500" />
      <span className="truncate">{row.query_name}</span>
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Actions interface
// ──────────────────────────────────────────────────────────────────────────

export interface SavedQueryActions {
  onOpen?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onToggleFavorite?: () => void
}

// ──────────────────────────────────────────────────────────────────────────
// Detail content body
// ──────────────────────────────────────────────────────────────────────────

export function SavedQueryDetailContent({
  row,
  actions,
}: {
  row: SavedQuery | SavedQueryDetail
  actions?: SavedQueryActions
}) {
  return (
    <div className="space-y-4 px-4 py-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {actions?.onOpen && (
          <button
            type="button"
            onClick={actions.onOpen}
            className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            在工作台打开
          </button>
        )}
        {actions?.onEdit && (
          <button
            type="button"
            onClick={actions.onEdit}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
          >
            编辑
          </button>
        )}
        {actions?.onToggleFavorite && (
          <button
            type="button"
            onClick={actions.onToggleFavorite}
            className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)]"
            style={{ borderColor: 'var(--border)' }}
          >
            {row.is_favorite ? '取消收藏' : '收藏'}
          </button>
        )}
        {actions?.onDelete && (
          <button
            type="button"
            onClick={actions.onDelete}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            删除
          </button>
        )}
      </div>

      <Section title="基础信息">
        <Row label="编号" value={<code>#{row.id}</code>} />
        <Row label="名称" value={row.query_name} />
        <Row label="代码" value={<code>{row.query_code}</code>} />
        <Row label="负责人" value={row.created_by} />
        <Row
          label="收藏"
          value={
            <span className="flex items-center gap-1">
              <Star
                size={11}
                className={row.is_favorite ? 'text-yellow-500' : 'text-neutral-400'}
                fill={row.is_favorite ? 'currentColor' : 'none'}
              />
              {row.is_favorite ? '已收藏' : '未收藏'}
            </span>
          }
        />
        {row.description && <Row label="描述" value={row.description} />}
        <Row
          label="标签"
          value={
            row.tags?.length ? (
              <span className="flex flex-wrap justify-end gap-1">
                {row.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )
          }
        />
        <Row label="创建于" value={fmtDateTime(row.created_at)} />
        <Row label="更新于" value={fmtDateTime(row.updated_at)} />
      </Section>

      <Section title="预览 SQL">
        <pre
          className="overflow-auto rounded border p-2 text-xs leading-4"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-2)',
          }}
        >
          {row.sql_query}
        </pre>
      </Section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Context panel body for L3 detail
// ──────────────────────────────────────────────────────────────────────────

export function SavedQueryContextBody({
  row,
  neighbors,
  onNavigate,
}: {
  row: SavedQuery
  neighbors: { prev: SavedQuery | null; next: SavedQuery | null }
  onNavigate: (id: number) => void
}) {
  return (
    <div className="space-y-4 px-4 py-4">
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          收藏状态
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Star
            size={12}
            className={row.is_favorite ? 'text-yellow-500' : 'text-neutral-400'}
            fill={row.is_favorite ? 'currentColor' : 'none'}
          />
          <span className="text-xs">{row.is_favorite ? '已收藏' : '未收藏'}</span>
        </div>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          信息
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <Pair label="负责人" value={row.created_by} />
          <Pair label="更新" value={fmtRelative(row.updated_at)} />
          {row.tags?.length ? (
            <div className="flex items-start justify-between gap-2">
              <dt style={{ color: 'var(--text-3)' }}>标签</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {row.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
      <section>
        <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
          邻接导航
        </div>
        <div className="mt-2 space-y-1.5 text-xs">
          <NeighborButton
            label={neighbors.prev ? `← ${neighbors.prev.query_name}` : '没有上一项'}
            disabled={!neighbors.prev}
            onClick={neighbors.prev ? () => onNavigate(neighbors.prev!.id) : undefined}
          />
          <NeighborButton
            label={neighbors.next ? `${neighbors.next.query_name} →` : '没有下一项'}
            disabled={!neighbors.next}
            onClick={neighbors.next ? () => onNavigate(neighbors.next!.id) : undefined}
          />
        </div>
      </section>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Inline edit form
// ──────────────────────────────────────────────────────────────────────────

export interface SavedQueryFormValues {
  query_name: string
  sql_query: string
  description: string
  tags: string
  is_favorite: boolean
}

export function SavedQueryInlineForm({
  initial,
  onSubmit,
  onCancel,
  loading,
}: {
  initial: Partial<SavedQueryFormValues>
  onSubmit: (v: UpdateSavedQueryPayload) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState(initial.query_name ?? '')
  const [desc, setDesc] = useState(initial.description ?? '')
  const [sql, setSql] = useState(initial.sql_query ?? '')
  const [tags, setTags] = useState(initial.tags ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      query_name: name || undefined,
      description: desc || undefined,
      sql_query: sql || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4 text-xs">
      <Field label="名称">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="描述">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="标签" hint="逗号分隔">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="BI, 运营"
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="SQL">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={5}
          className="w-full rounded border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {loading ? '保存中…' : '保存修改'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)' }}
        >
          取消
        </button>
      </div>
    </form>
  )
}

export interface CreateSavedQueryFormValues {
  query_name: string
  source_id: string
  sql_query: string
  description: string
  tags: string
}

export function CreateSavedQueryForm({
  datasources,
  onSubmit,
  onCancel,
  loading,
}: {
  datasources: Array<{ id: number; name: string; source_type: string }>
  onSubmit: (v: CreateSavedQueryPayload) => void
  onCancel: () => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [sourceId, setSourceId] = useState(datasources[0]?.id?.toString() ?? '')
  const [sql, setSql] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceId) return
    onSubmit({
      query_name: name,
      source_id: Number(sourceId),
      sql_query: sql,
      description: desc || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4 text-xs">
      <Field label="名称">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="如：GMV_周报"
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="数据源">
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          required
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        >
          {datasources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.source_type}
            </option>
          ))}
        </select>
      </Field>
      <Field label="描述">
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="标签" hint="逗号分隔">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="BI, 运营"
          className="w-full rounded border bg-transparent px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <Field label="SQL">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          required
          rows={6}
          placeholder="SELECT * FROM ..."
          className="w-full rounded border bg-transparent px-2 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        />
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {loading ? '创建中…' : '创建查询'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--bg-hover)]"
          style={{ borderColor: 'var(--border)' }}
        >
          取消
        </button>
      </div>
    </form>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Internal primitives
// ──────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        {title}
      </div>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function Pair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-3)' }}>{label}</dt>
      <dd className="truncate" style={{ color: 'var(--text-1)' }}>
        {value}
      </dd>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
        {hint && <span className="font-normal opacity-60">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

function NeighborButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-1)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}
    >
      <span className="truncate">{label}</span>
    </button>
  )
}
