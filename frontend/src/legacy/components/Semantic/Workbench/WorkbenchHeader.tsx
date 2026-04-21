import { ChevronRight, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type WorkspaceTab = 'modeling' | 'preview' | 'yaml' | 'python'

const tabItems: Array<{ key: WorkspaceTab; label: string }> = [
  { key: 'modeling', label: '建模' },
  { key: 'preview', label: '预览' },
  { key: 'yaml', label: 'YAML' },
  { key: 'python', label: 'Python' },
]

function getStatusLabel(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return '已发布'
  if (normalized === 'draft') return '草稿'
  if (normalized === 'deprecated') return '已废弃'
  return '未标记'
}

function getStatusVariant(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'default'
  if (normalized === 'deprecated') return 'destructive'
  return 'secondary'
}

export function WorkbenchHeader({
  cube,
  activeTab,
  onTabChange,
}: {
  cube: CubeSummary
  activeTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}) {
  return (
    <div>
      <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex items-center gap-1.5 text-sm">
          <Link to="/semantic/workbench" className="text-slate-500 hover:text-slate-700">语义工作台</Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium text-slate-900">{cube.title || cube.name}</span>
          <span className="ml-1 font-mono text-xs text-slate-400">{cube.name}</span>
          <Badge variant={getStatusVariant(cube.status)} className="ml-2">{getStatusLabel(cube.status)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/semantic/cubes/${cube.name}`}>
              <Rocket className="mr-1.5 h-3.5 w-3.5" />
              发布
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex h-10 items-center gap-0 border-b border-slate-200 px-4">
        {tabItems.map((item) => {
          const isActive = activeTab === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              data-testid={`devtools-tab-${item.key}`}
              data-state={isActive ? 'active' : 'inactive'}
              className={cn(
                'relative h-10 px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'text-slate-900'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-600" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
