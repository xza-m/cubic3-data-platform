/**
 * SchemaBrowser 类型定义
 */

/** 节点路径唯一标识符 */
export type NodeKey = string

/** 节点类型 */
export type NodeType = 'datasource' | 'database' | 'schema' | 'table' | 'view' | 'column'

/** 列数据类型分类（用于图标映射） */
export type ColumnTypeCategory = 'text' | 'numeric' | 'temporal' | 'boolean' | 'other'

/** 树节点 */
export interface TreeNode {
    key: NodeKey
    type: NodeType
    name: string
    parentKey: NodeKey | null
    children: NodeKey[]
    loaded: boolean
    loading: boolean
    expanded: boolean
    metadata?: {
        comment?: string
        dataType?: string
        typeCategory?: ColumnTypeCategory
        isPrimaryKey?: boolean
        isPartition?: boolean
        isNullable?: boolean
        defaultValue?: string | null
        rowCount?: number
        size?: string | number
        // 用于构建完全限定名
        database?: string
        schema?: string
        table?: string
    }
}

/** 可过滤的对象类型 */
export type FilterableNodeType = 'table' | 'view'

/** SchemaBrowser 回调 Props */
export interface SchemaBrowserCallbacks {
    /** 单击节点时触发 */
    onSelect?: (node: TreeNode) => void
    /** 双击节点时触发（通常用于插入文本） */
    onDoubleClick?: (node: TreeNode, qualifiedName: string) => void
    /** 插入文本到编辑器（如 Generate SELECT） */
    onInsert?: (text: string) => void
    /** 预览表数据 */
    onPreview?: (database: string, table: string) => void
}

/** SchemaBrowser 组件 Props */
export interface SchemaBrowserProps extends SchemaBrowserCallbacks {
    /** 数据源 ID */
    datasourceId?: number
    /** 数据源类型 */
    sourceType?: string
    /** 是否可折叠面板 */
    collapsible?: boolean
    /** 面板标题 */
    title?: string
    /** 自定义 className */
    className?: string
}

/** 构建节点 Key */
export function buildNodeKey(
    type: NodeType,
    name: string,
    parentKey: NodeKey | null
): NodeKey {
    const prefix = parentKey ? `${parentKey}/` : ''
    return `${prefix}${type}:${name}`
}

/** 从节点 key 解析各层级信息 */
export function parseNodeKey(key: NodeKey): { type: NodeType; name: string }[] {
    return key.split('/').map(segment => {
        const colonIndex = segment.indexOf(':')
        return {
            type: segment.substring(0, colonIndex) as NodeType,
            name: segment.substring(colonIndex + 1)
        }
    })
}

/** 获取节点的完全限定名 */
export function getQualifiedName(node: TreeNode, nodes: Map<NodeKey, TreeNode>): string {
    if (node.type === 'column') {
        return node.name
    }
    if (node.type === 'table' || node.type === 'view') {
        // 查找是否有 schema 父节点
        if (node.parentKey) {
            const parent = nodes.get(node.parentKey)
            if (parent?.type === 'schema') {
                return `${parent.name}.${node.name}`
            }
        }
        return node.name
    }
    return node.name
}

/** 判断列类型分类 */
export function classifyColumnType(dataType: string): ColumnTypeCategory {
    const t = dataType.toLowerCase()
    if (/varchar|text|char|string|clob|nvarchar|nchar|ntext/.test(t)) return 'text'
    if (/int|bigint|smallint|tinyint|decimal|numeric|float|double|real|number|serial/.test(t)) return 'numeric'
    if (/date|time|timestamp|datetime|interval/.test(t)) return 'temporal'
    if (/bool|boolean/.test(t)) return 'boolean'
    return 'other'
}
