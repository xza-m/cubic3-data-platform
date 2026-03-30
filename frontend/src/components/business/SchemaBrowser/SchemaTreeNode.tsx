/**
 * SchemaTreeNode - 单个树节点渲染器
 */
import React, { useRef, useEffect } from 'react'
import {
    ChevronRight,
    Database,
    FolderOpen,
    Folder,
    Table2,
    Eye,
    Type,
    Hash,
    Calendar,
    ToggleLeft,
    Braces,
    Key,
    Loader2,
} from 'lucide-react'
import { TreeNode, NodeKey, ColumnTypeCategory } from './types'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface SchemaTreeNodeProps {
    node: TreeNode
    depth: number
    isSelected: boolean
    compact?: boolean
    searchTerm: string
    nodes: Map<NodeKey, TreeNode>
    isNodeVisible: (key: NodeKey) => boolean
    onToggle: (key: NodeKey) => void
    onSelect: (key: NodeKey) => void
    onDoubleClick: (node: TreeNode) => void
    onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
}

/** 图标颜色映射 */
const TYPE_COLORS: Record<string, string> = {
    datasource: '#6366f1',
    database: '#6366f1',
    schema: '#8b5cf6',
    table: '#22c55e',
    view: '#06b6d4',
}

const COLUMN_TYPE_COLORS: Record<ColumnTypeCategory, string> = {
    text: '#f97316',
    numeric: '#3b82f6',
    temporal: '#8b5cf6',
    boolean: '#22c55e',
    other: '#6b7280',
}

const COLUMN_TYPE_ICONS: Record<ColumnTypeCategory, React.ElementType> = {
    text: Type,
    numeric: Hash,
    temporal: Calendar,
    boolean: ToggleLeft,
    other: Braces,
}

/** 获取节点图标 */
function getNodeIcon(node: TreeNode) {
    switch (node.type) {
        case 'datasource':
        case 'database':
            return <Database size={14} style={{ color: TYPE_COLORS.database, flexShrink: 0 }} />
        case 'schema':
            return node.expanded
                ? <FolderOpen size={14} style={{ color: TYPE_COLORS.schema, flexShrink: 0 }} />
                : <Folder size={14} style={{ color: TYPE_COLORS.schema, flexShrink: 0 }} />
        case 'table':
            return <Table2 size={14} style={{ color: TYPE_COLORS.table, flexShrink: 0 }} />
        case 'view':
            return <Eye size={14} style={{ color: TYPE_COLORS.view, flexShrink: 0 }} />
        case 'column': {
            const category = node.metadata?.typeCategory || 'other'
            if (node.metadata?.isPrimaryKey) {
                return <Key size={14} style={{ color: '#eab308', flexShrink: 0 }} />
            }
            const IconComponent = COLUMN_TYPE_ICONS[category]
            return <IconComponent size={14} style={{ color: COLUMN_TYPE_COLORS[category], flexShrink: 0 }} />
        }
        default:
            return null
    }
}

/** 高亮搜索关键字 */
function highlightMatch(text: string, searchTerm: string) {
    if (!searchTerm) return text
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase())
    if (idx === -1) return text
    return (
        <>
            {text.substring(0, idx)}
            <mark className="bg-yellow-100 text-inherit rounded-sm px-0.5">{text.substring(idx, idx + searchTerm.length)}</mark>
            {text.substring(idx + searchTerm.length)}
        </>
    )
}

