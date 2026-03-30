/**
 * SchemaBrowser - 统一的数据库元数据浏览器
 * 
 * 可嵌入到 Query Editor（右侧面板）和 DatasetRegister（表选择器）中。
 * 通过 callback props 解耦宿主页面交互行为。
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Search, Database, PanelRightClose, PanelRightOpen, Filter, Table2, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import SchemaTreeNode from './SchemaTreeNode'
import SchemaContextMenu from './SchemaContextMenu'
import { useSchemaTree } from './useSchemaTree'
import { SchemaBrowserProps, TreeNode, getQualifiedName } from './types'

export default function SchemaBrowser({
    datasourceId,
    sourceType,
    collapsible = true,
    title = '数据库结构',
    showTitle = true,
    showSearch = true,
    compactTree = false,
    activeDatabase,
    hideDatabaseLevel = false,
    showStatusBar = true,
    className = '',
    onSelect,
    onDoubleClick,
    onInsert,
    onPreview,
}: SchemaBrowserProps) {
    const [collapsed, setCollapsed] = useState(false)
    const [contextNode, setContextNode] = useState<TreeNode | null>(null)
    const [localSearch, setLocalSearch] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()

    const {
        nodes,
        rootKeys,
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
    } = useSchemaTree({ datasourceId, sourceType })

    // 数据源变化时加载数据库列表
    useEffect(() => {
        if (datasourceId) {
            loadDatabases()
        }
    }, [datasourceId, loadDatabases])

    // 自动展开第一层数据库 / schema，保持语义建模场景可以直接定位到首个物理表。
    useEffect(() => {
        if (!initialized || rootKeys.length === 0) return

        const firstRootKey = rootKeys[0]
        const firstRootNode = nodes.get(firstRootKey)
        if (firstRootNode && !firstRootNode.expanded) {
            void toggleExpand(firstRootKey)
            return
        }

        const firstChildKey = firstRootNode?.children?.[0]
        if (!firstChildKey) return

        const firstChildNode = nodes.get(firstChildKey)
        if (firstChildNode && (firstChildNode.type === 'schema' || firstChildNode.type === 'database') && !firstChildNode.expanded) {
            void toggleExpand(firstChildKey)
            return
        }

        const tableParent = firstChildNode?.type === 'schema' || firstChildNode?.type === 'database'
            ? firstChildNode
            : firstRootNode
        const firstTableKey = tableParent?.children?.[0]
        if (!firstTableKey) return

        const firstTableNode = nodes.get(firstTableKey)
        if (firstTableNode && (firstTableNode.type === 'table' || firstTableNode.type === 'view') && !firstTableNode.expanded) {
            void toggleExpand(firstTableKey)
        }
    }, [initialized, nodes, rootKeys, toggleExpand])

    useEffect(() => {
        if (!initialized || !activeDatabase) return
        const dbKey = rootKeys.find((key) => nodes.get(key)?.name === activeDatabase)
        const dbNode = dbKey ? nodes.get(dbKey) : null
        if (dbKey && dbNode && !dbNode.expanded) {
            void toggleExpand(dbKey)
        }
    }, [activeDatabase, initialized, nodes, rootKeys, toggleExpand])

    // 搜索防抖 200ms
    const handleSearchChange = useCallback((value: string) => {
        setLocalSearch(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setSearchTerm(value), 200)
    }, [setSearchTerm])

    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [])

    const handleSelect = useCallback((key: string) => {
        setSelectedKey(key)
        const node = nodes.get(key)
        if (node && onSelect) {
            onSelect(node)
        }
    }, [nodes, onSelect, setSelectedKey])

    const handleDoubleClick = useCallback((node: TreeNode) => {
        if (onDoubleClick) {
            const qualifiedName = getQualifiedName(node, nodes)
            onDoubleClick(node, qualifiedName)
        }
    }, [nodes, onDoubleClick])

    const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
        e.preventDefault()
        setContextNode(node)
    }, [])

    const allTypesSelected = typeFilters.size === 2

    // 折叠态
    if (collapsed && collapsible) {
        return (
            <div
                className={`flex flex-col items-center py-3 gap-2 w-9 bg-white cursor-pointer select-none transition-all duration-300 ease-in-out ${className}`}
                onClick={() => setCollapsed(false)}
            >
                <PanelRightOpen size={16} className="text-gray-500" />
                <span className="text-[11px] text-gray-500 writing-vertical-lr tracking-[0.14em]">
                    {title}
                </span>
            </div>
        )
    }

    const visibleRootKeys = hideDatabaseLevel && activeDatabase
        ? (() => {
            const dbKey = rootKeys.find((key) => nodes.get(key)?.name === activeDatabase)
            const dbNode = dbKey ? nodes.get(dbKey) : null
            return dbNode?.children ?? []
        })()
        : rootKeys

    return (
        <div className={`flex w-full min-w-0 flex-col overflow-hidden bg-white transition-all duration-300 ease-in-out ${className}`}>
            {/* 标题栏 */}
            {showTitle ? (
                <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
                    <span className="text-[0.9375rem] font-medium leading-6 text-gray-700 flex items-center gap-1.5">
                        <Database size={14} className="text-indigo-500" />
                        {title}
                    </span>
                    {collapsible && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCollapsed(true)}>
                            <PanelRightClose size={14} className="text-gray-400" />
                        </Button>
                    )}
                </div>
            ) : null}

            {/* 搜索栏 + 过滤器 */}
            {showSearch ? (
            <div className="px-3 py-2.5 border-b border-gray-200">
                <div className="relative flex gap-1">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                            ref={searchInputRef}
                            value={localSearch}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="搜索表名或字段..."
                            className="h-10 rounded-xl border-gray-200 bg-gray-50 pl-7 pr-7 text-[0.875rem] leading-5"
                        />
                        {localSearch && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-0.5 top-1/2 -translate-y-1/2 h-5 w-5 p-0"
                                onClick={() => { handleSearchChange(''); setLocalSearch('') }}
                            >
                                ×
                            </Button>
                        )}
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`h-10 w-10 rounded-xl p-0 flex-shrink-0 ${!allTypesSelected ? 'text-indigo-500 bg-indigo-50' : 'text-gray-400'}`}
                            >
                                <Filter size={14} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-2" align="end">
                            <p className="mb-1.5 px-1 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-gray-500">对象类型</p>
                            <label className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                <Checkbox
                                    checked={typeFilters.has('table')}
                                    onCheckedChange={() => toggleTypeFilter('table')}
                                />
                                <Table2 size={14} className="text-green-500" />
                                <span className="text-[0.875rem] leading-5 text-gray-700">表</span>
                            </label>
                            <label className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                <Checkbox
                                    checked={typeFilters.has('view')}
                                    onCheckedChange={() => toggleTypeFilter('view')}
                                />
                                <Eye size={14} className="text-cyan-500" />
                                <span className="text-[0.875rem] leading-5 text-gray-700">视图</span>
                            </label>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
            ) : null}

            {/* 树形内容 */}
            <ScrollArea className="flex-1">
                {!datasourceId ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                        <Database size={48} className="text-gray-300 mb-3" />
                        <p className="text-[0.9375rem] font-medium leading-6 text-gray-500">请先选择数据源</p>
                        <p className="mt-1 text-[0.8125rem] leading-5 text-gray-400">选择后将显示数据库结构</p>
                    </div>
                ) : !initialized ? (
                    <div className="p-3 space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex items-center gap-2 h-7">
                                <div className="h-3 w-3 bg-gray-200 rounded animate-pulse" />
                                <div
                                    className="h-3 bg-gray-200 rounded animate-pulse"
                                    style={{ width: `${85 - i * 10}%` }}
                                />
                            </div>
                        ))}
                    </div>
                ) : visibleRootKeys.length === 0 && (searchTerm || !allTypesSelected) ? (
                    <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                        <Search size={32} className="text-gray-300 mb-2" />
                        <p className="text-[0.9375rem] leading-6 text-gray-500">未找到匹配的表或字段</p>
                        <p className="mt-1 text-[0.8125rem] leading-5 text-gray-400">尝试使用其他关键字或调整过滤器</p>
                    </div>
                ) : (
                    <SchemaContextMenu
                        node={contextNode}
                        nodes={nodes}
                        onInsert={onInsert}
                        onPreview={onPreview}
                        onRefresh={refreshNode}
                    >
                        <div className="py-1">
                            {visibleRootKeys.map(key => {
                                const node = nodes.get(key)
                                if (!node) return null
                                return (
                                    <SchemaTreeNode
                                        key={key}
                                        node={node}
                                        depth={0}
                                        isSelected={selectedKey === key}
                                        compact={compactTree}
                                        searchTerm={searchTerm}
                                        nodes={nodes}
                                        isNodeVisible={isNodeVisible}
                                        onToggle={toggleExpand}
                                        onSelect={handleSelect}
                                        onDoubleClick={handleDoubleClick}
                                        onContextMenu={handleContextMenu}
                                    />
                                )
                            })}
                        </div>
                    </SchemaContextMenu>
                )}
            </ScrollArea>

            {/* 状态栏 */}
            {showStatusBar && initialized && visibleRootKeys.length > 0 && (
                <div className="border-t border-gray-200 px-3 py-1.5 text-[0.75rem] leading-4 text-gray-400">
                    {(() => {
                        let tableCount = 0
                        let viewCount = 0
                        nodes.forEach(n => {
                            if (n.type === 'table') tableCount++
                            if (n.type === 'view') viewCount++
                        })
                        const parts: string[] = []
                        if (tableCount > 0) parts.push(`${tableCount} 张表`)
                        if (viewCount > 0) parts.push(`${viewCount} 个视图`)
                        return parts.join(' · ') || '加载中...'
                    })()}
                </div>
            )}
        </div>
    )
}

// Re-export types for convenience
export type { SchemaBrowserProps, TreeNode } from './types'
