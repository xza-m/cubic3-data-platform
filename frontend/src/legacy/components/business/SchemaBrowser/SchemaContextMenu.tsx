/**
 * SchemaContextMenu - 右键上下文菜单
 */
import React from 'react'
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy, FileText, Eye, RefreshCw } from 'lucide-react'
import { TreeNode, getQualifiedName, NodeKey } from './types'
import { useToast } from '@/hooks/use-toast'

interface SchemaContextMenuProps {
    children: React.ReactNode
    node: TreeNode | null
    nodes: Map<NodeKey, TreeNode>
    onInsert?: (text: string) => void
    onPreview?: (database: string, table: string) => void
    onRefresh: (key: string) => void
}

export default function SchemaContextMenu({
    children,
    node,
    nodes,
    onInsert,
    onPreview,
    onRefresh,
}: SchemaContextMenuProps) {
    const { toast } = useToast()

    if (!node) {
        return <>{children}</>
    }

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: `已复制${label}`, description: text })
        })
    }

    const qualifiedName = getQualifiedName(node, nodes)

    const handleGenerateSelect = () => {
        const tableName = qualifiedName
        const sql = `SELECT * FROM ${tableName} LIMIT 100`
        if (onInsert) {
            onInsert(sql)
        } else {
            copyToClipboard(sql, 'SQL')
        }
    }

    const handlePreview = () => {
        if (onPreview && node.metadata?.database && node.metadata?.table) {
            onPreview(node.metadata.database, node.metadata.table)
        }
    }

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                {children}
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
                {/* 复制名称 */}
                <ContextMenuItem onClick={() => copyToClipboard(node.name, '名称')}>
                    <Copy className="mr-2 h-4 w-4" />
                    复制{node.type === 'column' ? '字段' : node.type === 'table' ? '表' : ''}名
                </ContextMenuItem>

                {/* 复制完整路径 */}
                {(node.type === 'table' || node.type === 'view' || node.type === 'column') && (
                    <ContextMenuItem onClick={() => copyToClipboard(qualifiedName, '引用路径')}>
                        <Copy className="mr-2 h-4 w-4" />
                        复制完整路径
                    </ContextMenuItem>
                )}

                {/* 表专用操作 */}
                {(node.type === 'table' || node.type === 'view') && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={handleGenerateSelect}>
                            <FileText className="mr-2 h-4 w-4" />
                            生成 SELECT 语句
                        </ContextMenuItem>
                        {onPreview && (
                            <ContextMenuItem onClick={handlePreview}>
                                <Eye className="mr-2 h-4 w-4" />
                                预览数据 (前50行)
                            </ContextMenuItem>
                        )}
                    </>
                )}

                {/* 刷新 */}
                {node.type !== 'column' && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => onRefresh(node.key)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            刷新
                        </ContextMenuItem>
                    </>
                )}
            </ContextMenuContent>
        </ContextMenu>
    )
}
