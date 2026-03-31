import { FilterX, Search } from 'lucide-react'
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
import type {
  CubeDomainFilter,
  CubeFocusFilter,
  CubeSortOption,
  CubeStatusFilter,
  CubeTypeFilter,
} from './cubeListUtils'

interface CubeToolbarProps {
  query: string
  focus: CubeFocusFilter
  status: CubeStatusFilter
  cubeType: CubeTypeFilter
  domain: CubeDomainFilter
  sort: CubeSortOption
  onQueryChange: (value: string) => void
  onFocusChange: (value: CubeFocusFilter) => void
  onStatusChange: (value: CubeStatusFilter) => void
  onCubeTypeChange: (value: CubeTypeFilter) => void
  onDomainChange: (value: CubeDomainFilter) => void
  onSortChange: (value: CubeSortOption) => void
  onResetFilters: () => void
}

export function CubeToolbar({
  query,
  focus,
  status,
  cubeType,
  domain,
  sort,
  onQueryChange,
  onFocusChange,
  onStatusChange,
  onCubeTypeChange,
  onDomainChange,
  onSortChange,
  onResetFilters,
}: CubeToolbarProps) {
  return (
    <SemanticToolbar className="px-4 py-2.5">
      <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-[14rem] xl:max-w-[18rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--workbench-muted-foreground))]" />
            <Input
              name="semantic_object_search"
              autoComplete="off"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索标题、名称或编码"
              className="h-8 rounded-[var(--workbench-radius-sm)] border-[hsl(var(--workbench-outline))] bg-white pl-8 text-[12px]"
              data-testid="cube-management-search"
            />
          </div>

          <SemanticFilterChips
            value={focus}
            onChange={onFocusChange}
            size="compact"
            className="flex-nowrap gap-1 overflow-x-auto pb-0.5"
            items={[
              { value: 'all', label: '全部' },
              { value: 'attention', label: '待处理' },
              { value: 'unbound', label: '未绑定' },
              { value: 'undomained', label: '未纳域' },
              { value: 'recent', label: '最近更新' },
            ]}
          />
        </div>

        <SemanticToolbarGroup className="gap-1.5 overflow-x-auto pb-0.5 xl:flex-nowrap xl:justify-end xl:pb-0">
          <Select value={cubeType} onValueChange={(value) => onCubeTypeChange(value as CubeTypeFilter)}>
            <SelectTrigger className="h-8 min-w-[98px] shrink-0 rounded-[var(--workbench-radius-sm)] border-[hsl(var(--workbench-outline))] bg-white/92 px-2 text-[11px]">
              <SelectValue placeholder="类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="fact">事实模型</SelectItem>
              <SelectItem value="dimension">维度模型</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(value) => onStatusChange(value as CubeStatusFilter)}>
            <SelectTrigger className="h-8 min-w-[96px] shrink-0 rounded-[var(--workbench-radius-sm)] border-[hsl(var(--workbench-outline))] bg-white/92 px-2 text-[11px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="active">已发布</SelectItem>
              <SelectItem value="deprecated">已废弃</SelectItem>
            </SelectContent>
          </Select>

          <Select value={domain} onValueChange={(value) => onDomainChange(value as CubeDomainFilter)}>
            <SelectTrigger className="h-8 min-w-[102px] shrink-0 rounded-[var(--workbench-radius-sm)] border-[hsl(var(--workbench-outline))] bg-white/92 px-2 text-[11px]">
              <SelectValue placeholder="领域" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部领域</SelectItem>
              <SelectItem value="in_domain">已纳入领域</SelectItem>
              <SelectItem value="out_domain">未纳入领域</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => onSortChange(value as CubeSortOption)}>
            <SelectTrigger className="h-8 min-w-[110px] shrink-0 rounded-[var(--workbench-radius-sm)] border-[hsl(var(--workbench-outline))] bg-white/92 px-2 text-[11px]">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">待处理优先</SelectItem>
              <SelectItem value="updated_desc">最近更新</SelectItem>
              <SelectItem value="name_asc">名称</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="h-8 w-8 shrink-0 rounded-lg p-0 text-[hsl(var(--workbench-muted-foreground))]"
            aria-label="清空筛选"
            title="清空筛选"
          >
            <FilterX className="h-3.5 w-3.5" />
          </Button>
        </SemanticToolbarGroup>
      </div>
    </SemanticToolbar>
  )
}
