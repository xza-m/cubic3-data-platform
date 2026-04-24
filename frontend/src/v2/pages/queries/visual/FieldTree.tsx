// frontend/src/v2/pages/queries/visual/FieldTree.tsx
//
// 可视化查询：左侧字段树。
// 按 business_type 分组（维度 / 度量 / 分区键 / 其它），支持：
//   - 关键词搜索（physical_name + display_name + comment）
//   - 全选 / 清空
//   - 敏感字段胶囊提示
//
// 纯受控组件：selected 与 onSelectedChange 由上层掌管，便于测试与状态回放。

import { useMemo, useState } from 'react'
import { Hash, Ruler, Layers, Fingerprint, ShieldAlert, Search, X } from 'lucide-react'
import type { DatasetField } from '@v2/api/datasets'
import { Chip } from '@v2/components/ui/Chip'
import { t } from '@v2/i18n'

interface FieldTreeProps {
  fields: DatasetField[]
  selected: string[]
  onSelectedChange: (next: string[]) => void
  disabled?: boolean
}

type Group = 'dimension' | 'metric' | 'partition' | 'other'

const GROUP_ORDER: Group[] = ['dimension', 'metric', 'partition', 'other']

function groupOf(field: DatasetField): Group {
  const bt = (field.business_type ?? '').toLowerCase()
  if (bt === 'dimension') return 'dimension'
  if (bt === 'metric') return 'metric'
  if (bt === 'partition') return 'partition'
  return 'other'
}

function groupLabel(g: Group): string {
  switch (g) {
    case 'dimension':
      return t('queryVisual.fieldTree.group.dimension', '维度')
    case 'metric':
      return t('queryVisual.fieldTree.group.metric', '度量')
    case 'partition':
      return t('queryVisual.fieldTree.group.partition', '分区键')
    case 'other':
      return t('queryVisual.fieldTree.group.other', '其它')
  }
}

function groupIcon(g: Group) {
  switch (g) {
    case 'dimension':
      return <Hash className="h-3.5 w-3.5" />
    case 'metric':
      return <Ruler className="h-3.5 w-3.5" />
    case 'partition':
      return <Layers className="h-3.5 w-3.5" />
    case 'other':
      return <Fingerprint className="h-3.5 w-3.5" />
  }
}

export function FieldTree({
  fields,
  selected,
  onSelectedChange,
  disabled = false,
}: FieldTreeProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return fields
    return fields.filter((f) => {
      return (
        f.physical_name.toLowerCase().includes(q) ||
        (f.display_name ?? '').toLowerCase().includes(q) ||
        (f.comment ?? '').toLowerCase().includes(q)
      )
    })
  }, [fields, search])

  const byGroup = useMemo(() => {
    const m = new Map<Group, DatasetField[]>()
    for (const g of GROUP_ORDER) m.set(g, [])
    for (const f of filtered) m.get(groupOf(f))!.push(f)
    return m
  }, [filtered])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggle = (name: string) => {
    if (disabled) return
    if (selectedSet.has(name)) {
      onSelectedChange(selected.filter((s) => s !== name))
    } else {
      onSelectedChange([...selected, name])
    }
  }

  const selectAll = () => {
    if (disabled) return
    // 合并：已选中 + 当前 filtered 可见
    const merged = new Set<string>(selected)
    for (const f of filtered) merged.add(f.physical_name)
    onSelectedChange([...merged])
  }

  const clearAll = () => {
    if (disabled) return
    onSelectedChange([])
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: 'var(--bg-surface)' }}
      data-testid="v2-field-tree"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('queryVisual.fieldTree.title', '字段')}
          <span className="ml-1.5" style={{ color: 'var(--text-3)' }}>
            ({selected.length}/{fields.length})
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
          <button
            type="button"
            onClick={selectAll}
            disabled={disabled || filtered.length === 0}
            className="rounded px-1.5 py-0.5 hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
            data-testid="v2-field-tree-select-all"
          >
            {t('queryVisual.fieldTree.selectAll', '全选')}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={disabled || selected.length === 0}
            className="rounded px-1.5 py-0.5 hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
            data-testid="v2-field-tree-clear"
          >
            {t('queryVisual.fieldTree.clear', '清空')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div
          className="flex items-center gap-2 rounded border px-2 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: 'var(--text-3)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('queryVisual.fieldTree.search.placeholder', '搜索字段…')}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-1)' }}
            data-testid="v2-field-tree-search"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="opacity-60 hover:opacity-100"
              aria-label={t('queryVisual.fieldTree.search.clear', '清除搜索')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-auto px-1 py-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            {fields.length === 0
              ? t('queryVisual.fieldTree.empty.noFields', '当前数据集没有已同步的字段')
              : t('queryVisual.fieldTree.empty.noMatch', '没有匹配的字段')}
          </div>
        ) : (
          GROUP_ORDER.map((g) => {
            const items = byGroup.get(g) ?? []
            if (items.length === 0) return null
            return (
              <div key={g} className="mb-1">
                <div
                  className="flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wide"
                  style={{ color: 'var(--text-3)' }}
                >
                  {groupIcon(g)}
                  <span>{groupLabel(g)}</span>
                  <span className="ml-auto">{items.length}</span>
                </div>
                <ul className="space-y-0.5">
                  {items.map((f) => {
                    const checked = selectedSet.has(f.physical_name)
                    return (
                      <li key={f.physical_name}>
                        <label
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[color:var(--bg-hover)]"
                          style={{ color: 'var(--text-1)' }}
                          data-testid={`v2-field-tree-item-${f.physical_name}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(f.physical_name)}
                            disabled={disabled}
                            className="h-3.5 w-3.5 cursor-pointer"
                          />
                          <span className="truncate font-mono">{f.physical_name}</span>
                          {f.display_name && f.display_name !== f.physical_name && (
                            <span className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>
                              {f.display_name}
                            </span>
                          )}
                          {f.is_sensitive && (
                            <Chip tone="warning" className="ml-auto">
                              <ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />
                              {f.sensitivity_level || 'sensitive'}
                            </Chip>
                          )}
                          {!f.is_sensitive && (
                            <span
                              className="ml-auto text-[10px] font-mono"
                              style={{ color: 'var(--text-3)' }}
                            >
                              {f.data_type}
                            </span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
