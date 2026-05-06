// frontend/src/v2/pages/queries/visual/FilterPanel.tsx
//
// 可视化查询：筛选器面板。
// 支持条件组：组内 AND/OR，组间 AND/OR，可表达
// (a = 1 AND b = 2) OR (c = 3 AND d = 4) 这类业务筛选。

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { DatasetField } from '@v2/api/datasets'
import type { FilterGroup, FilterLogic, FilterOp, FilterRule } from './types'
import { emptyFilter, emptyFilterGroup, valueShape } from './types'
import { t } from '@v2/i18n'

interface FilterPanelProps {
  fields: DatasetField[]
  groups: FilterGroup[]
  groupLogic: FilterLogic
  onGroupsChange: (next: FilterGroup[]) => void
  onGroupLogicChange: (next: FilterLogic) => void
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

const LOGIC_OPTIONS: Array<{ value: FilterLogic; label: string }> = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
]

export function FilterPanel({
  fields,
  groups,
  groupLogic,
  onGroupsChange,
  onGroupLogicChange,
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

  const totalRules = useMemo(
    () => groups.reduce((sum, group) => sum + group.rules.length, 0),
    [groups],
  )

  const addRule = (groupId?: string) => {
    if (disabled) return
    if (groups.length === 0) {
      onGroupsChange([emptyFilterGroup([emptyFilter()])])
      return
    }
    const targetGroupId = groupId ?? groups[0].id
    onGroupsChange(
      groups.map((group) =>
        group.id === targetGroupId
          ? { ...group, rules: [...group.rules, emptyFilter()] }
          : group,
      ),
    )
  }

  const addGroup = () => {
    if (disabled) return
    onGroupsChange([...groups, emptyFilterGroup([emptyFilter()])])
  }

  const updateGroup = (groupId: string, patch: Partial<FilterGroup>) => {
    onGroupsChange(groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)))
  }

  const removeGroup = (groupId: string) => {
    if (disabled) return
    onGroupsChange(groups.filter((group) => group.id !== groupId))
  }

  const updateRule = (groupId: string, ruleId: string, patch: Partial<FilterRule>) => {
    onGroupsChange(
      groups.map((group) => {
        if (group.id !== groupId) return group
        return {
          ...group,
          rules: group.rules.map((rule) => {
            if (rule.id !== ruleId) return rule
            const next = { ...rule, ...patch }
            if (patch.op && patch.op !== rule.op) {
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
        }
      }),
    )
  }

  const removeRule = (groupId: string, ruleId: string) => {
    if (disabled) return
    onGroupsChange(
      groups
        .map((group) =>
          group.id === groupId
            ? { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }
            : group,
        )
        .filter((group) => group.rules.length > 0 || groups.length === 1),
    )
  }

  return (
    <div
      className="flex flex-col gap-2 rounded border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      data-testid="v2-filter-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
          {t('queryVisual.filter.title', '筛选条件')}
          <span className="ml-1.5" style={{ color: 'var(--text-3)' }}>
            ({totalRules})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
            {t('queryVisual.filter.groupLogic', '组间')}
            <select
              value={groupLogic}
              onChange={(e) => onGroupLogicChange(e.target.value as FilterLogic)}
              disabled={disabled || groups.length <= 1}
              className="rounded border bg-transparent px-1.5 py-1 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              data-testid="v2-filter-group-logic"
            >
              {LOGIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addGroup}
            disabled={disabled || fields.length === 0}
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            data-testid="v2-filter-panel-add-group"
          >
            <Plus className="h-3 w-3" />
            {t('queryVisual.filter.addGroup', '添加条件组')}
          </button>
          <button
            type="button"
            onClick={() => addRule()}
            disabled={disabled || fields.length === 0}
            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            data-testid="v2-filter-panel-add"
          >
            <Plus className="h-3 w-3" />
            {t('queryVisual.filter.add', '添加筛选')}
          </button>
        </div>
      </div>

      {totalRules === 0 ? (
        <div className="py-4 text-center text-xs" style={{ color: 'var(--text-3)' }}>
          {t('queryVisual.filter.empty', '暂无筛选条件，点「添加筛选」开始。')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group, index) => (
            <li
              key={group.id}
              className="rounded border p-2"
              style={{
                borderColor: 'var(--border)',
                background: 'color-mix(in srgb, var(--bg-surface) 92%, var(--bg-hover))',
              }}
              data-testid={`v2-filter-group-${group.id}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>
                  {t('queryVisual.filter.groupName', '条件组 {n}', { n: String(index + 1) })}
                </span>
                <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {t('queryVisual.filter.logicInGroup', '组内')}
                  <select
                    value={group.logic}
                    onChange={(e) => updateGroup(group.id, { logic: e.target.value as FilterLogic })}
                    disabled={disabled}
                    className="rounded border bg-transparent px-1.5 py-1 text-xs"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
                    data-testid={`v2-filter-group-${group.id}-logic`}
                  >
                    {LOGIC_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => addRule(group.id)}
                  disabled={disabled || fields.length === 0}
                  className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-[11px] hover:bg-[color:var(--bg-hover)] disabled:opacity-40"
                  style={{ color: 'var(--text-2)' }}
                  data-testid={`v2-filter-group-${group.id}-add-rule`}
                >
                  <Plus className="h-3 w-3" />
                  {t('queryVisual.filter.addToGroup', '加条件')}
                </button>
                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    disabled={disabled}
                    className="rounded p-1 text-[color:var(--text-3)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--danger)]"
                    aria-label={t('queryVisual.filter.removeGroup', '删除条件组')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <ul className="flex flex-col gap-1.5">
                {group.rules.map((rule) => (
                  <FilterRuleRow
                    key={rule.id}
                    groupId={group.id}
                    rule={rule}
                    fieldOptions={fieldOptions}
                    disabled={disabled}
                    onUpdate={updateRule}
                    onRemove={removeRule}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterRuleRow({
  groupId,
  rule,
  fieldOptions,
  disabled,
  onUpdate,
  onRemove,
}: {
  groupId: string
  rule: FilterRule
  fieldOptions: Array<{ value: string; label: string }>
  disabled: boolean
  onUpdate: (groupId: string, ruleId: string, patch: Partial<FilterRule>) => void
  onRemove: (groupId: string, ruleId: string) => void
}) {
  const shape = valueShape(rule.op)

  return (
    <li
      className="grid grid-cols-[minmax(0,1.35fr)_112px_minmax(0,1.6fr)_28px] items-center gap-2"
      data-testid={`v2-filter-row-${rule.id}`}
    >
      <select
        value={rule.field}
        onChange={(e) => onUpdate(groupId, rule.id, { field: e.target.value })}
        disabled={disabled}
        className="min-w-0 rounded border bg-transparent px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        data-testid={`v2-filter-row-${rule.id}-field`}
      >
        <option value="">{t('queryVisual.filter.field.placeholder', '选择字段…')}</option>
        {fieldOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={rule.op}
        onChange={(e) => onUpdate(groupId, rule.id, { op: e.target.value as FilterOp })}
        disabled={disabled}
        className="rounded border bg-transparent px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
        data-testid={`v2-filter-row-${rule.id}-op`}
      >
        {OP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="flex min-w-0 items-center gap-1">
        {shape === 'single' && (
          <input
            type="text"
            value={typeof rule.value === 'string' ? rule.value : ''}
            onChange={(e) => onUpdate(groupId, rule.id, { value: e.target.value })}
            disabled={disabled}
            placeholder={
              rule.op === 'LIKE'
                ? t('queryVisual.filter.value.likePlaceholder', '包含关键词（自动加 % 通配）')
                : t('queryVisual.filter.value.singlePlaceholder', '输入值')
            }
            className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            data-testid={`v2-filter-row-${rule.id}-value`}
          />
        )}
        {shape === 'list' && (
          <input
            type="text"
            value={Array.isArray(rule.value) ? rule.value.join(',') : ''}
            onChange={(e) =>
              onUpdate(groupId, rule.id, {
                value: e.target.value.split(',').map((value) => value.trim()),
              })
            }
            disabled={disabled}
            placeholder={t('queryVisual.filter.value.listPlaceholder', '以逗号分隔，例：1,2,3')}
            className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
            data-testid={`v2-filter-row-${rule.id}-value`}
          />
        )}
        {shape === 'range' && Array.isArray(rule.value) && rule.value.length === 2 && (
          <>
            <input
              type="text"
              value={rule.value[0] ?? ''}
              onChange={(e) =>
                onUpdate(groupId, rule.id, {
                  value: [e.target.value, (rule.value as [string, string])[1] ?? ''],
                })
              }
              disabled={disabled}
              placeholder={t('queryVisual.filter.value.rangeFrom', '起')}
              className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              data-testid={`v2-filter-row-${rule.id}-value-from`}
            />
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              ~
            </span>
            <input
              type="text"
              value={rule.value[1] ?? ''}
              onChange={(e) =>
                onUpdate(groupId, rule.id, {
                  value: [(rule.value as [string, string])[0] ?? '', e.target.value],
                })
              }
              disabled={disabled}
              placeholder={t('queryVisual.filter.value.rangeTo', '止')}
              className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs"
              style={{ borderColor: 'var(--border)', color: 'var(--text-1)' }}
              data-testid={`v2-filter-row-${rule.id}-value-to`}
            />
          </>
        )}
        {shape === 'none' && (
          <span className="flex-1 text-xs italic" style={{ color: 'var(--text-3)' }}>
            {t('queryVisual.filter.value.none', '（不需要值）')}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(groupId, rule.id)}
        disabled={disabled}
        aria-label={t('queryVisual.filter.remove', '删除筛选')}
        className="rounded p-1 text-[color:var(--text-3)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--danger)]"
        data-testid={`v2-filter-row-${rule.id}-remove`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
