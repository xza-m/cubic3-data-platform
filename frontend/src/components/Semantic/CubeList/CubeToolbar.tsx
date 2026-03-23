import { Blocks, Eye, PlusCircle, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SemanticFilterChips, SemanticToolbar, SemanticToolbarGroup } from '@/components/Semantic/SemanticToolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type {
  CubeBindingFilter,
  CubeDomainFilter,
  CubeFocusFilter,
  CubeStatusFilter,
} from './cubeListUtils'

type ObjectKind = 'cube' | 'view'

interface CubeToolbarProps {
  kind: ObjectKind
  query: string
  total: number
  focus: CubeFocusFilter
  status: CubeStatusFilter
  binding: CubeBindingFilter
  domain: CubeDomainFilter
  focusCounts: Record<CubeFocusFilter, number>
  onKindChange: (value: ObjectKind) => void
  onQueryChange: (value: string) => void
  onFocusChange: (value: CubeFocusFilter) => void
  onStatusChange: (value: CubeStatusFilter) => void
  onBindingChange: (value: CubeBindingFilter) => void
  onDomainChange: (value: CubeDomainFilter) => void
}

export function CubeToolbar({
  kind,
  query,
  total,
  focus,
  status,
  binding,
  domain,
  focusCounts,
  onKindChange,
  onQueryChange,
  onFocusChange,
  onStatusChange,
  onBindingChange,
  onDomainChange,
}: CubeToolbarProps) {
  return (
    <SemanticToolbar>
      <div className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SemanticToolbarGroup>
            <div className="flex rounded-full border border-[hsl(var(--workbench-outline))] bg-white/94 p-1">
              {([
                { value: 'cube', label: 'Cube', icon: Blocks },
                { value: 'view', label: 'View', icon: Eye },
              ] as const).map((item) => {
                const Icon = item.icon
                const active = kind === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onKindChange(item.value)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                      active
                        ? 'bg-[hsl(var(--workbench-accent))] text-white'
                        : 'text-[hsl(var(--workbench-muted-foreground))] hover:text-[hsl(var(--workbench-ink))]',
                    )}
                    data-testid={`cube-toolbar-kind-${item.value}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                )
              })}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--workbench-outline))] bg-white/88 px-3 py-1.5 text-xs text-[hsl(var(--workbench-muted-foreground))]">
              {kind === 'cube' ? `${total} 个模型` : `${total} 个 View`}
            </span>
          </SemanticToolbarGroup>

          <SemanticToolbarGroup className="w-full justify-end xl:w-auto">
            <div className="relative min-w-0 flex-1 xl:w-[22rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
              <Input
                name="semantic_object_search"
                autoComplete="off"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={kind === 'cube' ? '搜索 Cube、领域或来源绑定…' : '搜索 View 名称或说明…'}
                className="h-10 rounded-xl border-[hsl(var(--workbench-outline))] bg-white pl-9"
                data-testid="cube-management-search"
              />
            </div>
            {kind === 'cube' ? (
              <Button asChild className="h-10 rounded-xl px-4">
                <Link to="/semantic/cubes/new">
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  新建 Cube
                </Link>
              </Button>
            ) : null}
          </SemanticToolbarGroup>
        </div>

        {kind === 'cube' ? (
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <SemanticFilterChips
              value={focus}
              onChange={onFocusChange}
              items={[
                { value: 'all', label: '全部', count: focusCounts.all },
                { value: 'attention', label: '待处理', count: focusCounts.attention },
                { value: 'unbound', label: '未绑定', count: focusCounts.unbound },
                { value: 'undomained', label: '未归域', count: focusCounts.undomained },
                { value: 'recent', label: '最近变更', count: focusCounts.recent },
              ]}
            />

            <SemanticToolbarGroup className="xl:justify-end">
              <Select value={status} onValueChange={(value) => onStatusChange(value as CubeStatusFilter)}>
                <SelectTrigger className="h-10 min-w-[110px] rounded-xl border-[hsl(var(--workbench-outline))] bg-white/92">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="deprecated">弃用</SelectItem>
                </SelectContent>
              </Select>

              <Select value={binding} onValueChange={(value) => onBindingChange(value as CubeBindingFilter)}>
                <SelectTrigger className="h-10 min-w-[130px] rounded-xl border-[hsl(var(--workbench-outline))] bg-white/92">
                  <SelectValue placeholder="来源绑定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部绑定</SelectItem>
                  <SelectItem value="bound">已绑定</SelectItem>
                  <SelectItem value="unbound">未绑定</SelectItem>
                </SelectContent>
              </Select>

              <Select value={domain} onValueChange={(value) => onDomainChange(value as CubeDomainFilter)}>
                <SelectTrigger className="h-10 min-w-[120px] rounded-xl border-[hsl(var(--workbench-outline))] bg-white/92">
                  <SelectValue placeholder="领域归属" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部领域</SelectItem>
                  <SelectItem value="in_domain">已归域</SelectItem>
                  <SelectItem value="out_domain">未归域</SelectItem>
                </SelectContent>
              </Select>
            </SemanticToolbarGroup>
          </div>
        ) : null}
      </div>
    </SemanticToolbar>
  )
}
