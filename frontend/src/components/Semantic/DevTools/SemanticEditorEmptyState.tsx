import { Link } from 'react-router-dom'
import { FolderTree, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SemanticEmptyState } from '@/components/Semantic/workbench'

export function SemanticEditorEmptyState({
  kind,
  selectionCode,
}: {
  kind: 'domain' | 'catalog'
  selectionCode?: string
}) {
  const isDomain = kind === 'domain'
  const title = '当前对象暂不支持在线 YAML 编辑'
  const description = isDomain
    ? '领域对象在领域建模页维护。这里显示资源上下文、编译调试和 Schema 同步。'
    : '目录对象已并入领域建模页维护。这里显示资源树、编译调试和 Schema 同步。'
  const actionHref = isDomain && selectionCode ? `/semantic/domains/${selectionCode}` : '/semantic/domains'
  const actionLabel = isDomain ? '打开领域模块' : '打开领域建模'

  return (
    <div className="mt-4" data-testid="semantic-editor-empty-state">
      <SemanticEmptyState
        icon={isDomain ? <GitBranch className="h-6 w-6" /> : <FolderTree className="h-6 w-6" />}
        title={title}
        description={description}
        action={(
          <Button asChild>
            <Link to={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      />
    </div>
  )
}
