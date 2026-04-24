// frontend/src/v2/pages/queries/visual/types.ts
//
// 查询可视化构建页（/queries/visual）的内部类型。
// 外部 Dataset / DatasetField 类型从 @v2/api/datasets 导入，不在此重复。

/** 支持的筛选操作符；前端内部大写常量，对后端 SQL 生成时小写/符号化。 */
export type FilterOp =
  | 'EQ'
  | 'NE'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'IN'
  | 'BETWEEN'
  | 'LIKE'
  | 'IS_NULL'
  | 'IS_NOT_NULL'

/**
 * 单条筛选条件。
 *
 * - `id`：前端生成的行 id，仅用于 React key。
 * - `field`：绑定的物理字段名（`DatasetField.physical_name`）。空串表示未选。
 * - `op`：默认 'EQ'。
 * - `value`：
 *   - EQ / NE / GT* / LT* / LIKE → string
 *   - IN                         → string[]（UI 输入以逗号分隔）
 *   - BETWEEN                    → [string, string]
 *   - IS_NULL / IS_NOT_NULL      → undefined（忽略）
 */
export interface FilterRule {
  id: string
  field: string
  op: FilterOp
  value: string | string[] | [string, string] | undefined
}

/**
 * 可视化查询的内部草稿；UI 纯受控，不落库。
 * `orderBy` 预留，当前 UI 暂不暴露（v1 原型里有 ORDER BY 段落但未实现）。
 */
export interface QueryDraft {
  datasetId: number | null
  selectedFields: string[] // physical_name 列表（保持顺序）
  filters: FilterRule[]
  limit: number
  orderBy?: Array<{ field: string; direction: 'ASC' | 'DESC' }>
}

/** 新筛选行的默认值。 */
export function emptyFilter(): FilterRule {
  return {
    id: `filter-${Math.random().toString(36).slice(2, 10)}`,
    field: '',
    op: 'EQ',
    value: '',
  }
}

/** 新草稿默认值。 */
export function emptyDraft(): QueryDraft {
  return {
    datasetId: null,
    selectedFields: [],
    filters: [],
    limit: 1000,
  }
}

/** 每种操作符对应的"值形状"，用于 UI 渲染不同的输入控件。 */
export function valueShape(op: FilterOp): 'single' | 'list' | 'range' | 'none' {
  switch (op) {
    case 'IN':
      return 'list'
    case 'BETWEEN':
      return 'range'
    case 'IS_NULL':
    case 'IS_NOT_NULL':
      return 'none'
    default:
      return 'single'
  }
}
