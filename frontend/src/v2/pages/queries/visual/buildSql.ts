// frontend/src/v2/pages/queries/visual/buildSql.ts
//
// 纯函数 SQL 生成器：将 QueryDraft + Dataset 元数据转换成可执行的 SELECT SQL。
//
// 设计原则：
//   - **纯函数、无副作用**：方便单测 + Monaco 预览热更新。
//   - **不做 schema validation**：调用方保证 draft 里的字段名来自该 dataset。
//   - **防御性引用**：字符串值统一通过 `quoteLiteral` 单引号转义，最大限度避免
//     把用户输入当 SQL 注入。（真实执行侧的后端还有 sql_validator 再兜一次。）
//   - **数据类型感知**：数字/布尔/日期不加引号；字符串/文本才引。
//   - **敏感字段兜底**：若 `mask_rule` 非空，SELECT 侧会用 mask 表达式代替原字段。
//
// 不支持的场景（故意留白）：
//   - JOIN：单表自助查询不涉及。
//   - 聚合/GROUP BY：QueryConsole 里写 SQL 更顺手。
//   - CTE / 子查询：复杂查询同上。

import type { Dataset, DatasetField } from '@v2/api/datasets'
import type { FilterGroup, FilterLogic, FilterRule, QueryDraft } from './types'

// ── 公共辅助 ─────────────────────────────────────────────────────────────────

/** SQL 单引号转义：O'Brien → 'O''Brien'。 */
export function quoteLiteral(raw: string): string {
  return `'${String(raw).replace(/'/g, "''")}'`
}

