/**
 * useSchemaTree - Schema 树数据管理 Hook
 * 
 * 负责树形数据的加载、展开/折叠、搜索过滤、状态管理
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { getDataSourceDatabases, getDataSourceTables } from '@/api/datasources'
import { getSchemas, getTableSchema, type TableSchemaResponse } from '@/api/schema'
import type { ApiResponse } from '@/types'
import {
    TreeNode,
    NodeKey,
    FilterableNodeType,
    buildNodeKey,
    classifyColumnType,
} from './types'

interface UseSchemaTreeOptions {
    datasourceId?: number
    sourceType?: string
}

export function useSchemaTree({ datasourceId, sourceType }: UseSchemaTreeOptions) {
    const [nodes, setNodes] = useState<Map<NodeKey, TreeNode>>(new Map())
    const [rootKeys, setRootKeys] = useState<NodeKey[]>([])
    const [selectedKey, setSelectedKey] = useState<NodeKey | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [initialized, setInitialized] = useState(false)
    const [typeFilters, setTypeFilters] = useState<Set<FilterableNodeType>>(new Set(['table', 'view']))

    useEffect(() => {
        setNodes(new Map())
        setRootKeys([])
        setSelectedKey(null)
        setSearchTerm('')
        setInitialized(false)
    }, [datasourceId, sourceType])

    // 判断数据源是否支持 Schema 层级
    const hasSchemaLevel = sourceType === 'postgresql'

    // ─── 辅助：更新节点 ───
    const updateNode = useCallback((key: NodeKey, updates: Partial<TreeNode>) => {
        setNodes(prev => {
            const next = new Map(prev)
            const existing = next.get(key)
            if (existing) {
                next.set(key, { ...existing, ...updates })
            }
            return next
        })
    }, [])

    // ─── 加载数据库列表（根节点） ───
    const loadDatabases = useCallback(async () => {
        if (!datasourceId) return

        const rootKey = buildNodeKey('datasource', String(datasourceId), null)

        // 创建或更新根节点
        setNodes(prev => {
            const next = new Map(prev)
            const existing = next.get(rootKey)
            next.set(rootKey, {
                key: rootKey,
                type: 'datasource',
                name: `数据源 #${datasourceId}`,
                parentKey: null,
                children: existing?.children || [],
                loaded: existing?.loaded || false,
                loading: true,
                expanded: true,
            })
            return next
        })

        try {
            const response = await getDataSourceDatabases(datasourceId) as ApiResponse<string[]>
            const databases: string[] = response?.data || []

            const dbKeys: NodeKey[] = []
            setNodes(prev => {
                const next = new Map(prev)
                for (const dbName of databases) {
                    const dbKey = buildNodeKey('database', dbName, rootKey)
                    dbKeys.push(dbKey)
                    if (!next.has(dbKey)) {
                        next.set(dbKey, {
                            key: dbKey,
                            type: 'database',
                            name: dbName,
                            parentKey: rootKey,
                            children: [],
                            loaded: false,
                            loading: false,
                            expanded: false,
                            metadata: { database: dbName },
                        })
                    }
                }
                next.set(rootKey, {
                    ...next.get(rootKey)!,
                    children: dbKeys,
                    loaded: true,
                    loading: false,
                })
                return next
            })
            setRootKeys(dbKeys)
            setInitialized(true)

            // 自动展开第一个数据库
            if (dbKeys.length > 0) {
                toggleExpand(dbKeys[0])
            }

        } catch (error) {
            console.error('Failed to load databases:', error)
            updateNode(rootKey, { loading: false })
        }
    }, [datasourceId])

    // ─── 加载 Schema 列表 ───
    const loadSchemas = useCallback(async (dbKey: NodeKey, database: string) => {
        if (!datasourceId) return
        updateNode(dbKey, { loading: true })

        try {
            const response = await getSchemas(datasourceId, database) as ApiResponse<string[]>
            const schemas: string[] = response?.data || []

            if (schemas.length === 0) {
                // 无 Schema 概念（MySQL/CH/MC），直接加载表
                await loadTables(dbKey, database)
                return
            }

            const schemaKeys: NodeKey[] = []
            setNodes(prev => {
                const next = new Map(prev)
                for (const schemaName of schemas) {
                    const schemaKey = buildNodeKey('schema', schemaName, dbKey)
                    schemaKeys.push(schemaKey)
                    if (!next.has(schemaKey)) {
                        next.set(schemaKey, {
                            key: schemaKey,
                            type: 'schema',
                            name: schemaName,
                            parentKey: dbKey,
                            children: [],
                            loaded: false,
                            loading: false,
                            expanded: false,
                            metadata: { database, schema: schemaName },
                        })
                    }
                }
                next.set(dbKey, {
                    ...next.get(dbKey)!,
                    children: schemaKeys,
                    loaded: true,
                    loading: false,
                    expanded: true,
                })
                return next
            })

            // 自动展开 public schema
            const publicKey = schemaKeys.find(k => k.endsWith(':public'))
            if (publicKey) {
                toggleExpand(publicKey)
            }
        } catch (error) {
            console.error('Failed to load schemas:', error)
            updateNode(dbKey, { loading: false })
        }
    }, [datasourceId, updateNode])

    // ─── 加载表列表 ───
    const loadTables = useCallback(async (parentKey: NodeKey, database: string, schema?: string) => {
        if (!datasourceId) return
        updateNode(parentKey, { loading: true })

        try {
            const response = await getDataSourceTables(datasourceId, database) as ApiResponse<Array<{ table_name: string; comment?: string } | string>>
            const rawList = response?.data || []
            const tables: Array<{ table_name: string; comment?: string }> = Array.isArray(rawList)
                ? rawList.map((t) => ({
                    table_name: typeof t === 'string' ? t : t.table_name,
                    comment: typeof t === 'string' ? undefined : t.comment,
                }))
                : []

            // 对 PostgreSQL，根据 schema 过滤
            const filteredTables = schema
                ? tables.filter(t => t.table_name.startsWith(`${schema}.`))
                : tables

            const tableKeys: NodeKey[] = []
            setNodes(prev => {
                const next = new Map(prev)
                for (const tbl of filteredTables) {
                    // 从表名提取简短名称
                    const displayName = tbl.table_name.includes('.')
                        ? tbl.table_name.split('.').pop()!
                        : tbl.table_name
                    const tableKey = buildNodeKey('table', displayName, parentKey)
                    tableKeys.push(tableKey)
                    if (!next.has(tableKey)) {
                        next.set(tableKey, {
                            key: tableKey,
                            type: 'table',
                            name: displayName,
                            parentKey,
                            children: [],
                            loaded: false,
                            loading: false,
                            expanded: false,
                            metadata: {
                                comment: tbl.comment,
                                database,
                                schema: schema,
                                table: displayName,
                            },
                        })
                    }
                }
                next.set(parentKey, {
                    ...next.get(parentKey)!,
                    children: tableKeys,
                    loaded: true,
                    loading: false,
                    expanded: true,
                })
                return next
            })
        } catch (error) {
            console.error('Failed to load tables:', error)
            updateNode(parentKey, { loading: false })
        }
    }, [datasourceId, updateNode])

    // ─── 加载列信息 ───
    const loadColumns = useCallback(async (tableKey: NodeKey, database: string, table: string, schema?: string) => {
        if (!datasourceId) return
        updateNode(tableKey, { loading: true })

        try {
            const response = await getTableSchema(datasourceId, database, table, schema) as ApiResponse<TableSchemaResponse>
            const data = response?.data || { columns: [], table_name: table, partitions: [] }
            const columns = data.columns || []

            const columnKeys: NodeKey[] = []
            setNodes(prev => {
                const next = new Map(prev)
                for (const col of columns) {
                    const colKey = buildNodeKey('column', col.name, tableKey)
                    columnKeys.push(colKey)
                    next.set(colKey, {
                        key: colKey,
                        type: 'column',
                        name: col.name,
                        parentKey: tableKey,
                        children: [],
                        loaded: true,
                        loading: false,
                        expanded: false,
                        metadata: {
                            dataType: col.type,
                            typeCategory: classifyColumnType(col.type),
                            comment: col.comment,
                            isPrimaryKey: col.is_primary_key,
                            isPartition: col.is_partition,
                            isNullable: col.is_nullable,
                            defaultValue: col.default_value,
                            database,
                            schema,
                            table,
                        },
                    })
                }
                // 更新表节点
                const tableNode = next.get(tableKey)
                if (tableNode) {
                    next.set(tableKey, {
                        ...tableNode,
                        children: columnKeys,
                        loaded: true,
                        loading: false,
                        expanded: true,
                        metadata: {
                            ...tableNode.metadata,
                            comment: data.comment || tableNode.metadata?.comment,
                        },
                    })
                }
                return next
            })
        } catch (error) {
            console.error('Failed to load columns:', error)
            updateNode(tableKey, { loading: false })
        }
    }, [datasourceId, updateNode])

    // ─── 展开/折叠节点 ───
    const toggleExpand = useCallback(async (key: NodeKey) => {
        const node = nodes.get(key)
        if (!node) {
            // 延迟获取——节点可能还在异步创建中
            setTimeout(() => toggleExpand(key), 100)
            return
        }

        if (node.expanded) {
            // 折叠
            updateNode(key, { expanded: false })
            return
        }

        // 展开
        updateNode(key, { expanded: true })

        // 如果子节点尚未加载，按需加载
        if (!node.loaded && !node.loading) {
            switch (node.type) {
                case 'database':
                    if (hasSchemaLevel) {
                        await loadSchemas(key, node.name)
                    } else {
                        await loadTables(key, node.name)
                    }
                    break
                case 'schema':
                    await loadTables(key, node.metadata?.database || '', node.name)
                    break
                case 'table':
                case 'view':
                    await loadColumns(key, node.metadata?.database || '', node.name, node.metadata?.schema)
                    break
            }
        }
    }, [nodes, hasSchemaLevel, updateNode, loadSchemas, loadTables, loadColumns])

    // ─── 刷新节点 ───
    const refreshNode = useCallback(async (key: NodeKey) => {
        const node = nodes.get(key)
        if (!node) return

        // 清除子节点
        setNodes(prev => {
            const next = new Map(prev)
            const clearChildren = (nodeKey: NodeKey) => {
                const n = next.get(nodeKey)
                if (n) {
                    for (const childKey of n.children) {
                        clearChildren(childKey)
                        next.delete(childKey)
                    }
                    next.set(nodeKey, { ...n, children: [], loaded: false, expanded: false })
                }
            }
            clearChildren(key)
            return next
        })

        // 重新展开
        setTimeout(() => toggleExpand(key), 50)
    }, [nodes, toggleExpand])

    // ─── 切换类型过滤器 ───
    const toggleTypeFilter = useCallback((type: FilterableNodeType) => {
        setTypeFilters(prev => {
            const next = new Set(prev)
            if (next.has(type)) {
                if (next.size > 1) next.delete(type)
            } else {
                next.add(type)
            }
            return next
        })
    }, [])

    // ─── 节点是否通过类型过滤 ───
    const passesTypeFilter = useCallback((node: TreeNode): boolean => {
        if (node.type === 'table' || node.type === 'view') {
            return typeFilters.has(node.type as FilterableNodeType)
        }
        return true
    }, [typeFilters])

    // ─── 搜索过滤 ───
    const filteredRootKeys = useMemo(() => {
        const hasSearch = searchTerm.trim().length > 0
        const allTypesSelected = typeFilters.size === 2

        if (!hasSearch && allTypesSelected) return rootKeys

        const term = searchTerm.toLowerCase()
        const matchingKeys = new Set<NodeKey>()

        nodes.forEach((node, key) => {
            const matchesType = passesTypeFilter(node)
            if (!matchesType) return

            const matchesSearch = !hasSearch ||
                node.name.toLowerCase().includes(term) ||
                node.metadata?.comment?.toLowerCase().includes(term)

            if (matchesSearch) {
                matchingKeys.add(key)
                let parentKey = node.parentKey
                while (parentKey) {
                    matchingKeys.add(parentKey)
                    const parent = nodes.get(parentKey)
                    parentKey = parent?.parentKey || null
                }
            }
        })

        return rootKeys.filter(k => matchingKeys.has(k))
    }, [rootKeys, searchTerm, nodes, typeFilters, passesTypeFilter])

    // ─── 节点是否在搜索/过滤中可见 ───
    const isNodeVisible = useCallback((key: NodeKey): boolean => {
        const node = nodes.get(key)
        if (!node) return false

        if (!passesTypeFilter(node)) return false

        const hasSearch = searchTerm.trim().length > 0
        if (!hasSearch) return true

        const term = searchTerm.toLowerCase()

        if (
            node.name.toLowerCase().includes(term) ||
            node.metadata?.comment?.toLowerCase().includes(term)
        ) return true

        return node.children.some(childKey => isNodeVisible(childKey))
    }, [searchTerm, nodes, passesTypeFilter])

    return {
        nodes,
        rootKeys: filteredRootKeys,
        selectedKey,
        searchTerm,
        initialized,
        typeFilters,
        setSelectedKey,
        setSearchTerm,
        toggleTypeFilter,
        loadDatabases,
        toggleExpand,
        refreshNode,
        isNodeVisible,
    }
}
