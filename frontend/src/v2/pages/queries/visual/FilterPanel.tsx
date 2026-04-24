// frontend/src/v2/pages/queries/visual/FilterPanel.tsx
//
// 可视化查询：筛选器面板。
// - 每行：字段 select / 操作符 select / 值输入（根据 op 形态切换 single/list/range/none）/ 删除按钮
// - 「添加筛选」按钮追加一行
// 受控：rules + onChange；不持有业务状态，方便测试。

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DatasetField } from '@v2/api/datasets'
import type { FilterOp, FilterRule } from './types'
import { emptyFilter, valueShape } from './types'
import { t } from '@v2/i18n'

interface FilterPanelProps {
  fields: DatasetField[]
  rules: FilterRule[]
  onChange: (next: FilterRule[]) => void
  disabled?: boolean
}

const OP_OPTIONS: Array<{ value: FilterOp; label: string }> = [
  { value: 'EQ', label: '=' },
  { value: 'NE', label: '<>' },
  { value: 'GT', label: '>' },
  { value: 'GTE', label: '>=' },
  { value: 'LT', label: '<' },
  { value: 'LTE', label: '<=' },
  { value: 'IN', label: 'IN' },
  { value: 'BETWEEN', label: 'BETWEEN' },
  { value: 'LIKE', label: 'LIKE' },
  { value: 'IS_NULL', label: 'IS NULL' },
  { value: 'IS_NOT_NULL', label: 'IS NOT NULL' },
]

export function FilterPanel({
  fields,
  rules,
  onChange,
  disabled = false,
}: FilterPanelProps) {
  const fieldOptions = useMemo(
    () =>
      fields.map((f) => ({
        value: f.physical_name,
        label: f.display_name
          ? `${f.physical_name} (${f.display_name})`
          : f.physical_name,
      })),
    [fields],
  )

  const addRule = () => {
    if (disabled) return
    onChange([...rules, emptyFilter()])
  }

  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    onChange(
      rules.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        // 若操作符切换，要把 value reset 成新 shape
        if (patch.op && patch.op !== r.op) {
          switch (valueShape(patch.op)) {
            case 'list':
              next.value = []
              break
            case 'range':
              next.value = ['', '']
              break
            case 'none':
              next.value = undefined
              break
            default:
              next.value = ''
          }
        }
        return next
      }),
    )
  }

  const removeRule = (id: string) => {
    if (disabled) return
    onChange(rules.filter((r) => r.id !== id))
  }

  return (
    <div
      className="flex flex-col gap-2 rounded border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      data-testid="v2-filter-panel"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('queryVisual.filter.title', '筛选条件')}
          <span className="ml-1.5" style={{ color: 'var(--text-3)' }}>
            ({rules.length})
          </span>
        </div>
        <button
          type="button"
          onClick={addRule}
          disabled={disabled || fields.length === 0}
          className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
          style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
          data-testid="v2-filter-panel-add"
        >
          <Plus className="h-3 w-3" />
          {t('queryVisual.filter.add', '添加筛选')}
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="py-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          {t('queryVisual.filter.empty', '暂无筛选条件，点「添加筛选」开始。')}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rules.map((r) => {
            const shape = valueShape(r.op)
            return (
              <li
                key={r.id}
                className="flex items-center gap-2"
                data-testid={`v2-filter-row-${r.id}`}
              >
                {/* 字段 */}
                <select
                  value={r.field}
                  onChange={(e) => updateRule(r.id, { field: e.target.value })}
                  disabled={disabled}
                  className="min-w-[140px] rounded border bg-transparent px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  data-testid={`v2-filter-row-${r.id}-field`}
                >
                  <option value="">
                    {t('queryVisual.filter.field.placeholder', '选择字段…')}
                  </option>
                  {fieldOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* 操作符 */}
                <select
                  value={r.op}
                  onChange={(e) => updateRule(r.id, { op: e.target.value as FilterOp })}
                  disabled={disabled}
                  className="w-[120px] rounded border bg-transparent px-2 py-1 text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                  data-testid={`v2-filter-row-${r.id}-op`}
                >
                  {OP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* 值 */}
                <div className="flex flex-1 items-center gap-1">
                  {shape === 'single' && (
                    <input
                      type="text"
                      value={typeof r.value === 'string' ? r.value : ''}
                      onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      disabled={disabled}
                      placeholder={
                        r.op === 'LIKE'
                          ? t('queryVisual.filter.value.likePlaceholder', '包含关键词（自动加 % 通配）')
                          : t('queryVisual.filter.value.singlePlaceholder', '输入值')
                      }
                      className="flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      data-testid={`v2-filter-row-${r.id}-value`}
                    />
                  )}
                  {shape === 'list' && (
                    <input
                      type="text"
                      value={Array.isArray(r.value) ? r.value.join(',') : ''}
                      onChange={(e) =>
                        updateRule(r.id, { value: e.target.value.split(',').map((v) => v.trim()) })
                      }
                      disabled={disabled}
                      placeholder={t(
                        'queryVisual.filter.value.listPlaceholder',
                        '以逗号分隔，例：1,2,3',
                      )}
                      className="flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                      data-testid={`v2-filter-row-${r.id}-value`}
                    />
                  )}
                  {shape === 'range' && Array.isArray(r.value) && r.value.length === 2 && (
                    <>
                      <input
                        type="text"
                        value={r.value[0] ?? ''}
                        onChange={(e) =>
                          updateRule(r.id, {
                            value: [e.target.value, (r.value as [string, string])[1] ?? ''],
                          })
                        }
                        disabled={disabled}
                        placeholder={t('queryVisual.filter.value.rangeFrom', '起')}
                        className="flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                        data-testid={`v2-filter-row-${r.id}-value-from`}
                      />
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>~</span>
                      <input
                        type="text"
                        value={r.value[1] ?? ''}
                        onChange={(e) =>
                          updateRule(r.id, {
                            value: [(r.value as [string, string])[0] ?? '', e.target.value],
                          })
                        }
                        disabled={disabled}
                        placeholder={t('queryVisual.filter.value.rangeTo', '止')}
                        className="flex-1 rounded border bg-transparent px-2 py-1 text-xs"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                        data-testid={`v2-filter-row-${r.id}-value-to`}
                      />
                    </>
                  )}
                  {shape === 'none' && (
                    <span className="flex-1 text-xs italic" style={{ color: 'var(--text-3)' }}>
                      {t('queryVisual.filter.value.none', '（不需要值）')}
                    </span>
                  )}
                </div>

                {/* 删除 */}
                <button
                  type="button"
                  onClick={() => removeRule(r.id)}
                  disabled={disabled}
                  aria-label={t('queryVisual.filter.remove', '删除筛选')}
                  className="rounded p-1 text-[color:var(--text-3)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--danger)]"
                  data-testid={`v2-filter-row-${r.id}-remove`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