/** 标识符轻量引用：只在含非标准字符时才 double-quote，保持可读性。 */
export function quoteIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`
}

/** 物理表名 → "schema.table" 或 "table"，都过一遍 quoteIdent。 */
export function quoteTable(physicalTable: string): string {
  return physicalTable.split('.').map((part) => quoteIdent(part)).join('.')
}

/** 判断是否为"数值 / 布尔 / 日期"类型 —— 这些类型的字面量**不加引号**。 */
const NUMERIC_TYPES = new Set([
  'int',
  'integer',
  'bigint',
  'smallint',
  'tinyint',
  'decimal',
  'numeric',
  'double',
  'float',
  'real',
])
const BOOL_TYPES = new Set(['boolean', 'bool'])

/** 字面量引用策略：根据字段数据类型决定是否加引号 / 是否 NULL 化空串。 */
export function literalFor(field: DatasetField, raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return 'NULL'
  const lower = (field.data_type ?? '').toLowerCase()
  if (NUMERIC_TYPES.has(lower)) {
    return Number.isFinite(Number(trimmed)) ? trimmed : quoteLiteral(trimmed)
  }
  if (BOOL_TYPES.has(lower)) {
    if (/^(true|false|1|0)$/i.test(trimmed)) return trimmed.toUpperCase()
    return quoteLiteral(trimmed)
  }
  return quoteLiteral(trimmed)
}

// ── SELECT 列表达式（支持 mask_rule 兜底） ───────────────────────────────────

/** 生成 SELECT 侧单列表达式；若字段带 mask_rule，则应用脱敏函数。 */
export function selectExpr(field: DatasetField): string {
  const ident = quoteIdent(field.physical_name)
  if (!field.is_sensitive || !field.mask_rule) return ident
  return maskExprFor(field.mask_rule, ident, field.physical_name)
}

/** 常见 mask_rule 到 SQL 表达式的映射。未知规则原样返回字段名并加行内注释。 */
export function maskExprFor(rule: string, ident: string, alias: string): string {
  switch (rule) {
    case 'mask_all':
      return `'***' AS ${alias}`
    case 'mask_phone':
      // 138****5678 — 保留前 3 后 4
      return `CONCAT(SUBSTR(${ident}, 1, 3), '****', SUBSTR(${ident}, LENGTH(${ident}) - 3)) AS ${alias}`
    case 'mask_email':
      // 前 2 字符保留 + *** + @domain
      return `CONCAT(SUBSTR(${ident}, 1, 2), '***', SUBSTR(${ident}, POSITION('@' IN ${ident}))) AS ${alias}`
    case 'mask_idcard':
      return `CONCAT(SUBSTR(${ident}, 1, 6), '********', SUBSTR(${ident}, LENGTH(${ident}) - 3)) AS ${alias}`
    default:
      return `${ident} /* mask_rule=${rule} unhandled */`
  }
}

// ── WHERE 片段 ───────────────────────────────────────────────────────────────

/**
 * 生成单条 filter 的 SQL 片段；字段/值无效时返回 null，由 buildSql 过滤掉。
 */
export function filterExpr(rule: FilterRule, field: DatasetField | undefined): string | null {
  if (!field || !rule.field) return null
  const ident = quoteIdent(field.physical_name)

  switch (rule.op) {
    case 'IS_NULL':
      return `${ident} IS NULL`
    case 'IS_NOT_NULL':
      return `${ident} IS NOT NULL`
    case 'IN': {
      const list = Array.isArray(rule.value) ? rule.value : []
      const cleaned = list.map((v) => String(v).trim()).filter((v) => v.length > 0)
      if (cleaned.length === 0) return null
      return `${ident} IN (${cleaned.map((v) => literalFor(field, v)).join(', ')})`
    }
    case 'BETWEEN': {
      if (!Array.isArray(rule.value) || rule.value.length !== 2) return null
      const [lo, hi] = rule.value as [string, string]
      if (!lo?.trim() || !hi?.trim()) return null
      return `${ident} BETWEEN ${literalFor(field, lo)} AND ${literalFor(field, hi)}`
    }
    case 'LIKE': {
      const v = typeof rule.value === 'string' ? rule.value : ''
      if (!v.trim()) return null
      // 若用户没写通配符，帮他两端补 %（最常见需求）
      const withWild = /[%_]/.test(v) ? v : `%${v}%`
      return `${ident} LIKE ${quoteLiteral(withWild)}`
    }
    default: {
      const v = typeof rule.value === 'string' ? rule.value : ''
      if (!v.trim()) return null
      const opSym = { EQ: '=', NE: '<>', GT: '>', GTE: '>=', LT: '<', LTE: '<=' }[rule.op]
      return `${ident} ${opSym} ${literalFor(field, v)}`
    }
  }
}

function normalizeLogic(value: FilterLogic | undefined): FilterLogic {
  return value === 'OR' ? 'OR' : 'AND'
}

function effectiveFilterGroups(draft: QueryDraft): FilterGroup[] {
  if ((draft.filterGroups?.length ?? 0) > 0) return draft.filterGroups ?? []
  if (draft.filters.length === 0) return []
  return [{ id: 'legacy-filter-group', logic: 'AND', rules: draft.filters }]
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

export interface BuildSqlInput {
  dataset: Dataset | null
  draft: QueryDraft
}

export interface BuildSqlResult {
  /** 生成的完整 SQL，若必要输入缺失则是含说明的注释型 SQL。 */
  sql: string
  /** 诊断信息：UI 可以提示用户哪里还不完整。 */
  issues: string[]
  /** SELECT 的列数（去掉 `*`）。 */
  selectedCount: number
  /** WHERE 子句数量（已生效的，未生效的在 issues 中）。 */
  appliedFilters: number
}

export function buildSql({ dataset, draft }: BuildSqlInput): BuildSqlResult {
  const issues: string[] = []
  if (!dataset) {
    return {
      sql: '-- 请选择数据集',
      issues: ['未选择数据集'],
      selectedCount: 0,
      appliedFilters: 0,
    }
  }
  if (dataset.dataset_type === 'file') {
    issues.push('文件型数据集暂不支持可视化构建；请在 QueryConsole 手工编辑 SQL')
  }
  const table = dataset.physical_table
  if (!table) {
    return {
      sql: `-- 数据集 "${dataset.dataset_name}" 未绑定物理表`,
      issues: ['数据集缺少 physical_table'],
      selectedCount: 0,
      appliedFilters: 0,
    }
  }

  const fieldsByName = new Map<string, DatasetField>(
    (dataset.fields ?? []).map((f) => [f.physical_name, f]),
  )

  // SELECT
  const selectedList = draft.selectedFields
    .map((name) => fieldsByName.get(name))
    .filter((f): f is DatasetField => !!f)

  const selectClause =
    selectedList.length === 0
      ? '*'
      : selectedList.map((f) => selectExpr(f)).join(', ')
  if (selectedList.length === 0) {
    issues.push('未勾选任何字段；当前以 SELECT * 生成')
  }

  // WHERE
  const groups = effectiveFilterGroups(draft)
  const whereGroups: string[] = []
  let appliedFilters = 0
  for (const group of groups) {
    const groupParts: string[] = []
    for (const rule of group.rules) {
      const field = fieldsByName.get(rule.field)
      const expr = filterExpr(rule, field)
      if (expr) {
        groupParts.push(expr)
        appliedFilters += 1
      } else if (rule.field) {
        // 有选中字段但值不完整
        issues.push(`筛选"${rule.field}"的值不完整，已跳过`)
      }
    }
    if (groupParts.length > 0) {
      const groupLogic = normalizeLogic(group.logic)
      const joined = groupParts.join(`\n  ${groupLogic} `)
      whereGroups.push(groups.length > 1 && groupParts.length > 1 ? `(${joined})` : joined)
    }
  }
  const groupLogic = normalizeLogic(draft.filterGroupLogic)
  const whereClause = whereGroups.length ? `\nWHERE ${whereGroups.join(`\n  ${groupLogic} `)}` : ''

  // LIMIT
  const limit = Number.isFinite(draft.limit) && draft.limit > 0 ? Math.floor(draft.limit) : 1000
  const limitClause = `\nLIMIT ${limit}`

  const sql = `SELECT ${selectClause}\nFROM ${quoteTable(table)}${whereClause}${limitClause};`

  return {
    sql,
    issues,
    selectedCount: selectedList.length,
    appliedFilters,
  }
}