export default function SchemaTreeNode({
    node,
    depth,
    isSelected,
    compact = false,
    searchTerm,
    nodes,
    isNodeVisible,
    onToggle,
    onSelect,
    onDoubleClick,
    onContextMenu,
}: SchemaTreeNodeProps) {
    const hasChildren = node.type !== 'column'
    const indent = depth * 16
    const childrenRef = useRef<HTMLDivElement>(null)
    const comment = node.metadata?.comment?.trim()
    const tooltipLabel = comment
        ? `${comment}${node.metadata?.dataType ? `\n类型: ${node.metadata.dataType}` : ''}`
        : ''

    useEffect(() => {
        const el = childrenRef.current
        if (!el) return
        if (node.expanded) {
            el.style.maxHeight = el.scrollHeight + 'px'
            el.style.opacity = '1'
            const onEnd = () => { el.style.maxHeight = 'none' }
            el.addEventListener('transitionend', onEnd, { once: true })
            return () => el.removeEventListener('transitionend', onEnd)
        } else {
            el.style.maxHeight = el.scrollHeight + 'px'
            requestAnimationFrame(() => {
                el.style.maxHeight = '0px'
                el.style.opacity = '0'
            })
        }
    }, [node.expanded])

    return (
        <>
            {/* 当前节点 */}
            <div
                data-testid={`schema-node-${node.type}-${node.name.replace(/[^a-zA-Z0-9_-]+/g, '_')}`}
                className={`
          relative flex items-center gap-1 cursor-pointer select-none
          transition-colors duration-150 group
          ${isSelected
                        ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                        : 'border-l-2 border-l-transparent hover:bg-gray-100'
                    }
        `}
                style={{ height: compact ? 44 : 28, paddingLeft: indent + (compact ? 10 : 4), paddingRight: compact ? 12 : 8 }}
                onClick={() => {
                    onSelect(node.key)
                    if (hasChildren) onToggle(node.key)
                }}
                onDoubleClick={() => onDoubleClick(node)}
                onContextMenu={(e) => onContextMenu(e, node)}
            >
                {/* 缩进引导线 */}
                {!compact ? Array.from({ length: depth }, (_, i) => (
                    <span
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-gray-200"
                        style={{ left: i * 16 + 12 }}
                    />
                )) : null}

                {/* Chevron (旋转动画) */}
                <span className="w-4 flex-shrink-0 flex items-center justify-center">
                    {node.loading ? (
                        <Loader2 size={12} className="text-gray-400 animate-spin" />
                    ) : hasChildren ? (
                        <ChevronRight
                            size={12}
                            className="text-gray-400 transition-transform duration-200"
                            style={{ transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        />
                    ) : null}
                </span>

                {/* Icon */}
                {getNodeIcon(node)}

                {/* Name */}
                {comment ? (
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex-1 truncate text-[0.875rem] leading-5 text-gray-700">
                                    {highlightMatch(node.name, searchTerm)}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs whitespace-pre-wrap text-xs">
                                {tooltipLabel}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <span className="flex-1 truncate text-[0.875rem] leading-5 text-gray-700">
                        {highlightMatch(node.name, searchTerm)}
                    </span>
                )}

                {/* Badges */}
                {node.type === 'column' && node.metadata?.dataType && (
                    <span className="flex-shrink-0 font-mono text-[0.75rem] uppercase leading-4 text-gray-400">
                        {node.metadata.dataType}
                    </span>
                )}
                {node.type === 'column' && node.metadata?.isPrimaryKey && (
                    <span className="text-[10px] text-yellow-600 flex-shrink-0">🔑</span>
                )}
                {node.type === 'column' && node.metadata?.isPartition && (
                    <span className="text-[10px] text-pink-500 flex-shrink-0">🧩</span>
                )}
                {(node.type === 'table' || node.type === 'view') && node.metadata?.comment && (
                    <span className="hidden max-w-[88px] flex-shrink-0 truncate text-[0.75rem] leading-4 text-gray-400 group-hover:inline">
                        {node.metadata.comment}
                    </span>
                )}
            </div>

            {/* 子节点（带展开/折叠动画） */}
            <div
                ref={childrenRef}
                className="overflow-hidden transition-all duration-200 ease-in-out"
                style={{ maxHeight: node.expanded ? 'none' : 0, opacity: node.expanded ? 1 : 0 }}
            >
                {node.loading && !node.loaded && (
                    <div style={{ paddingLeft: indent + 20 }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center gap-1 h-7">
                                <div
                                    className="h-3 bg-gray-200 rounded animate-pulse"
                                    style={{ width: `${70 - i * 10}%` }}
                                />
                            </div>
                        ))}
                    </div>
                )}
                {node.children
                    .filter(childKey => isNodeVisible(childKey))
                    .map(childKey => {
                        const childNode = nodes.get(childKey)
                        if (!childNode) return null
                        return (
                            <SchemaTreeNode
                                key={childKey}
                                node={childNode}
                                depth={depth + 1}
                                isSelected={false}
                                compact={compact}
                                searchTerm={searchTerm}
                                nodes={nodes}
                                isNodeVisible={isNodeVisible}
                                onToggle={onToggle}
                                onSelect={onSelect}
                                onDoubleClick={onDoubleClick}
                                onContextMenu={onContextMenu}
                            />
                        )
                    })}
            </div>
        </>
    )
}
